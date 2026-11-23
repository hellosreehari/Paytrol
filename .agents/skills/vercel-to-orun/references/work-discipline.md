# Work discipline for a port

The rules are the default playbooks': `initiative-lifecycle` (where the
epic, milestones and tasks are minted), `design-authoring` (the doc set),
`task-branch-pr` and `pr-provenance` (one change, one task, one PR),
`milestone-loop` (closing milestones). The doc-set templates are
`software-factory`'s (`templates/README.md`, `design.md`,
`implementation-plan.md`, `risks-and-open-questions.md`,
`IMPLEMENTATION-STATUS.md`, `TaskContract.yaml`). Read them from the
registry (`skill_get`) when the copy on disk is older. This file holds only
what is particular to a port.

## 1. The port's epic

- One epic per port, `<project>-on-orunbase`, with a 2–3 letter key from
  the project name. Milestones: `survey.md` §6. One task per milestone at
  the start; fixes found while going live are new tasks under the live
  milestone, never extra commits on a merged task.
- A new workspace has no tracker: mint the epic, its milestones and tasks
  in Orunbase (`epic_create`, `milestone_create`, `task_create`, or
  `orun task create --adopt <KEY>-<n> --prefix <KEY> --milestone <mls_...>
  --epic <slug> --contract <file>`).
- Each contract's `affects` lists every file the work needs plus the epic
  directory and the tasks directory. A port touches config at the root
  (`package.json`, the lockfile, `next.config.*`, `.gitignore`): name them.
- The design says what moves and what stays, the runtime shape, the Orun
  structure, every forced code change and why, what is out of scope, and
  the alternative not taken (usually: rewrite onto a baseline).

## 2. Stacked PRs without losing them

Working ahead of review means stacking: task N+1 branches from task N. Two
traps:

- **Deleting a merged PR's branch closes the PRs based on it**, and GitHub
  will not reopen one whose head moved since. Before deleting a base
  branch: rebase the next branch onto `main`
  (`git rebase --onto origin/main <old-base> <branch>`), push with
  `--force-with-lease`, retarget its PR (`gh pr edit <n> --base main`), then
  delete the old branch. Merge with `gh pr merge --squash` (no
  `--delete-branch`) while something stacks on it.
- **Squash merges leave the stacked branch carrying the old commits**: the
  rebase above removes them, so the next PR again holds only its own task's
  commits.

Status-file rows conflict between stacked branches; resolve by keeping
every row.

## 3. The status file

`IMPLEMENTATION-STATUS.md` in the epic's directory: a row per milestone
(state, PRs), an "as built" section per milestone with what was measured
(bundle size, the route matrix, live URLs), every departure from upstream
(each code change and why), and every departure from the design (each
workaround). The PR that lands a milestone's last task updates its row.

## 4. After each merge that deploys

Watch the convergence (`orun-wiring.md` §8) before landing the next PR.
Orunbase marks tasks done from PR evidence only when it receives the repo's
PR events (`orun-wiring.md` §2); otherwise they stay at `ready`, and the
report says so.
