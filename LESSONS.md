# Lessons: multi-agent build discipline

Lessons from two builds by one coordinator agent and up to eight worker agents sharing one workstation, each under a
hard deadline with the owner reviewing as the work went. Each rule names the kind of incident that taught it. Copy
what fits into the next project's AGENTS.md, the coordinator's memory and the spec footer.

The lessons do not depend on a particular agent harness or model. They assume a harness that can: start a worker
agent in its own git worktree with a task text, deliver a message to a running worker, read its terminal output,
receive its questions and "done" reports, interrupt it, and release it. Where a lesson names a harness or a key
press, it is an example; use your harness's equivalent.

Numbers in this file (memory per worker, worker counts, timeouts) were measured on one machine and are examples,
not limits. Measure your own at kickoff (section 6) and size the swarm to the machine you have.

## 1. Planning and ownership

- **One owner per path**, in a table in AGENTS.md. To touch someone else's path, a worker asks first. This kept merge
  conflicts small and rare even with eight parallel workers.
- **The coordinator owns the contracts** (shared types, routes, data tables, tokens, the decisions log). A contract
  change is its own commit, landed *before* the tasks that need it. Never let workers redefine shared types.
- **Land contract stubs before a parallel batch.** When the tickets in one batch import each other's new names (a
  router, a data table, a component path, a profile helper), put minimal stubs of those names on the integration
  branch first and tell every worker to merge it. Without them, four workers stopped at once to ask the same thing.
- **Shared components are contracts too.** When several cards need the same new ability (result buttons, a side
  panel, a "done for now" exit), the coordinator adds it to the shared component once and tells everyone, instead
  of letting each section work around it.
- **Saved contract patches:** if a contract change would break files a running worker is editing, keep it as a patch
  and apply it right after that worker merges, fixing the broken call sites in the same commit.
- **Plan integration tasks explicitly.** Features built behind separate entry points stayed unjoined until someone
  wrote a task to join them. Make "reachable from the user's path" a review criterion.
- **Task IDs only (T##)**, one ID space, and a "next free ID" line in the coordinator's notes.
- **Batches:** tasks → merges → a combined check → the owner reviews the running app → fix tasks. Write a short
  "what changed and where to look" summary for each batch, and start the next batch only on the owner's go.
  Per-task reviews miss cross-task bugs.
- **A new plan from the owner mid-run:** read it fully against the current code, list what is already done and what
  conflicts, ask about every design intent you are unsure of (especially anything that changes reviewed or
  safety-relevant content), write the answers into the plan as a binding section, then stop or narrow the running
  workers whose work it supersedes. Don't let them finish work that will be thrown away.
- **Order clean-ups after decisions.** A stylesheet clean-up deleted every rule that matched nothing on screen; a
  later task restored older markup that needed exactly those rules, and the screen came out scrambled. Run
  "delete what is unused" tasks after layout decisions are final, or require restorations to bring their styles.
- **Write each owner decision into every rules file at once** (AGENTS.md, the rules spec, the decisions log, the
  ticket). A rule left contradicting a newer decision makes workers stop or follow the stale one; a side agent
  caught one such contradiction.

## 2. Task specs (what every dispatch must contain)

Append a standing-rules **footer** to every spec instead of repeating rules ad hoc. Keep the footer current: an
outdated footer line contradicted the new rules for a whole batch.

- Read AGENTS.md, the decisions log and the ticket's binding answers first.
- **Ask, don't fork:** for a file you don't own, a tool, a key or a decision, ask the coordinator through the
  harness's question channel. Never create
  a parallel copy (a second config, a duplicated helper) to avoid asking.
- **Report format:** three sentences (what changed, what you found, what remains), then `MISSING:`,
  `SOURCE-NEEDED:` (any number or citation not sourced) and `RECOMMEND:` (at most 3 process improvements). Triage
  them into rules, tickets or the owner queue.
- **Code style:** no task IDs, history or narrating comments in code. Reuse existing helpers.
- **Long runs:** never pipe a long run into `head`/`tail`/`grep`; write logs to a file. Find out at kickoff whether a
  background process (a dev server, a watcher) blocks an agent's shell on this machine and agent; on one setup it
  did, for good. If it does, forbid them in the footer and have workers build, then let a screenshot tool serve the
  build.
- **Before done:** commit, merge the integration branch in, rerun tests and build, stop every process you started.
- **Stay in your worktree.** Scratch files go in `.tmp/` inside it; outside paths trigger permission prompts that
  block the worker.
- **Never use `git stash`** (shared across worktrees). Use WIP commits.
- **Write specs in UTF-8.** An ANSI round trip produced mojibake.
- **Name the branch.** One worker committed to a branch it named itself; the merge of the expected branch was empty.
  Check `git -C <worktree> branch --show-current` before every merge.

## 3. Evidence and review

- **A passing test is not proof the screen looks right.** Look at the running product, or have the owner look.
- **Open every image at full size and check the exact claim.** A wide shot approved a 3D scene that was wrong from
  the side. For geometry, require close views from several angles.
- **The owner may prefer reviewing the running app to screenshots.** Then drop the screenshot requirement from the
  footer, but keep checking by measurement: computed colours in both themes, `elementFromPoint` on a button to see
  whether something covers it, `scrollWidth` for overflow, the bounding box of a button against the viewport.
  Measurements caught dark text on blue buttons in the light theme and a start button pushed off screen.
- **Test every size, theme and input path** a user can hit: phone and desktop, portrait and landscape, light and
  dark, keyboard and touch. A cover that could not scroll hid its only button at some heights.
- **After adding a global keyboard shortcut, type a word containing its letters into a text field.** A handler
  that "claimed" shortcut keys while the user typed also blocked those letters from being typed, in every field.
- **Demo or seed data must match the logic that reads it.** A due list grouped checks by topic and interval, so
  leaving one card open did not make its topic due; the demo looked broken until the seed left whole topics open.
- **Verify side agents' and workers' claims with a command** before acting on them. Most were right; some
  misdescribed the problem.
- **Run the product as a user at each milestone**, from the real entry point.

## 4. Facts and sources

- **Never give workers a medical, scientific or legal figure from memory.** The coordinator once passed on a
  nutrient "target" that the primary source defines as a maximum; the feature warned in the wrong direction.
  Check the primary document first (a research agent can fetch and quote it), then hand over the quote and the URL.
- **A citation label can be wrong.** A document cited under one topic turned out to have a different title and
  subject when found. Record the real title and ask the content owner which document was meant.
- **Mark unverified links as unverified** until someone opens them.
- **A threshold changed on request needs its source or a "design choice" label**, and a decision-log line when it
  changes reviewed content.
- **AI-generated images are marked on screen and in the credits** as soon as you know they are AI-made.

## 5. Merging

- **Squash-merge** each branch as `T##: Title` onto the integration branch. Keep the branch as an archive ref.
- **Per-merge gate:** tests and build. No full end-to-end run per merge; run it once per batch.
- **Decide at setup whether the gate blocks or warns.** Blocking keeps the integration branch green but stalls a
  batch on one trivial error. Warning commits anyway, which keeps work flowing when the coordinator fixes small
  breakages in a real test run right after. Either way, a failure must be loud and recorded, never silent: a
  hand-typed command once ran the tests and committed in the same line without reading the result, and nobody
  noticed the red test until later. Let the merge script run the gate and say what failed.
- **Merge the shared layer first** (shell, kit), then the sections that build on it. Settle trivial import-line
  conflicts in coordinator-owned files yourself; send real conflicts back to the worker.
- **After a batch of parallel merges, check the combined app** for console errors on every route before telling the
  owner it is ready. Branches that each passed alone can still clash.
- **An interrupted merge keeps running.** Wait for its completion before rerunning; never run two merges at once.
- **A diverged default branch** whose content is already ported: record it as merged with `git merge -s ours`, so
  the pull request merges cleanly and its history stays.
- **Deploy branch:** only fast-forward pushes, never force. Write the owner's permission to push it into memory.

## 6. Running workers (coordinator ops)

- **Watch in the foreground, in a loop**, and answer questions fast. Unanswered `ask` messages time out after
  minutes and the worker guesses, often by editing a file it does not own.
- **Stuck-worker watchdog:** an unchanged terminal tail, the child process signature (CPU pinned with no I/O is a
  loop, idle with no I/O is blocked), known traps. Kill only the stuck child.
- **Deliver instructions into the terminal and verify delivery.** Inbox messages are often unread. A message typed
  while the worker is busy is queued: a "done" report may predate it, so check the branch for the later work before
  merging.
- **Answer each question once, then repeat it in the terminal.** Workers re-ask when an answer is slow.
- **Stop superseded work immediately** with the harness's interrupt (in some terminal agents, two ESC presses in
  quick succession), then send the
  narrowed instruction. A worker that keeps going on cancelled work may delete files it was told to delete earlier.
- **Release finished workers, clean up separately**, only once the worker is idle and the owner isn't using it.
- **Size the swarm to the machine, at kickoff.** Measure with one worker running: its memory, the peak of one build
  and one test run, and the machine's free memory (on Windows, free *commit* memory, not free RAM). Then
  `workers ≈ (free memory − headroom for the builds that may run at once) / memory per worker`, and keep a floor
  below which you stop dispatching. On one machine a worker took about 1 GB, eight ran with about 20 GB free, and
  builds started failing below about 2.5 GB free; your numbers will differ.
- **Re-check on every poll** and adapt: free memory, free disk, load. Dispatch more when there is room, hold new
  dispatches when free memory nears the floor, and pause a worker rather than let builds crash. Memory, not CPU, ran
  out first on both builds, but measure: a CPU-bound build or test suite can make CPU the limit instead.
- **On a smaller machine:** fewer workers, one build or test run at a time (a lock file that every build takes),
  the end-to-end suite once per batch only, and the heaviest tools (3D, browsers, desktop apps the agents drive)
  never two at once. Prefer small, independent tickets so a short queue still flows.
- **On a bigger machine:** memory stops being the limit, and the next ones appear: API rate limits and cost per
  model, merge throughput (one integration branch, one gate at a time), conflicts between workers touching nearby
  files, and above all the coordinator's and the owner's attention to answer questions and review. Add workers only
  while questions are still answered within minutes and each batch can still be reviewed; past that, more workers
  only produce more waiting and more rework.
- **Reboots kill all agents.** Keep a handoff note current so each worker can restart in its own worktree.
- **Keep the integration checkout on the integration branch.** Something switched it once; check the branch name
  before every commit and merge, and make the merge script refuse otherwise.
- **Never change system settings** without the owner's permission.
- **Record the shell's quirks at kickoff** in the coordinator's notes and the footer, and pass long text (comments,
  pull request bodies, messages) to command-line tools from a file rather than inline. On Windows PowerShell 5.1,
  for example: no `&&`; inner double quotes break native arguments (use `--body-file`, `--comment-file`); `jq`
  expressions with spaces need a file or a template; tools that write progress to stderr show `NativeCommandError`
  even on success, so read the result line, not the colour; write files as UTF-8 explicitly to avoid a BOM or ANSI.
- **Headless browser checks:** a confirm dialog freezes automation; seed data through the store instead of clicking
  a button that asks for confirmation.

## 7. Model choice and cost

- **Route by task class, not by vendor.** Keep a small routing table in the project's config: routine
  implementation → the cheapest model that passes the gate; spatial, anatomical, 3D or visual judgement, tricky
  merges and anything the owner flags → the strongest model available. Any harness and any model family fit this
  table.
- **Calibrate on a pilot ticket.** Before a batch, give one representative ticket to the candidate model and check
  its report, its diff and its rework rate. Models differ in how well they follow a long footer, ask instead of
  guessing, and stay inside their paths; route by what you observe.
- **Record the model on every dispatch** in the coordinator's notes, so rework can be traced to a model and the
  routing table updated.
- **Never silently downgrade a task** that was routed to a stronger model; ask the owner first. The owner may route
  any task themselves.
- **Paid APIs only after a dry run and the owner's cost approval.** Track spend per model.

## 8. Owner communication

- **One owner queue file**, shown in chat at every batch end. Keep it to open items; clear resolved ones as soon as
  the owner answers, and say what each closure was based on.
- **Record decisions in a dated log** as they are made, including decisions that change reviewed content.
- **When the owner's words are ambiguous, ask one short question** before reassigning or rebuilding anything.
  "Leave X to me" meant "I'll review it", not "I'll build it"; the reversal cost a revert cycle.
- **Push back once, with reasons, when a request would undo work the next batch builds on**; then follow the
  owner's call.
- **Say overrides in chat before doing them** (worker cap, merging without a clean run).
- **Outward actions need the owner's go:** pushing, opening or merging pull requests, closing or deleting issues.
  Expect permission limits (deleting an issue needs repository admin rights).
- **Removing a name from public docs does not remove it from git history.** Say so, and offer a history rewrite only
  if asked.
- **Report honestly:** flaky versus real, your own mistakes included, with the evidence.

## 9. Repo hygiene

- **Git LFS from day one for binaries.** Moving later means rewriting history and a force push.
- **Commit messages:** `T##: Imperative sentence` on task branches, `<area>: Imperative sentence` for the
  coordinator.
- **Keep tuning numbers and thresholds in data files**, with their source next to them.
- **Keep files small (< 400 lines) and rules as pure functions**, testable without the UI or the network.
- **Before release, find unused assets** by searching every file name in the code, entry HTML, manifest and build
  tooling, then check dynamic paths (`assets/${type}.png`) before deleting.
- **Pin generator tool versions.** A newer tool version changed generated output.
- **Put coordinator tooling under git** too; it is as easy to lose as project code.
- **Test tooling against the real harness, not only a fake.** A fake answered the way the harness had answered in
  one project, and every test passed; the first real run against a fresh repo failed (the harness needed the repo
  registered), and the first real cleanup refused (worker scratch looked like unsaved work). One small real task,
  end to end, finds what a fake cannot.
