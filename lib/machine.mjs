// Free memory and disk, measured the way that matters on each OS. On Windows, builds fail when free *commit*
// memory runs out, which can happen while free RAM still looks fine, so read that instead.
import os from "node:os";
import { statfsSync } from "node:fs";
import { run } from "./run.mjs";

export function freeMemoryMB() {
  if (process.env.SWARM_FREE_MB) return Number(process.env.SWARM_FREE_MB);
  if (process.platform === "win32") {
    const r = run("powershell", ["-NoProfile", "-Command", "(Get-CimInstance Win32_OperatingSystem).FreeVirtualMemory"]);
    const kb = parseInt(r.out, 10);
    if (kb > 0) return Math.round(kb / 1024);
  }
  return Math.round(os.freemem() / 1048576);
}

export function freeDiskMB(path) {
  try {
    const s = statfsSync(path);
    return Math.round((s.bavail * s.bsize) / 1048576);
  } catch {
    return null;
  }
}

export function snapshot(path) {
  return {
    freeMB: freeMemoryMB(),
    totalMB: Math.round(os.totalmem() / 1048576),
    cpus: os.cpus().length,
    diskFreeMB: freeDiskMB(path),
    platform: process.platform,
  };
}

// How many workers fit: free memory minus the floor kept for builds, divided by one worker's footprint.
export function suggestCap({ freeMB, floorMB, perWorkerMB, buildPeakMB = 0 }) {
  if (!(perWorkerMB > 0)) return 1;
  return Math.max(1, Math.floor((freeMB - floorMB - buildPeakMB) / perWorkerMB));
}
