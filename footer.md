

STANDING RULES (from the coordinator; they apply to every task):
- First install dependencies in your worktree. Then read the project's tickets file (its decisions and owner answers
  are binding), AGENTS.md and the decisions log. Where the tickets or decisions are newer than AGENTS.md, they win.
- Need a file you don't own, a tool, a dependency or a decision? Ask the coordinator with `orca orchestration ask`.
  Never create a parallel copy (a second config, a duplicate helper) to avoid asking.
- Your done report: three sentences (what changed, what you found, what remains), then 'MISSING:' (what your
  environment lacked and your workaround, or 'none'), 'SOURCE-NEEDED:' (every number, threshold or citation you
  could not source, or 'none') and 'RECOMMEND:' (at most 3 process improvements, or 'none'). Blockers go out at once.
- Never invent a figure, a threshold or a citation. Never reword content the project rules say belongs to someone else.
- Code style: no task IDs in names or comments, no narrating or history comments; reuse existing helpers; files under
  400 lines.
- Never pipe a long run into tail, grep or head; write logs to a file under .tmp/ and read the file.
- Run `orca orchestration check` at each checkpoint: before a new file group, after each test run, and before you
  report done. The coordinator may also type messages into your terminal; a message typed while you work is part of
  your task.
- Before you report done: commit on your branch, merge the integration branch into it, rerun the project's checks,
  and stop every process you started.
- Stay inside your own worktree; never read or edit other worktrees. Scratch files go in .tmp/ inside your worktree,
  never in a system temp folder (outside paths trigger permission prompts that block you).
- Commit only on the branch you were given; never create or switch branches.
- Never use git stash (it is shared by every worktree); use a temporary WIP commit on your branch.
