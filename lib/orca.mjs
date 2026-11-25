// Calls the Orca CLI with JSON output. ORCA_BIN points at another executable or a .mjs/.js script (tests use a
// fake Orca this way).
import { run } from "./run.mjs";

export function orca(args, opts = {}) {
  const bin = process.env.ORCA_BIN || "orca";
  const script = /\.(mjs|js)$/i.test(bin);
  const cmd = script ? process.execPath : bin;
  const full = [...(script ? [bin] : []), ...args, ...(opts.json === false ? [] : ["--json"])];
  const r = run(cmd, full);
  let data = null;
  if (opts.json !== false) {
    try { data = JSON.parse(r.out); } catch { data = null; }
  }
  return { ...r, data, ok: r.code === 0 && (!data || data.ok !== false) };
}

// Finds a value anywhere in a nested result (Orca's result shapes vary by command).
export function findKey(value, key) {
  if (!value || typeof value !== "object") return undefined;
  if (key in value) return value[key];
  for (const child of Object.values(value)) {
    const found = findKey(child, key);
    if (found !== undefined) return found;
  }
  return undefined;
}
