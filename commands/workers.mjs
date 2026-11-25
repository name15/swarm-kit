// Talking to running workers: typing into their terminal, answering questions, interrupting, and releasing.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { git, gitOut } from "../lib/git.mjs";
import { orca, findKey } from "../lib/orca.mjs";
import { getWorker, setWorker } from "../lib/registry.mjs";
import { sleep } from "../lib/run.mjs";

const PROMPT = /Permission required|Always allow|Allow once/;

export function terminalHandle(dispatchId) {
  const r = orca(["orchestration", "worker-show", "--dispatch", dispatchId]);
  const handle = findKey(r.data, "agentTerminalHandle");
  if (!handle) throw new Error(`No agent terminal for dispatch ${dispatchId}.`);
  return handle;
}

export function terminalTail(dispatchId, limit = 15) {
  const r = orca(["orchestration", "worker-read", "--dispatch", dispatchId, "--source", "terminal", "--limit", String(limit)]);
  const tail = findKey(r.data, "tail");
  return Array.isArray(tail) ? tail : [];
}

// Typing into a terminal that shows a permission prompt would answer the prompt, so refuse unless forced.
export function send(ctx, id, text, opts = {}) {
  const worker = getWorker(ctx.swarmDir, id);
  if (!opts.force && PROMPT.test(terminalTail(worker.dispatch).join("\n"))) {
    return { ok: false, message: `REFUSED: ${id} shows a permission prompt; look at it first (or pass --force).` };
  }
  const handle = terminalHandle(worker.dispatch);
  let r = orca(["terminal", "send", "--terminal", handle, "--text", text, "--enter", "--wait-submit", "20"]);
  if (/swallowed/.test(r.out)) {
    const retry = (r.out.match(/retry-request ([0-9a-f-]+)/) || [])[1];
    if (retry) r = orca(["terminal", "send", "--terminal", handle, "--text", text, "--enter", "--retry-request", retry, "--wait-submit", "20"]);
  }
  const state = /turn_started/.test(r.out) ? "delivered" : /"accepted":\s*true/.test(r.out) ? "queued (agent busy)" : "NOT DELIVERED";
  return { ok: state !== "NOT DELIVERED", message: `${id}: ${state}` };
}

// Answers on Orca's question channel and also types the answer into the terminal: question replies are often unread.
export function answer(ctx, id, msgId, text) {
  if (msgId) orca(["orchestration", "reply", "--id", msgId, "--body", text]);
  return send(ctx, id, `Coordinator answer: ${text}`);
}

export function interrupt(ctx, id) {
  const worker = getWorker(ctx.swarmDir, id);
  const handle = terminalHandle(worker.dispatch);
  orca(["terminal", "send", "--terminal", handle, "--text", "\u001b"]);
  orca(["terminal", "send", "--terminal", handle, "--text", "\u001b"]);
  sleep(1500);
  return { ok: true, message: `${id}: interrupt sent. ${terminalTail(worker.dispatch, 4).join(" | ").slice(0, 200)}` };
}

export function ack(deliveryId) {
  const r = orca(["orchestration", "check", "--ack", deliveryId]);
  return { ok: r.ok, message: r.ok ? `acknowledged ${deliveryId}` : `ack failed: ${r.err.trim()}` };
}

// Releases the worker, keeps its branch as archive/<branch>, and removes the worktree if nothing is uncommitted.
export function cleanup(ctx, id, opts = {}) {
  const { repo, cfg, swarmDir } = ctx;
  const worker = getWorker(swarmDir, id);
  const out = [];
  orca(["orchestration", "worker-release", "--dispatch", worker.dispatch]);
  if (!existsSync(worker.path)) {
    setWorker(swarmDir, id, null);
    return { ok: true, message: `${id}: released; worktree already gone.` };
  }
  const branch = gitOut(worker.path, ["branch", "--show-current"]) || worker.branch;
  const tip = gitOut(worker.path, ["rev-parse", "HEAD"]);
  if (tip) {
    git(repo, ["update-ref", `refs/heads/archive/${branch}`, tip]);
    out.push(`archived ${branch} at ${tip.slice(0, 7)} as archive/${branch}`);
  }
  // Scratch (.tmp/, where the footer sends workers) and the tool caches named in the config are not work.
  for (const dir of [".tmp", ...cfg.cleanup.removeDirs]) rmSync(join(worker.path, dir), { recursive: true, force: true });
  // Not gitOut: trimming would eat the leading space of the first " M file" line and shift its columns.
  const status = git(worker.path, ["status", "--porcelain"]).out.split("\n").filter((l) => l.trim());
  const tracked = status.filter((l) => !l.startsWith("??"));
  const untracked = status.filter((l) => l.startsWith("??")).map((l) => l.slice(3));
  if (tracked.length) {
    return { ok: false, message: `${out.join("; ")}; NOT REMOVED: uncommitted changes to tracked files: ${tracked.map((l) => l.slice(3)).join(", ")}.` };
  }
  if (untracked.length && !opts.discardUntracked) {
    return { ok: false, message: `${out.join("; ")}; NOT REMOVED: untracked files: ${untracked.join(", ")}. `
      + `If they are caches or scratch, add them to cleanup.removeDirs in the config or pass --discard-untracked.` };
  }
  orca(["terminal", "close", "--worktree", `path:${worker.path}`, "--all"]);
  orca(["worktree", "rm", "--worktree", `path:${worker.path}`]);
  if (existsSync(worker.path)) git(repo, ["worktree", "remove", "--force", worker.path]);
  git(repo, ["worktree", "prune"]);
  setWorker(swarmDir, id, null);
  out.push(existsSync(worker.path) ? `could not remove ${worker.path}; close what holds it and run cleanup again` : "worktree removed");
  return { ok: !existsSync(worker.path), message: `${id}: released; ${out.join("; ")}.` };
}
