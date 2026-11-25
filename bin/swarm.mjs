#!/usr/bin/env node
// One entry point for the coordinator: node <swarm-kit>/bin/swarm.mjs <command> [options]
import { pathToFileURL } from "node:url";
import { loadConfig } from "../lib/config.mjs";
import { dispatch } from "../commands/dispatch.mjs";
import { merge, parseEntry } from "../commands/merge.mjs";
import { poll } from "../commands/poll.mjs";
import { send, answer, interrupt, ack, cleanup } from "../commands/workers.mjs";
import { measure } from "../commands/measure.mjs";
import { push } from "../commands/push.mjs";

const HELP = `swarm <command> [--repo <path>] [options]

  measure  [--baseline] [--workers <n>] [--build-peak-mb <mb>]   free memory, per-worker cost, suggested cap
  dispatch --id T07 --title "..." [--route visual] [--model m] [--agent a] [--worktree name] [--resume "note"] [--force]
  poll     [--minutes 8] [--interval 30]                          wait for the first question or done report
  ack      <deliveryId>                                            acknowledge handled events
  send     --id T07 --text "..." [--force]                         type a message into a worker's terminal
  answer   --id T07 [--msg <msgId>] --text "..."                   reply on Orca and in the terminal
  interrupt --id T07                                               stop what the worker is doing
  merge    "branch|message" ["branch|message" ...] [--gate warn|block]   squash-merge, gate once
  cleanup  --id T07 [--discard-untracked]                          release, archive the branch, remove the worktree
  push     [--deploy] [--owner-said-go]                            push the integration branch; fast-forward deploy`;

// Switches never take a value, so "--force b|n" keeps "b|n" as a positional.
const SWITCHES = new Set(["force", "deploy", "ownerSaidGo", "baseline", "help", "discardUntracked"]);

export function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const next = argv[i + 1];
      if (SWITCHES.has(key) || next === undefined || next.startsWith("--")) opts[key] = true;
      else { opts[key] = next; i += 1; }
    } else opts._.push(a);
  }
  return opts;
}

export function main(argv) {
  const [command, ...rest] = argv;
  const opts = parseArgs(rest);
  if (!command || command === "help" || opts.help) return { ok: true, message: HELP };
  const ctx = loadConfig(opts.repo);
  switch (command) {
    case "measure": return measure(ctx, opts);
    case "dispatch": return dispatch(ctx, opts);
    case "poll": return poll(ctx, { minutes: opts.minutes != null ? Number(opts.minutes) : undefined, interval: opts.interval != null ? Number(opts.interval) : undefined });
    case "ack": return ack(opts._[0]);
    case "send": return send(ctx, opts.id, opts.text, { force: opts.force });
    case "answer": return answer(ctx, opts.id, opts.msg, opts.text);
    case "interrupt": return interrupt(ctx, opts.id);
    case "merge": return merge(ctx, opts._.map(parseEntry), { gateMode: opts.gate });
    case "cleanup": return cleanup(ctx, opts.id, { discardUntracked: opts.discardUntracked });
    case "push": return push(ctx, opts);
    default: return { ok: false, message: `Unknown command "${command}".\n\n${HELP}` };
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = main(process.argv.slice(2));
    console.log(result.message);
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) {
    console.error(`swarm: ${error.message}`);
    process.exitCode = 1;
  }
}
