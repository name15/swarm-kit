import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { loadConfig } from "../lib/config.mjs";
import { dispatch, buildSpec, portsFor, freePortBlock, slug } from "../commands/dispatch.mjs";
import { readWorkers } from "../lib/registry.mjs";
import { makeRepo, fakeOrca, git } from "./helpers.mjs";

const STARTED = { "orchestration worker-start": { ok: true, result: { taskId: "task_1", dispatchId: "ctx_1" } } };

test("buildSpec puts the spec, footer, project rules, ports and task ID in order", () => {
  const spec = buildSpec({ id: "T01", specText: "# T01\nDo it.", footer: "\nSTANDING RULES:\n- rule",
    rules: ["Use the shared types."], ports: { SERVER_PORT: 8100 } });
  const order = ["# T01", "STANDING RULES", "PROJECT RULES:", "- Use the shared types.", "SERVER_PORT=8100", "YOUR TASK ID is T01"]
    .map((s) => spec.indexOf(s));
  assert.deepEqual([...order].sort((a, b) => a - b), order);
  assert.ok(order.every((i) => i >= 0));
});

test("buildSpec puts a resume note first", () => {
  assert.match(buildSpec({ id: "T01", specText: "x", footer: "", resume: "Finish the tests." }), /^RESUME NOTE.*Finish the tests\./s);
});

test("port blocks are numbered per worker and the first free one is reused", () => {
  assert.deepEqual(portsFor({ base: 8100, step: 10, names: ["A", "B"] }, 2), { A: 8120, B: 8121 });
  assert.equal(portsFor(null, 0), null);
  assert.equal(freePortBlock({ T1: { portBlock: 0 }, T2: { portBlock: 2 } }), 1);
});

test("slug makes a short worktree-safe name", () => {
  assert.equal(slug("Fix the Cover: phones & tablets!"), "fix-the-cover-phones-tablets");
});

test("dispatch creates the worktree, starts the worker in it and records it", () => {
  const t = makeRepo({ projectRules: ["Rule one."], models: { default: "", routes: { visual: "strong-model" } } });
  const orca = fakeOrca(STARTED);
  process.env.SWARM_FREE_MB = "50000";
  try {
    const ctx = loadConfig(t.repo);
    const r = dispatch(ctx, { id: "T01", title: "Do the thing", route: "visual" });
    assert.equal(r.ok, true, r.message);
    const worker = readWorkers(ctx.swarmDir).T01;
    assert.equal(worker.dispatch, "ctx_1");
    assert.equal(worker.model, "strong-model");
    assert.ok(existsSync(worker.path));
    assert.equal(git(worker.path, "branch", "--show-current"), "t01-do-the-thing");
    const call = orca.calls().find((c) => c[1] === "worker-start");
    const spec = call[call.indexOf("--spec") + 1];
    assert.match(spec, /Do it well\./);
    assert.match(spec, /STANDING RULES/);
    assert.match(spec, /- Rule one\./);
    assert.equal(call[call.indexOf("--worktree") + 1], `path:${worker.path}`);
    assert.equal(call[call.indexOf("--model") + 1], "strong-model");
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("dispatch asks Orca for a child worktree of the checkout and records Orca's path and branch", () => {
  const t = makeRepo();
  const wtPath = join(t.root, "orca-ws", "t01-x");
  const orca = fakeOrca({ ...STARTED, "worktree create": { ok: true, result: { worktree: { path: wtPath, branch: "refs/heads/user/t01-x" } } } });
  process.env.SWARM_FREE_MB = "50000";
  try {
    const ctx = loadConfig(t.repo);
    const r = dispatch(ctx, { id: "T01", title: "x" });
    assert.equal(r.ok, true, r.message);
    assert.match(r.message, /via=orca/);
    const create = orca.calls().find((c) => c[0] === "worktree" && c[1] === "create");
    assert.equal(create[create.indexOf("--parent-worktree") + 1], `path:${t.repo}`);
    assert.equal(create[create.indexOf("--base-branch") + 1], "main");
    const worker = readWorkers(ctx.swarmDir).T01;
    assert.equal(worker.path, wtPath);
    assert.equal(worker.branch, "user/t01-x");
    const start = orca.calls().find((c) => c[1] === "worker-start");
    assert.equal(start[start.indexOf("--worktree") + 1], `path:${wtPath}`);
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("worktreeMode git skips Orca's worktree creation; orca mode fails instead of falling back", () => {
  const t = makeRepo({ worktreeMode: "git" });
  const orca = fakeOrca(STARTED);
  process.env.SWARM_FREE_MB = "50000";
  try {
    assert.match(dispatch(loadConfig(t.repo), { id: "T01", title: "x" }).message, /via=git/);
    assert.equal(orca.calls().some((c) => c[0] === "worktree" && c[1] === "create"), false);
    writeFileSync(join(t.repo, ".swarm", "config.json"), JSON.stringify({ integrationBranch: "main", worktreeMode: "orca", worktreeRoot: join(t.root, "w2") }));
    writeFileSync(join(t.repo, ".swarm", "workers.json"), "{}");
    assert.throws(() => dispatch(loadConfig(t.repo), { id: "T01", title: "y" }), /orca worktree create failed/);
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("dispatch registers an unknown repo with Orca and shows its git worktrees", () => {
  const t = makeRepo();
  const orca = fakeOrca({ ...STARTED, "repo show": { ok: false, error: { code: "not_found" } } });
  process.env.SWARM_FREE_MB = "50000";
  try {
    assert.equal(dispatch(loadConfig(t.repo), { id: "T01", title: "x" }).ok, true);
    const calls = orca.calls();
    const add = calls.findIndex((c) => c[0] === "repo" && c[1] === "add");
    const set = calls.findIndex((c) => c[0] === "repo" && c[1] === "set");
    const start = calls.findIndex((c) => c[1] === "worker-start");
    assert.ok(add >= 0 && set > add && start > set, JSON.stringify(calls));
    assert.equal(calls[add][calls[add].indexOf("--path") + 1], t.repo);
    assert.equal(calls[set][calls[set].indexOf("--external-worktree-visibility") + 1], "show");
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("dispatch does not re-add a repo Orca already knows", () => {
  const t = makeRepo();
  const orca = fakeOrca(STARTED);
  process.env.SWARM_FREE_MB = "50000";
  try {
    dispatch(loadConfig(t.repo), { id: "T01", title: "x" });
    assert.equal(orca.calls().some((c) => c[0] === "repo" && c[1] === "add"), false);
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("dispatch refuses past the worker cap or the memory floor unless forced", () => {
  const t = makeRepo({ workers: { max: 4, memoryFloorMB: 2500, perWorkerMB: 1000 } });
  const orca = fakeOrca(STARTED);
  process.env.SWARM_FREE_MB = "3000";
  try {
    const ctx = loadConfig(t.repo);
    const refused = dispatch(ctx, { id: "T01", title: "x" });
    assert.equal(refused.ok, false);
    assert.match(refused.message, /below the floor/);
    assert.equal(orca.calls().length, 0);
    const forced = dispatch(ctx, { id: "T01", title: "x", force: true });
    assert.equal(forced.ok, true, forced.message);
    assert.match(forced.message, /forced past/);
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("dispatch fails clearly when Orca does not start the worker, and records nothing", () => {
  const t = makeRepo();
  const orca = fakeOrca({ "orchestration worker-start": { ok: false, error: "no agent" } });
  process.env.SWARM_FREE_MB = "50000";
  try {
    const ctx = loadConfig(t.repo);
    const r = dispatch(ctx, { id: "T01", title: "x" });
    assert.equal(r.ok, false);
    assert.match(r.message, /FAILED/);
    assert.deepEqual(readWorkers(ctx.swarmDir), {});
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("dispatch needs a spec file", () => {
  const t = makeRepo();
  try {
    assert.throws(() => dispatch(loadConfig(t.repo), { id: "T99", title: "x" }), /Spec not found/);
  } finally { t.cleanup(); }
});

test("a running task is not dispatched twice, but can be resumed in its worktree", () => {
  const t = makeRepo();
  const orca = fakeOrca(STARTED);
  process.env.SWARM_FREE_MB = "50000";
  try {
    const ctx = loadConfig(t.repo);
    dispatch(ctx, { id: "T01", title: "x" });
    assert.throws(() => dispatch(ctx, { id: "T01", title: "x" }), /already running/);
    const r = dispatch(ctx, { id: "T01", title: "x", resume: "Carry on." });
    assert.equal(r.ok, true, r.message);
    const last = orca.calls().filter((c) => c[1] === "worker-start").pop();
    assert.match(last[last.indexOf("--spec") + 1], /^RESUME NOTE/);
    assert.equal(readWorkers(ctx.swarmDir).T01.worktree, join("t01-x"));
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});
