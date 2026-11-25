# Swarm kit

Tooling and lessons for building software with one coordinator agent and several worker agents that Orca runs,
each worker in its own git worktree. Works with any project, any agent Orca can start, and any model.

## Quick start

1. Install Orca and Node 20 or newer.
2. Open your coordinator agent in the project and tell it:
   > Set up a swarm for this repo. Read `<path to this kit>/SETUP.md`, then `coordinator-prompt.md`.
3. Answer its questions. It measures the machine, writes `<repo>/.swarm/config.json`, and shows you a summary to
   confirm. Nothing in this kit needs editing.

From then on you talk to the coordinator; it runs the `swarm` commands below.

## What is in the kit

| File | Purpose |
|---|---|
| `SETUP.md` | The interview the coordinator runs with the owner, and the config it writes |
| `coordinator-prompt.md` | The coordinator's standing instructions |
| `footer.md` | Standing rules appended to every worker's task (the project's own rules come from the config) |
| `LESSONS.md` | What went wrong in earlier builds and the rule each incident led to |
| `bin/swarm.mjs` | The command-line tool |
| `commands/`, `lib/` | Its implementation |
| `test/` | Its tests, run against a fake Orca and throwaway git repos |

## Commands

Run from the project checkout: `node <kit>/bin/swarm.mjs <command>` (or `swarm <command>` after `npm link` in the
kit). `--repo <path>` points at another checkout.

| Command | What it does |
|---|---|
| `measure [--baseline] [--workers n]` | Free memory and disk; per-worker cost; a suggested worker cap |
| `dispatch --id T07 --title "..." [--route r] [--model m] [--resume "note"]` | Creates the worktree and starts the worker with its spec, `footer.md` and the project's rules; refuses past the cap or the memory floor unless `--force` |
| `poll [--minutes 8]` | Waits for the first question or done report, acknowledges status noise, shows each worker's last line and free memory |
| `ack <deliveryId>` | Acknowledges events once handled |
| `send --id T07 --text "..."` | Types a message into the worker's terminal (refuses over a permission prompt) |
| `answer --id T07 [--msg id] --text "..."` | Replies on Orca's question channel and in the terminal |
| `interrupt --id T07` | Stops what the worker is doing |
| `merge "branch\|message" ... [--gate warn\|block]` | Squash-merges each branch as its own commit, then runs the gate once |
| `cleanup --id T07 [--discard-untracked]` | Releases the worker, keeps its branch as `archive/<branch>`, removes `.tmp/` and the configured caches, then the worktree; names any other untracked files and removes them only on request |
| `push [--deploy] [--owner-said-go]` | Pushes the integration branch; fast-forwards the deploy branch only |

## Development

```
npm test
```

The tests start no real worker: `ORCA_BIN` points the tool at `test/fake-orca.mjs`, which records every call and
answers from canned responses. See `CHANGELOG.md` for versions.
