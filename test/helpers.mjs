// Throwaway git repos and a fake Orca for the tests. Nothing here touches a real worker or the network.
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { run } from "../lib/run.mjs";

const here = dirname(fileURLToPath(import.meta.url));

export function git(repo, ...args) {
  const r = run("git", ["-C", repo, ...args]);
  if (r.code !== 0) throw new Error(`git ${args.join(" ")}: ${r.err}`);
  return r.out.trim();
}

export function makeRepo(config = {}) {
  const root = mkdtempSync(join(tmpdir(), "swarm-test-"));
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(repo, "init", "-q", "-b", "main");
  git(repo, "config", "user.name", "Test");
  git(repo, "config", "user.email", "test@example.com");
  git(repo, "config", "commit.gpgsign", "false");
  writeFileSync(join(repo, "app.txt"), "one\n");
  mkdirSync(join(repo, "docs", "specs"), { recursive: true });
  writeFileSync(join(repo, "docs", "specs", "T01.md"), "# T01: Do the thing\n\nDo it well.\n");
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", "init");
  mkdirSync(join(repo, ".swarm"));
  writeFileSync(join(repo, ".git", "info", "exclude"), ".swarm/\n");
  const cfg = { project: "test", integrationBranch: "main", worktreeRoot: join(root, "worktrees"),
    gate: { mode: "warn", commands: ["node -e \"process.exit(0)\""] }, ...config };
  writeFileSync(join(repo, ".swarm", "config.json"), JSON.stringify(cfg, null, 2));
  return { root, repo, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

// A branch off main with one commit changing a file.
export function branchWithChange(repo, branch, file, text) {
  git(repo, "checkout", "-q", "-b", branch, "main");
  writeFileSync(join(repo, file), text);
  git(repo, "add", "-A");
  git(repo, "commit", "-q", "-m", `change ${file}`);
  git(repo, "checkout", "-q", "main");
}

export function fakeOrca(responses = {}) {
  const dir = mkdtempSync(join(tmpdir(), "fake-orca-"));
  writeFileSync(join(dir, "responses.json"), JSON.stringify(responses));
  process.env.ORCA_BIN = join(here, "fake-orca.mjs");
  process.env.FAKE_ORCA_DIR = dir;
  return {
    calls: () => (existsSync(join(dir, "calls.jsonl"))
      ? readFileSync(join(dir, "calls.jsonl"), "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l))
      : []),
    done: () => { delete process.env.ORCA_BIN; delete process.env.FAKE_ORCA_DIR; rmSync(dir, { recursive: true, force: true }); },
  };
}
