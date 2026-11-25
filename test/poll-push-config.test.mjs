import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig, DEFAULTS } from "../lib/config.mjs";
import { poll, describe } from "../commands/poll.mjs";
import { push } from "../commands/push.mjs";
import { suggestCap } from "../lib/machine.mjs";
import { parseArgs, main } from "../bin/swarm.mjs";
import { setWorker } from "../lib/registry.mjs";
import { makeRepo, fakeOrca, branchWithChange, git } from "./helpers.mjs";

test("config falls back to defaults and validates the gate mode", () => {
  const t = makeRepo({ gate: { mode: "warn" } });
  try {
    const { cfg } = loadConfig(t.repo);
    assert.equal(cfg.specsDir, DEFAULTS.specsDir);
    assert.equal(cfg.workers.agent, DEFAULTS.workers.agent);
    writeFileSync(join(t.repo, ".swarm", "config.json"), JSON.stringify({ integrationBranch: "main", gate: { mode: "strict" } }));
    assert.throws(() => loadConfig(t.repo), /gate\.mode/);
    writeFileSync(join(t.repo, ".swarm", "config.json"), JSON.stringify({}));
    assert.throws(() => loadConfig(t.repo), /integrationBranch/);
  } finally { t.cleanup(); }
});

test("a folder with no config asks for the setup", () => {
  const dir = mkdtempSync(join(tmpdir(), "swarm-none-"));
  try { assert.throws(() => loadConfig(dir), /setup/i); } finally { rmSync(dir, { recursive: true, force: true }); }
});

test("suggestCap leaves the floor and the build peak free", () => {
  assert.equal(suggestCap({ freeMB: 20000, floorMB: 2500, perWorkerMB: 1100 }), 15);
  assert.equal(suggestCap({ freeMB: 20000, floorMB: 2500, perWorkerMB: 1100, buildPeakMB: 3000 }), 13);
  assert.equal(suggestCap({ freeMB: 3000, floorMB: 2500, perWorkerMB: 1100 }), 1);
});

test("parseArgs reads flags, values and positionals", () => {
  assert.deepEqual(parseArgs(["a|m", "--gate", "block", "--force", "b|n"]), { _: ["a|m", "b|n"], gate: "block", force: true });
  assert.equal(parseArgs(["--build-peak-mb", "300"]).buildPeakMb, "300");
});

test("help works without a config", () => {
  assert.match(main(["help"]).message, /dispatch/);
});

test("poll stops at the first real event and does not acknowledge it", () => {
  const t = makeRepo();
  const orca = fakeOrca({
    "orchestration check": { ok: true, result: { deliveryId: "dlv_1", count: 2, messages: [
      { type: "status", id: "m1" },
      { type: "question", id: "m2", subject: "Question", body: "May I edit App.jsx?", payload: "{\"dispatchId\":\"ctx_1\"}" },
    ] } },
    "orchestration worker-read": { ok: true, result: { terminal: { tail: ["building", "esc interrupt   ctrl+p commands"] } } },
  });
  process.env.SWARM_FREE_MB = "9000";
  try {
    const ctx = loadConfig(t.repo);
    setWorker(ctx.swarmDir, "T01", { dispatch: "ctx_1", path: t.repo, worktree: "wt", branch: "x" });
    const r = poll(ctx, { minutes: 0.01, interval: 0 });
    assert.equal(r.events.length, 1);
    assert.match(r.message, /question \| Question \| msg=m2 \| dispatch=ctx_1/);
    assert.match(r.message, /May I edit App\.jsx\?/);
    assert.match(r.message, /T01 +esc interrupt/);
    assert.equal(orca.calls().some((c) => c.includes("--ack")), false);
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("poll acknowledges status-only deliveries and warns below the memory floor", () => {
  const t = makeRepo({ workers: { memoryFloorMB: 4000 } });
  const orca = fakeOrca({ "orchestration check": { ok: true, result: { deliveryId: "dlv_2", count: 1, messages: [{ type: "heartbeat", id: "h" }] } } });
  process.env.SWARM_FREE_MB = "3000";
  try {
    const r = poll(loadConfig(t.repo), { minutes: 0, interval: 0 });
    assert.equal(r.events.length, 0);
    assert.ok(orca.calls().some((c) => c.includes("--ack") && c.includes("dlv_2")));
    assert.match(r.message, /below the memory floor/);
  } finally { orca.done(); delete process.env.SWARM_FREE_MB; t.cleanup(); }
});

test("describe strips control characters from worker text", () => {
  assert.match(describe({ type: "question", id: "q", body: "ok\u001b[31m", payload: "{}" }), /ok\[31m/);
});

function withRemote(t) {
  const remote = join(t.root, "remote.git");
  git(t.root, "init", "-q", "--bare", remote);
  git(t.repo, "remote", "add", "origin", remote);
  git(t.repo, "push", "-q", "origin", "main");
  return remote;
}

test("push sends the integration branch; deploy needs the owner's go and fast-forwards only", () => {
  const t = makeRepo({ deploy: { branch: "live", allowPush: false } });
  try {
    const remote = withRemote(t);
    branchWithChange(t.repo, "a", "a.txt", "a\n");
    git(t.repo, "merge", "-q", "--ff-only", "a");
    const ctx = loadConfig(t.repo);
    const noGo = push(ctx, { deploy: true });
    assert.equal(noGo.ok, false);
    assert.match(noGo.message, /owner's go/);
    assert.equal(git(remote, "rev-parse", "main"), git(t.repo, "rev-parse", "main"));
    const go = push(ctx, { deploy: true, ownerSaidGo: true });
    assert.equal(go.ok, true, go.message);
    assert.equal(git(remote, "rev-parse", "live"), git(t.repo, "rev-parse", "main"));
  } finally { t.cleanup(); }
});

test("push refuses to deploy over commits the integration branch does not have", () => {
  const t = makeRepo({ deploy: { branch: "live", allowPush: true } });
  try {
    const remote = withRemote(t);
    const other = join(t.root, "other");
    git(t.root, "clone", "-q", remote, other);
    git(other, "config", "user.name", "T"); git(other, "config", "user.email", "t@example.com");
    writeFileSync(join(other, "hotfix.txt"), "x\n");
    git(other, "add", "-A"); git(other, "commit", "-q", "-m", "hotfix on live");
    git(other, "push", "-q", "origin", "HEAD:live");
    const r = push(loadConfig(t.repo), { deploy: true });
    assert.equal(r.ok, false);
    assert.match(r.message, /has commits main lacks/);
  } finally { t.cleanup(); }
});
