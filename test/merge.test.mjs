import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.mjs";
import { merge, parseEntry } from "../commands/merge.mjs";
import { makeRepo, branchWithChange, git } from "./helpers.mjs";

const PASS = "node -e \"process.exit(0)\"";
const FAIL = "node -e \"process.exit(3)\"";

test("parseEntry splits branch and message and rejects a missing message", () => {
  assert.deepEqual(parseEntry("t01-x|T01: Do it"), { branch: "t01-x", message: "T01: Do it" });
  assert.throws(() => parseEntry("t01-x"));
});

test("a passing gate commits each branch as its own squash commit", () => {
  const t = makeRepo({ gate: { mode: "warn", commands: [PASS] } });
  try {
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    branchWithChange(t.repo, "b", "b.txt", "b\n");
    const r = merge(loadConfig(t.repo), [parseEntry("a|T01: Add a"), parseEntry("b|T02: Add b")]);
    assert.equal(r.ok, true, r.message);
    assert.deepEqual(git(t.repo, "log", "--format=%s", "-2").split("\n"), ["T02: Add b", "T01: Add a"]);
    assert.match(r.message, /gate passed/);
  } finally { t.cleanup(); }
});

test("warn mode commits on a failing gate, marks the commit and logs the failure", () => {
  const t = makeRepo({ gate: { mode: "warn", commands: [FAIL] } });
  try {
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    const r = merge(loadConfig(t.repo), [parseEntry("a|T01: Add a")]);
    assert.equal(r.ok, true);
    assert.match(r.message, /GATE FAILED/);
    assert.match(git(t.repo, "log", "-1", "--format=%B"), /Gate failed at merge/);
    assert.ok(existsSync(join(t.repo, "a.txt")));
    assert.match(readFileSync(join(t.repo, ".swarm", "gate-failures.log"), "utf8"), /a ->/);
  } finally { t.cleanup(); }
});

test("block mode commits nothing on a failing gate and resets", () => {
  const t = makeRepo({ gate: { mode: "block", commands: [FAIL] } });
  try {
    const before = git(t.repo, "rev-parse", "HEAD");
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    const r = merge(loadConfig(t.repo), [parseEntry("a|T01: Add a")]);
    assert.equal(r.ok, false);
    assert.match(r.message, /NOT COMMITTED/);
    assert.equal(git(t.repo, "rev-parse", "HEAD"), before);
    assert.equal(existsSync(join(t.repo, "a.txt")), false);
  } finally { t.cleanup(); }
});

test("--gate overrides the configured mode", () => {
  const t = makeRepo({ gate: { mode: "warn", commands: [FAIL] } });
  try {
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    const r = merge(loadConfig(t.repo), [parseEntry("a|T01: Add a")], { gateMode: "block" });
    assert.equal(r.ok, false);
  } finally { t.cleanup(); }
});

test("a conflict stops the batch and leaves the branch as it was before the merge", () => {
  const t = makeRepo();
  try {
    const before = git(t.repo, "rev-parse", "HEAD");
    branchWithChange(t.repo, "a", "app.txt", "from a\n");
    branchWithChange(t.repo, "b", "app.txt", "from b\n");
    const r = merge(loadConfig(t.repo), [parseEntry("a|T01: A"), parseEntry("b|T02: B")]);
    assert.equal(r.ok, false);
    assert.match(r.message, /conflicts in app\.txt/);
    assert.equal(git(t.repo, "rev-parse", "HEAD"), before);
    assert.equal(git(t.repo, "status", "--porcelain", "--untracked-files=no"), "");
  } finally { t.cleanup(); }
});

test("refuses to merge when the checkout is on another branch", () => {
  const t = makeRepo();
  try {
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    git(t.repo, "checkout", "-q", "a");
    const r = merge(loadConfig(t.repo), [parseEntry("a|T01: A")]);
    assert.equal(r.ok, false);
    assert.match(r.message, /not "main"/);
  } finally { t.cleanup(); }
});

test("refuses to merge over uncommitted changes to tracked files, but ignores untracked ones", () => {
  const t = makeRepo();
  try {
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    writeFileSync(join(t.repo, "notes.txt"), "owner notes\n");
    assert.equal(merge(loadConfig(t.repo), [parseEntry("a|T01: A")]).ok, true);
    branchWithChange(t.repo, "b", "b.txt", "b\n");
    writeFileSync(join(t.repo, "app.txt"), "edited by hand\n");
    const r = merge(loadConfig(t.repo), [parseEntry("b|T02: B")]);
    assert.equal(r.ok, false);
    assert.match(r.message, /tracked files have changes/);
  } finally { t.cleanup(); }
});

test("an already merged branch is skipped, not committed empty", () => {
  const t = makeRepo();
  try {
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    merge(loadConfig(t.repo), [parseEntry("a|T01: A")]);
    const r = merge(loadConfig(t.repo), [parseEntry("a|T01: A again")]);
    assert.equal(r.ok, true);
    assert.match(r.message, /nothing new/);
    assert.equal(git(t.repo, "log", "-1", "--format=%s"), "T01: A");
  } finally { t.cleanup(); }
});

test("refuses when a registered worker's worktree is on a different branch than the one named", () => {
  const t = makeRepo();
  try {
    branchWithChange(t.repo, "t01-expected", "a.txt", "a\n");
    const wt = join(t.root, "wt");
    git(t.repo, "worktree", "add", "-q", "-b", "t01-own-name", wt, "main");
    writeFileSync(join(t.repo, ".swarm", "workers.json"), JSON.stringify({
      T01: { dispatch: "d1", worktree: "wt", path: wt, branch: "t01-expected" },
    }));
    const r = merge(loadConfig(t.repo), [parseEntry("t01-expected|T01: A")]);
    assert.equal(r.ok, false);
    assert.match(r.message, /on branch "t01-own-name"/);
  } finally { t.cleanup(); }
});
