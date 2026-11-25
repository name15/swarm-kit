# Changelog

## 2.1.0 (25 Nov 2026)

Found by two real single-worker runs against Orca (dispatch, poll, merge, ack, cleanup):

- `dispatch` registers the repo with Orca and makes its git worktrees visible; before, Orca could not find a fresh
  repo's worktree (`selector_not_found`).
- Workers' worktrees are created by Orca as children of the coordinator's checkout, so they nest under it in Orca's
  sidebar. The worker is then started in that existing worktree, which keeps per-task model choice working for
  OpenCode (verified: an explicit model was used). `worktreeMode` "git" or a failed Orca create falls back to
  `git worktree add`.
- `cleanup` removes `.tmp/` and the configured caches first, refuses only on uncommitted changes to tracked files,
  names other untracked files, and removes them with `--discard-untracked`. Before, a worker's scratch logs and a tool
  cache blocked every cleanup.
- Fixed: the porcelain parse dropped the first character of the first changed file's name.

## 2.0.0 (25 Nov 2026)

- Project-, machine-, harness-adapter- and model-agnostic: nothing in the kit names a project, a machine or a model.
- Setup is an interview (`SETUP.md`): the coordinator asks the owner, measures the machine and writes
  `<repo>/.swarm/config.json`. No file is edited by hand and nothing in the kit is copied per project.
- The PowerShell scripts are replaced by one Node tool, `bin/swarm.mjs`, that runs on Windows, macOS and Linux and
  passes arguments to Orca without a shell (no quoting problems).
- New: `measure` (worker cost and suggested cap), memory floor and worker cap checks in `dispatch` and `poll`,
  `push` with fast-forward-only deploys, `answer` (Orca reply plus terminal), and a check that a worker's worktree is
  on the branch being merged.
- The merge gate can warn (commit, mark the commit, log the failure) or block (commit nothing); the project chooses
  at setup.
- Tests for every command, run against a fake Orca and throwaway git repositories.
- `LESSONS.md` rewritten without project details, with the lessons of a second build added.

## 1.0.0

- PowerShell scripts, coordinator prompt and footer for one project; lessons from the first build.
