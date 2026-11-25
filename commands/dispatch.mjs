// Starts one worker: its spec plus the kit's standing rules plus the project's rules, in its own git worktree.
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { KIT } from "../lib/config.mjs";
import { git, branchExists } from "../lib/git.mjs";
import { orca, findKey } from "../lib/orca.mjs";
import { readWorkers, setWorker } from "../lib/registry.mjs";
import { freeMemoryMB } from "../lib/machine.mjs";

export function slug(text) {
  return String(text).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 32);
}

// Port block n gives each named port base + n * step + its index.
export function portsFor(ports, blockIndex) {
  if (!ports || !Array.isArray(ports.names) || !ports.names.length) return null;
  const step = ports.step || ports.names.length;
  return Object.fromEntries(ports.names.map((name, i) => [name, ports.base + blockIndex * step + i]));
}

export function freePortBlock(workers) {
  const used = new Set(Object.values(workers).map((w) => w.portBlock).filter((n) => n != null));
  let n = 0;
  while (used.has(n)) n += 1;
  return n;
}

export function buildSpec({ id, specText, footer, rules = [], ports = null, resume = "" }) {
  const parts = [];
  if (resume) {
    parts.push(`RESUME NOTE FROM THE COORDINATOR (read this first): an earlier agent worked on this task in this same `
      + `worktree. Its commits and files are still here. Do not start over: run git status and git log, work out what `
      + `is done, then continue. ${resume}`, "");
  }
  parts.push(specText.trim(), footer.trimEnd());
  if (rules.length) parts.push("", "PROJECT RULES:", ...rules.map((r) => `- ${r}`));
  if (ports) {
    const list = Object.entries(ports).map(([k, v]) => `${k}=${v}`).join(" ");
    parts.push(`- YOUR PORTS: ${list}. Use only these; never kill processes you did not start.`);
  }
  parts.push(`- YOUR TASK ID is ${id}.`);
  return `${parts.join("\n")}\n`;
}

// Orca only finds worktrees of repos registered with it, and hides worktrees it did not create itself unless the
// repo says to show them. The kit creates worktrees with git, so make sure of both before every dispatch.
export function ensureOrcaRepo(repo) {
  const selector = `path:${repo}`;
  const shown = orca(["repo", "show", "--repo", selector]);
  if (!shown.ok) {
    const added = orca(["repo", "add", "--path", repo]);
    if (!added.ok) return `could not register the repo with Orca: ${(added.err || added.out).trim().slice(0, 300)}`;
  }
  const set = orca(["repo", "set", "--repo", selector, "--external-worktree-visibility", "show"]);
  return set.ok ? null : `could not make the repo's git worktrees visible to Orca: ${(set.err || set.out).trim().slice(0, 300)}`;
}

// A new worktree for a worker. Orca creates it as a child of the coordinator's checkout, so it nests under it in
// Orca's sidebar; if Orca cannot (it once failed because it prefixes branch names with the git user name, which
// equalled the integration branch), fall back to `git worktree add`. worktreeMode "orca" or "git" forces one.
export function createWorktree(repo, cfg, name) {
  let note = "";
  if (cfg.worktreeMode !== "git") {
    const r = orca(["worktree", "create", "--name", name, "--repo", `path:${repo}`, "--base-branch", cfg.integrationBranch,
      "--parent-worktree", `path:${repo}`, "--setup", cfg.worktreeSetup]);
    const path = findKey(r.data, "path");
    if (r.ok && path) {
      const branch = String(findKey(r.data, "branch") || name).replace(/^refs\/heads\//, "");
      return { path, branch, via: "orca", note };
    }
    const why = (r.err || r.out).trim().slice(0, 200) || "no worktree path in Orca's answer";
    if (cfg.worktreeMode === "orca") throw new Error(`orca worktree create failed: ${why}`);
    note = ` (Orca could not create the worktree, so git did: ${why})`;
  }
  const path = join(cfg.worktreeRoot, name);
  if (!existsSync(path)) {
    mkdirSync(cfg.worktreeRoot, { recursive: true });
    const args = branchExists(repo, name)
      ? ["worktree", "add", path, name]
      : ["worktree", "add", "-b", name, path, cfg.integrationBranch];
    const r = git(repo, args);
    if (r.code !== 0) throw new Error(`git worktree add failed: ${r.err.trim()}`);
  }
  return { path, branch: name, via: "git", note };
}

export function dispatch(ctx, opts) {
  const { repo, cfg, swarmDir } = ctx;
  const id = opts.id;
  if (!id || !opts.title) throw new Error("dispatch needs --id and --title.");
  const specFile = join(repo, cfg.specsDir, `${id}.md`);
  if (!existsSync(specFile)) throw new Error(`Spec not found: ${specFile}`);

  const workers = readWorkers(swarmDir);
  if (workers[id] && !opts.resume) throw new Error(`${id} is already running (use --resume "<note>" to restart it).`);
  const others = Object.keys(workers).filter((k) => k !== id).length;
  const free = freeMemoryMB();
  const warnings = [];
  if (others >= cfg.workers.max) warnings.push(`${others} workers already running; the cap is ${cfg.workers.max}.`);
  if (free < cfg.workers.memoryFloorMB + cfg.workers.perWorkerMB) {
    warnings.push(`free memory ${free} MB is below the floor ${cfg.workers.memoryFloorMB} MB plus one worker.`);
  }
  if (warnings.length && !opts.force) {
    return { ok: false, message: `NOT DISPATCHED: ${warnings.join(" ")} Pass --force to dispatch anyway.` };
  }

  const repoProblem = ensureOrcaRepo(repo);
  if (repoProblem) return { ok: false, message: `FAILED to start ${id}: ${repoProblem}` };

  const name = opts.worktree || workers[id]?.worktree || `${id.toLowerCase()}-${slug(opts.title)}`;
  const existing = workers[id] && existsSync(workers[id].path) ? workers[id] : null;
  const wt = existing
    ? { path: existing.path, branch: existing.branch, via: existing.via || "existing", note: "" }
    : createWorktree(repo, cfg, name);
  const path = wt.path;

  const portBlock = workers[id]?.portBlock ?? (cfg.ports ? freePortBlock(workers) : null);
  const footer = readFileSync(join(KIT, "footer.md"), "utf8");
  const spec = buildSpec({
    id,
    specText: readFileSync(specFile, "utf8"),
    footer,
    rules: cfg.projectRules,
    ports: portBlock == null ? null : portsFor(cfg.ports, portBlock),
    resume: opts.resume || "",
  });

  const agent = opts.agent || cfg.workers.agent;
  const model = opts.model || cfg.models.routes?.[opts.route] || cfg.models.default || "";
  const args = ["orchestration", "worker-start", "--spec", spec, "--task-title", `${id} ${opts.title}`,
    "--worktree", `path:${path}`, "--agent", agent, ...(model ? ["--model", model] : [])];
  const r = orca(args);
  const dispatchId = findKey(r.data, "dispatchId");
  if (!r.ok || !dispatchId) {
    return { ok: false, message: `FAILED to start ${id}: ${(r.err || r.out).trim().slice(0, 400)}` };
  }
  setWorker(swarmDir, id, {
    dispatch: dispatchId, worktree: name, path, branch: wt.branch, via: wt.via, agent, model, portBlock,
    title: opts.title, started: new Date().toISOString(),
  });
  const note = warnings.length ? ` (forced past: ${warnings.join(" ")})` : "";
  return { ok: true, message: `${id}: dispatch=${dispatchId} worktree=${name} branch=${wt.branch} via=${wt.via}`
    + `${model ? ` model=${model}` : ""}${note}${wt.note}` };
}
