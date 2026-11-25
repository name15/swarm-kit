// Waits for the first real event from the workers (a question or a done report), acknowledging status and
// heartbeat messages on the way. Then prints one line per worker and the machine's headroom.
import { orca } from "../lib/orca.mjs";
import { readWorkers } from "../lib/registry.mjs";
import { snapshot } from "../lib/machine.mjs";
import { run, sleep } from "../lib/run.mjs";
import { terminalTail } from "./workers.mjs";

const QUIET = new Set(["status", "heartbeat"]);

export function describe(message) {
  let payload = {};
  try { payload = typeof message.payload === "string" ? JSON.parse(message.payload) : message.payload || {}; } catch { payload = {}; }
  const body = String(message.body || "").replace(/[^\x20-\x7E\n]/g, "");
  return `${message.type} | ${message.subject || ""} | msg=${message.id} | dispatch=${payload.dispatchId || ""}\n${body}`;
}

export function checkOnce() {
  const r = orca(["orchestration", "check"]);
  const result = r.data?.result || {};
  const messages = Array.isArray(result.messages) ? result.messages : [];
  const events = messages.filter((m) => !QUIET.has(m.type));
  if (!events.length && messages.length && result.deliveryId) orca(["orchestration", "check", "--ack", result.deliveryId]);
  return { events, deliveryId: result.deliveryId };
}

function lastLine(tail) {
  const lines = tail.map((l) => String(l).replace(/[^\x20-\x7E]/g, "").trim()).filter(Boolean);
  return lines.reverse().find((l) => /interrupt|ctrl\+p|esc/i.test(l)) || lines[0] || "(no output)";
}

// Stops dev servers started inside worker worktrees when the project says they block a worker's shell.
function stopDevServers(cfg) {
  if (!cfg.devServerPattern) return [];
  const root = cfg.worktreeRoot.replace(/\\/g, "/").toLowerCase();
  const pattern = new RegExp(cfg.devServerPattern, "i");
  const list = process.platform === "win32"
    ? run("powershell", ["-NoProfile", "-Command",
      "Get-CimInstance Win32_Process | ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }"]).out
    : run("ps", ["-eo", "pid=,args="]).out.replace(/^\s*(\d+)\s+/gm, "$1\t");
  const stopped = [];
  for (const line of list.split("\n")) {
    const [pid, cmd = ""] = line.split("\t");
    if (Number(pid) === process.pid || !cmd) continue;
    if (cmd.replace(/\\/g, "/").toLowerCase().includes(root) && pattern.test(cmd)) {
      try { process.kill(Number(pid)); stopped.push(pid); } catch { /* already gone */ }
    }
  }
  return stopped;
}

export function poll(ctx, opts = {}) {
  const { repo, cfg, swarmDir } = ctx;
  const minutes = opts.minutes ?? 8;
  const interval = (opts.interval ?? 30) * 1000;
  const deadline = Date.now() + minutes * 60000;
  let found = { events: [] };
  do {
    found = checkOnce();
    if (found.events.length) break;
    if (Date.now() + interval > deadline) break;
    sleep(interval);
  } while (Date.now() < deadline);

  const lines = [];
  if (found.events.length) {
    lines.push(`EVENT delivery=${found.deliveryId} (handle it, then: swarm ack ${found.deliveryId})`);
    lines.push(...found.events.map(describe), "");
  }
  lines.push(`--- ${new Date().toTimeString().slice(0, 5)}`);
  for (const [id, w] of Object.entries(readWorkers(swarmDir))) {
    lines.push(`${id.padEnd(5)} ${lastLine(terminalTail(w.dispatch, 12)).slice(0, 110)}`);
  }
  const stopped = stopDevServers(cfg);
  if (stopped.length) lines.push(`stopped dev servers in worktrees: ${stopped.join(", ")}`);
  const m = snapshot(repo);
  const floor = cfg.workers.memoryFloorMB;
  lines.push(`free memory ${m.freeMB} MB (floor ${floor}), disk ${m.diskFreeMB ?? "?"} MB`);
  if (m.freeMB < floor) lines.push("WARNING: below the memory floor: hold new dispatches; builds may fail.");
  return { ok: true, events: found.events, deliveryId: found.deliveryId, message: lines.join("\n") };
}
