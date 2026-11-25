# Setup: the coordinator interviews the owner

Nobody edits a file to set up a swarm. The coordinator asks the owner the questions below in chat, then writes the
project's config itself. The owner only answers and approves.

## How to run the setup

1. The owner tells the coordinator: "Set up a swarm for this repo; read `<path to swarm-kit>/SETUP.md`."
2. The coordinator reads the repo first (README, package files, test and build scripts, existing docs, git
   remotes and branches) and pre-fills every answer it can find. It only asks what it cannot find, and shows its
   guess with each question so the owner can say "yes".
3. Ask **one topic at a time**, a few questions per message, with options where there are obvious ones and a
   recommended choice marked. Push on vague answers ("tests" → "which command, and how long does it take?").
4. Measure the machine (section F) instead of asking about it.
5. Write the results (section "What the coordinator writes"), show the owner a one-screen summary, and change
   anything they correct. Only then write the first tickets.

Re-run any section later when something changes ("we now deploy from main", "add two workers"): update the config
and the affected documents, and record the change in the decisions log.

## Questions

### A. The project

- What are we building, for whom, and what does "done" look like for the owner?
- Is there a deadline (date, time, time zone)? A feature freeze before it?
- Who reviews the work, and how: the running app after each batch, screenshots, code review, or a mix?
- Is any content owned by someone outside the swarm (a domain expert, legal, design) that agents must not reword?
- Are there hard product rules (safety, privacy, regulated wording, accessibility level, languages)?

### B. The repository

- Which checkout is the coordinator's (path)? Which branch is the integration branch everyone merges into?
- Which branch deploys, if any, and may the coordinator push to it (fast-forward only)? Is there a pull request
  step?
- How are task branches named, and are they squash-merged? Keep merged branches as archive refs?
- Commit message format for tasks and for the coordinator?
- Large binaries: is Git LFS set up?

### C. Checks

- The commands for: install, test, build, lint, typecheck (each, or "none"). Roughly how long does each take?
- Is there an end-to-end suite? Its command, its run time, and how often (per batch is the default)?
- Does a background process (a dev server, a watcher) block an agent's shell on this machine? (Test it if unsure.)
- How do agents look at the product: a screenshot tool, a headless browser script, a CLI? Its command.

### D. Ownership and contracts

- Which paths are shared contracts the coordinator owns (types, routes, data tables, tokens, config)?
- Which paths are per section, owned by whichever task works there?
- Where do specs, decisions, the owner queue and evidence live (defaults: `docs/specs/`, `docs/decisions.md`,
  `docs/owner-queue.md`, `docs/evidence/`)?
- Ports: does each worker need its own port block? Which services, and which range?

### E. Workers and models

- Which agent(s) does Orca start for workers, and which model for which kind of task (routine, visual or spatial,
  hard merges)? May the coordinator choose, or does every change of model need the owner?
- Cost limits: paid APIs, spend per day?
- Are secrets involved? Workers use mock modes only, and real keys stay in the owner's checkout (default).

### F. The machine (measure, do not ask)

- OS and shell; free memory (free commit memory on Windows); free disk; CPU count.
- Start one worker, then measure its memory and the peak of one build and one test run.
- Propose a worker cap and a memory floor from those numbers (see `LESSONS.md`, section 6) and let the owner
  confirm.

### G. Working agreement

- How should the coordinator report: after every merge, at batch end only, or on request?
- Which actions need the owner's go every time (push, deploy, close issues, delete anything, change a dependency)?
- Anything the coordinator should never do?

## What the coordinator writes

Only one file holds the answers: `<repo>/.swarm/config.json`. The kit's own files (`footer.md`,
`coordinator-prompt.md`, the scripts) stay generic and read it; nothing in the kit is copied or rewritten per
project. Add `.swarm/` to `.git/info/exclude` (it holds local paths and the running-worker list).

```json
{
  "project": "short name",
  "integrationBranch": "the branch every task merges into",
  "specsDir": "docs/specs",
  "worktreeMode": "auto (Orca creates each worker's worktree as a child of the checkout; git if Orca fails) | orca | git",
  "worktreeSetup": "inherit | run | skip (whether Orca runs the repo's setup in a new worktree)",
  "worktreeRoot": "where git-made worktrees go (default: <repo>-worktrees next to the repo)",
  "gate": { "mode": "warn or block", "install": "install command or empty", "commands": ["test", "build"] },
  "workers": { "agent": "agent Orca starts", "max": 4, "memoryFloorMB": 2500, "perWorkerMB": 1100 },
  "models": { "default": "model id or empty", "routes": { "visual": "model id", "merge": "model id" } },
  "ports": { "base": 8100, "step": 10, "names": ["SERVER_PORT", "CLIENT_PORT"] },
  "projectRules": ["one line per rule every task must follow (setup sections A and D)"],
  "deploy": { "branch": "deploy branch or empty", "allowPush": false },
  "cleanup": { "removeDirs": ["tool caches inside worktrees to delete before removal"] },
  "devServerPattern": "regex of dev-server command lines poll stops in worktrees, or empty"
}
```

The first `dispatch` registers the repo with Orca (`orca repo add`) and makes its git worktrees visible there; Orca
has no command to unregister a repo, so remove a trial repo from Orca's list by hand. `cleanup.removeDirs` should
list the tool caches your agents leave in worktrees (one agent left `.serena/`); `.tmp/` is always removed.

`ports` is `null` when workers need no port blocks. `gate.mode` "warn" commits a merge whose checks fail and logs
it for the coordinator to fix in the next real test run; "block" commits nothing on a failed gate.

The living documents start empty and are kept by the coordinator from then on (they hold the project's history,
not copies of the setup): `docs/decisions.md` (dated rows; the setup answers are the first ones),
`docs/owner-queue.md` (open questions and to-dos for the owner), `docs/tickets.md` (batches and binding owner
answers), and `.swarm/handoff.md` (state for the next coordinator after a context reset). If the project has no
AGENTS.md, write a short one: what the product is, the owners of each path, and the definition of done.
