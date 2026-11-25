// Running workers, keyed by task ID, in <repo>/.swarm/workers.json. dispatch adds, cleanup removes.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const file = (swarmDir) => join(swarmDir, "workers.json");

export function readWorkers(swarmDir) {
  const f = file(swarmDir);
  return existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) : {};
}

export function writeWorkers(swarmDir, workers) {
  mkdirSync(swarmDir, { recursive: true });
  writeFileSync(file(swarmDir), `${JSON.stringify(workers, null, 2)}\n`, "utf8");
}

export function getWorker(swarmDir, id) {
  const worker = readWorkers(swarmDir)[id];
  if (!worker) throw new Error(`No running worker ${id} in .swarm/workers.json.`);
  return worker;
}

export function setWorker(swarmDir, id, value) {
  const workers = readWorkers(swarmDir);
  if (value) workers[id] = value; else delete workers[id];
  writeWorkers(swarmDir, workers);
}
