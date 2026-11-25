// Running other programs. Arguments always go as a list (no shell), except gate commands, which are the
// project's own command lines and need its shell.
import { spawnSync } from "node:child_process";

export function run(cmd, args = [], opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: opts.cwd,
    input: opts.input,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  const error = r.error ? `${r.error.message}\n` : "";
  return { code: r.status ?? (r.error ? 1 : 0), out: r.stdout || "", err: error + (r.stderr || "") };
}

export function shell(command, opts = {}) {
  const r = spawnSync(command, {
    cwd: opts.cwd,
    shell: true,
    encoding: "utf8",
    env: { ...process.env, ...(opts.env || {}) },
    maxBuffer: 64 * 1024 * 1024,
    windowsHide: true,
  });
  return { code: r.status ?? 1, out: r.stdout || "", err: (r.error ? `${r.error.message}\n` : "") + (r.stderr || "") };
}

export function sleep(ms) {
  if (ms > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
