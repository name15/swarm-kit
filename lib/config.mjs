// The project's swarm config lives in <repo>/.swarm/config.json. The coordinator writes it during setup
// (SETUP.md); nobody edits it by hand. Every missing value falls back to a default here.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

export const KIT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const DEFAULTS = {
  project: "",
  integrationBranch: "",
  specsDir: "docs/specs",
  worktreeMode: "auto",
  worktreeSetup: "inherit",
  worktreeRoot: "",
  gate: { mode: "warn", install: "", commands: [] },
  workers: { agent: "opencode", max: 4, memoryFloorMB: 2500, perWorkerMB: 1100 },
  models: { default: "", routes: {} },
  ports: null,
  projectRules: [],
  deploy: { branch: "", allowPush: false },
  cleanup: { removeDirs: [] },
  devServerPattern: "",
};

export function findRepo(start = process.cwd()) {
  let dir = resolve(start);
  for (;;) {
    if (existsSync(join(dir, ".swarm", "config.json"))) return dir;
    const up = dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
}

function merge(base, extra) {
  const out = { ...base };
  for (const [key, value] of Object.entries(extra || {})) {
    const both = value && typeof value === "object" && !Array.isArray(value)
      && base[key] && typeof base[key] === "object" && !Array.isArray(base[key]);
    out[key] = both ? merge(base[key], value) : value;
  }
  return out;
}

export function loadConfig(repoArg) {
  const repo = repoArg ? resolve(repoArg) : findRepo();
  if (!repo) throw new Error("No .swarm/config.json found here or above. Run the setup first (SETUP.md).");
  const file = join(repo, ".swarm", "config.json");
  if (!existsSync(file)) throw new Error(`Missing ${file}. Run the setup first (SETUP.md).`);
  const raw = JSON.parse(readFileSync(file, "utf8"));
  const cfg = merge(DEFAULTS, raw);
  if (!cfg.integrationBranch) throw new Error("config.integrationBranch is missing.");
  if (!cfg.worktreeRoot) cfg.worktreeRoot = join(dirname(repo), `${basename(repo)}-worktrees`);
  if (!["warn", "block"].includes(cfg.gate.mode)) throw new Error(`config.gate.mode must be "warn" or "block".`);
  if (!["auto", "orca", "git"].includes(cfg.worktreeMode)) throw new Error(`config.worktreeMode must be "auto", "orca" or "git".`);
  return { repo, cfg, swarmDir: join(repo, ".swarm") };
}

export function saveConfig(repo, cfg) {
  mkdirSync(join(repo, ".swarm"), { recursive: true });
  writeFileSync(join(repo, ".swarm", "config.json"), `${JSON.stringify(cfg, null, 2)}\n`, "utf8");
}
