// Squash-merges finished task branches into the integration branch and runs the project's gate.
// gate.mode "warn" (default): a failing gate still commits, says so in the commit message and in
// .swarm/gate-failures.log, so the coordinator fixes it in the next real test run.
// gate.mode "block": a failing gate commits nothing and resets to where the merge started.
// Conflicts always stop: they cannot be committed.
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { git, gitOut, currentBranch, trackedChanges, conflictedFiles } from "../lib/git.mjs";
import { shell } from "../lib/run.mjs";
import { readWorkers } from "../lib/registry.mjs";

export function parseEntry(entry) {
  const i = entry.indexOf("|");
  if (i < 1 || i === entry.length - 1) throw new Error(`"${entry}" must be "branch|commit message".`);
  return { branch: entry.slice(0, i).trim(), message: entry.slice(i + 1).trim() };
}

function runGate(ctx, runId) {
  const { repo, cfg, swarmDir } = ctx;
  const logDir = join(swarmDir, "logs");
  mkdirSync(logDir, { recursive: true });
  const steps = [...(cfg.gate.install ? [cfg.gate.install] : []), ...cfg.gate.commands];
  const failed = [];
  steps.forEach((command, i) => {
    const r = shell(command, { cwd: repo });
    writeFileSync(join(logDir, `merge-${runId}-${i}.log`), `$ ${command}\n${r.out}\n${r.err}`, "utf8");
    if (r.code !== 0) failed.push(command);
  });
  return { failed, logs: `.swarm/logs/merge-${runId}-*.log` };
}

// A branch named in the registry must be the branch its worktree is on: a worker once committed to a branch it
// named itself, and the merge of the expected one was empty.
function checkWorktreeBranch(ctx, branch) {
  const worker = Object.values(readWorkers(ctx.swarmDir)).find((w) => w.branch === branch);
  if (!worker) return null;
  const actual = gitOut(worker.path, ["branch", "--show-current"]);
  return actual && actual !== branch
    ? `worker ${worker.worktree} is on branch "${actual}", not "${branch}". Merge "${actual}" instead?`
    : null;
}

export function merge(ctx, entries, opts = {}) {
  const { repo, cfg, swarmDir } = ctx;
  const mode = opts.gateMode || cfg.gate.mode;
  const runId = new Date().toISOString().replace(/[-:T]/g, "").slice(4, 14);
  const lines = [];
  const stop = (message) => ({ ok: false, committed: [], message: [...lines, message].join("\n") });

  if (currentBranch(repo) !== cfg.integrationBranch) {
    return stop(`STOP: the checkout is on "${currentBranch(repo)}", not "${cfg.integrationBranch}".`);
  }
  const dirty = trackedChanges(repo);
  if (dirty.length) return stop(`STOP: tracked files have changes; commit or discard them first:\n  ${dirty.join("\n  ")}`);
  for (const { branch } of entries) {
    const wrong = checkWorktreeBranch(ctx, branch);
    if (wrong) return stop(`STOP: ${wrong}`);
  }

  const base = gitOut(repo, ["rev-parse", "HEAD"]);
  const committed = [];
  for (const { branch, message } of entries) {
    git(repo, ["merge", "--squash", branch]);
    const conflicts = conflictedFiles(repo);
    if (conflicts.length) {
      git(repo, ["reset", "-q", "--hard", base]);
      return stop(`STOP: ${branch} conflicts in ${conflicts.join(", ")}. Nothing was committed; ${branch} must merge `
        + `${cfg.integrationBranch} and resolve them.`);
    }
    if (!gitOut(repo, ["diff", "--cached", "--name-only"])) {
      lines.push(`note: ${branch} has nothing new for ${cfg.integrationBranch}; skipped.`);
      continue;
    }
    const r = git(repo, ["commit", "-q", "-m", message]);
    if (r.code !== 0) {
      git(repo, ["reset", "-q", "--hard", base]);
      return stop(`STOP: commit failed for ${branch}: ${r.err.trim()}`);
    }
    committed.push({ branch, commit: gitOut(repo, ["rev-parse", "--short", "HEAD"]), message });
  }
  if (!committed.length) return { ok: true, committed, message: [...lines, "Nothing to merge."].join("\n") };

  const gate = runGate(ctx, runId);
  if (!gate.failed.length) {
    lines.push(...committed.map((c) => `${c.commit} ${c.message}`), `gate passed (${cfg.gate.commands.length} commands)`);
    return { ok: true, committed, gateFailed: [], message: lines.join("\n") };
  }

  if (mode === "block") {
    git(repo, ["reset", "-q", "--hard", base]);
    return stop(`NOT COMMITTED: gate failed (${gate.failed.join("; ")}); reset to ${base.slice(0, 7)}. Logs: ${gate.logs}`);
  }
  // warn: keep the commits, mark the last one and log the failure.
  const last = committed[committed.length - 1];
  git(repo, ["commit", "-q", "--amend", "-m", `${last.message}\n\nGate failed at merge: ${gate.failed.join("; ")}`]);
  last.commit = gitOut(repo, ["rev-parse", "--short", "HEAD"]);
  appendFileSync(join(swarmDir, "gate-failures.log"),
    `${new Date().toISOString()} ${committed.map((c) => c.branch).join(", ")} -> ${last.commit}: ${gate.failed.join("; ")}\n`);
  lines.push(...committed.map((c) => `${c.commit} ${c.message}`),
    `WARNING: GATE FAILED (${gate.failed.join("; ")}). Committed anyway (gate mode "warn"); fix it in the next test run.`,
    `Logs: ${gate.logs}; recorded in .swarm/gate-failures.log`);
  return { ok: true, committed, gateFailed: gate.failed, message: lines.join("\n") };
}
