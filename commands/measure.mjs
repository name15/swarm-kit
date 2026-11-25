// Kickoff measurement: how much one worker costs on this machine, and how many workers fit.
//   swarm measure --baseline        with no workers running
//   swarm measure --workers 1       with one worker running (and ideally one build going)
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { snapshot, suggestCap } from "../lib/machine.mjs";

export function measure(ctx, opts = {}) {
  const { repo, cfg, swarmDir } = ctx;
  const file = join(swarmDir, "measure.json");
  const now = snapshot(repo);
  const lines = [`${now.platform}, ${now.cpus} CPUs, free memory ${now.freeMB} of ${now.totalMB} MB, disk free ${now.diskFreeMB ?? "?"} MB`];
  mkdirSync(swarmDir, { recursive: true });
  const saved = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};

  if (opts.baseline) {
    writeFileSync(file, `${JSON.stringify({ ...saved, baselineFreeMB: now.freeMB, at: new Date().toISOString() }, null, 2)}\n`);
    lines.push("Baseline saved. Start one worker (and one build), then run: swarm measure --workers 1");
    return { ok: true, message: lines.join("\n") };
  }

  let perWorkerMB = cfg.workers.perWorkerMB;
  if (opts.workers && saved.baselineFreeMB) {
    perWorkerMB = Math.max(1, Math.round((saved.baselineFreeMB - now.freeMB) / Number(opts.workers)));
    writeFileSync(file, `${JSON.stringify({ ...saved, perWorkerMB, at: new Date().toISOString() }, null, 2)}\n`);
    lines.push(`One worker (with its share of builds) used about ${perWorkerMB} MB.`);
  }
  const freeMB = saved.baselineFreeMB ?? now.freeMB;
  const cap = suggestCap({ freeMB, floorMB: cfg.workers.memoryFloorMB, perWorkerMB, buildPeakMB: Number(opts.buildPeakMb || 0) });
  lines.push(`Suggested worker cap: ${cap} (free ${freeMB} MB, floor ${cfg.workers.memoryFloorMB} MB, ${perWorkerMB} MB per worker).`,
    "Write it into .swarm/config.json (workers.max, workers.perWorkerMB) once the owner agrees.");
  return { ok: true, cap, perWorkerMB, message: lines.join("\n") };
}
