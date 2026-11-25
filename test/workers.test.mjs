import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.mjs";
import { send, answer, cleanup } from "../commands/workers.mjs";
import { readWorkers, setWorker } from "../lib/registry.mjs";
import { makeRepo, fakeOrca, git } from "./helpers.mjs";

const SHOW = { "orchestration worker-show": { ok: true, result: { dispatch: { agentTerminalHandle: "term_9" } } } };
const tail = (lines) => ({ "orchestration worker-read": { ok: true, result: { terminal: { tail: lines } } } });

function withWorker(t, extra = {}) {
  const ctx = loadConfig(t.repo);
  const path = join(t.root, "wt");
  git(t.repo, "worktree", "add", "-q", "-b", "t01-x", path, "main");
  setWorker(ctx.swarmDir, "T01", { dispatch: "ctx_1", worktree: "wt", path, branch: "t01-x", ...extra });
  return { ctx, path };
}

test("send types the message into the worker's own terminal and reports delivery", () => {
  const t = makeRepo();
  const orca = fakeOrca({ ...SHOW, ...tail(["working"]), "terminal send": "{\"accepted\": true, \"turn_started\": true}" });
  try {
    const { ctx } = withWorker(t);
    const r = send(ctx, "T01", "Please also add a test.");
    assert.equal(r.ok, true);
    assert.match(r.message, /delivered/);
    const call = orca.calls().find((c) => c[0] === "terminal");
    assert.equal(call[1], "send");
    assert.equal(call[call.indexOf("--terminal") + 1], "term_9");
    assert.equal(call[call.indexOf("--text") + 1], "Please also add a test.");
    assert.ok(call.includes("--enter"));
  } finally { orca.done(); t.cleanup(); }
});

test("send refuses while the worker shows a permission prompt, unless forced", () => {
  const t = makeRepo();
  const orca = fakeOrca({ ...SHOW, ...tail(["Permission required", "Allow once"]), "terminal send": "{\"accepted\": true}" });
  try {
    const { ctx } = withWorker(t);
    const refused = send(ctx, "T01", "hello");
    assert.equal(refused.ok, false);
    assert.match(refused.message, /permission prompt/);
    assert.equal(orca.calls().some((c) => c[0] === "terminal"), false);
    assert.equal(send(ctx, "T01", "hello", { force: true }).ok, true);
  } finally { orca.done(); t.cleanup(); }
});

test("a swallowed message is retried with Orca's retry id", () => {
  const t = makeRepo();
  const orca = fakeOrca({ ...SHOW, ...tail(["ok"]),
    "terminal send": ["swallowed, retry-request 1234-abcd", "{\"accepted\": true, \"turn_started\": true}"] });
  try {
    const { ctx } = withWorker(t);
    assert.equal(send(ctx, "T01", "hi").ok, true);
    const sends = orca.calls().filter((c) => c[0] === "terminal");
    assert.equal(sends.length, 2);
    assert.equal(sends[1][sends[1].indexOf("--retry-request") + 1], "1234-abcd");
  } finally { orca.done(); t.cleanup(); }
});

test("answer replies on Orca's question channel and in the terminal", () => {
  const t = makeRepo();
  const orca = fakeOrca({ ...SHOW, ...tail(["ok"]), "terminal send": "{\"accepted\": true, \"turn_started\": true}" });
  try {
    const { ctx } = withWorker(t);
    answer(ctx, "T01", "msg_7", "Yes, edit that file.");
    const calls = orca.calls();
    const reply = calls.find((c) => c[1] === "reply");
    assert.equal(reply[reply.indexOf("--id") + 1], "msg_7");
    const typed = calls.find((c) => c[0] === "terminal");
    assert.match(typed[typed.indexOf("--text") + 1], /Coordinator answer: Yes, edit that file\./);
  } finally { orca.done(); t.cleanup(); }
});

test("cleanup archives the branch, removes the worktree and forgets the worker", () => {
  const t = makeRepo({ cleanup: { removeDirs: [".cache"] } });
  const orca = fakeOrca();
  try {
    const { ctx, path } = withWorker(t);
    writeFileSync(join(path, "work.txt"), "done\n");
    git(path, "add", "-A");
    git(path, "commit", "-q", "-m", "work");
    const tip = git(path, "rev-parse", "HEAD");
    const r = cleanup(ctx, "T01");
    assert.equal(r.ok, true, r.message);
    assert.equal(git(t.repo, "rev-parse", "archive/t01-x"), tip);
    assert.equal(existsSync(path), false);
    assert.deepEqual(readWorkers(ctx.swarmDir), {});
    assert.ok(orca.calls().some((c) => c[1] === "worker-release"));
  } finally { orca.done(); t.cleanup(); }
});

test("cleanup keeps a worktree with uncommitted changes to tracked files", () => {
  const t = makeRepo();
  const orca = fakeOrca();
  try {
    const { ctx, path } = withWorker(t);
    writeFileSync(join(path, "app.txt"), "edited, not committed\n");
    const r = cleanup(ctx, "T01", { discardUntracked: true });
    assert.equal(r.ok, false);
    assert.match(r.message, /tracked files: app\.txt/);
    assert.ok(existsSync(path));
    assert.ok(readWorkers(ctx.swarmDir).T01);
  } finally { orca.done(); t.cleanup(); }
});

test("cleanup removes .tmp and listed caches, names other untracked files, and discards them only on request", () => {
  const t = makeRepo({ cleanup: { removeDirs: [".cache"] } });
  const orca = fakeOrca();
  try {
    const { ctx, path } = withWorker(t);
    for (const dir of [".tmp", ".cache"]) { mkdirSync(join(path, dir)); writeFileSync(join(path, dir, "x.log"), "x"); }
    writeFileSync(join(path, "draft.md"), "unsaved draft\n");
    const kept = cleanup(ctx, "T01");
    assert.equal(kept.ok, false);
    assert.match(kept.message, /untracked files: draft\.md/);
    assert.equal(existsSync(join(path, ".tmp")), false);
    assert.equal(existsSync(join(path, ".cache")), false);
    const removed = cleanup(ctx, "T01", { discardUntracked: true });
    assert.equal(removed.ok, true, removed.message);
    assert.equal(existsSync(path), false);
  } finally { orca.done(); t.cleanup(); }
});
