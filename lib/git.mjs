import { run } from "./run.mjs";

export function git(repo, args, opts = {}) {
  return run("git", ["-C", repo, ...args], opts);
}

export function gitOut(repo, args) {
  const r = git(repo, args);
  return r.code === 0 ? r.out.trim() : "";
}

export function currentBranch(repo) {
  return gitOut(repo, ["branch", "--show-current"]);
}

// Tracked files with changes (staged or not). Untracked files do not count: the owner may keep notes there.
export function trackedChanges(repo) {
  return gitOut(repo, ["status", "--porcelain", "--untracked-files=no"]).split("\n").filter(Boolean);
}

export function conflictedFiles(repo) {
  return gitOut(repo, ["diff", "--name-only", "--diff-filter=U"]).split("\n").filter(Boolean);
}

export function branchExists(repo, name) {
  return git(repo, ["rev-parse", "--verify", "--quiet", `refs/heads/${name}`]).code === 0;
}
