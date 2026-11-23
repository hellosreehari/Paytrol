---
orun-rev: sha256:8a814c285a9f30d0a4d2c91521ac513aed0f532ff18bdc3fb4e30ccf840c2293
orun-source: default
name: milestone-loop
title: The milestone loop
description: "One milestone in flight; contract before implementation; check the fold with task_get, not your memory; close a milestone by landing its last task with the status file, and close the epic by marking it completed where it lives — the tracker or Orunbase."
appliesTo: [initiative-owner, implementer, orchestrator]
---
# The milestone loop

The loop that ships an epic, one demo-able rung at a time. The epic lives
in the tracker or in Orunbase; its doc set lives under
`specs/epics/<slug>/`; each task's contract under `tasks/`.

## The discipline

1. **One milestone in flight per epic.** Finish or consciously re-plan
   (move the issue in the tracker, or the task's membership in the console
   or over the SDK) before starting the next. Say the re-plan in the status
   file. Who starts the next one is `orunbase`'s "Who decides" — by default
   the person.
2. **One task, one pull request, per milestone** — unless a part must land
   separately (`design-authoring`): another repository or release, or a
   change that must be live before the code that uses it.
3. **Contract before implementation.** A task moves only when its goal,
   `affects`, `doneWhen` and `gates` are written in
   `tasks/<KEY>.TaskContract.yaml` and attached. Changing your own
   definition of done is a visible edit to that file in the PR, never a
   quiet redefinition.
4. **Check the fold, not your memory.** Before every working session,
   `task_get` on your task (or the epic's slug for the whole ladder): the
   rung, the blockers, the evidence live there, and your recollection is
   stale the moment another seat acts.
5. **Narrate in the record.** The PR description says what and why; the
   epic's `IMPLEMENTATION-STATUS.md` says what shipped and what departed
   from the design. Those two are where a reader looks; a chat message is
   not the record.
6. **Membership is the owner's.** A task is moved between milestones in
   the tracker when the epic is the tracker's (the console answers 412
   `mirrored`, on purpose), and in the console or over the SDK when it is
   Orunbase's.
7. **The evidence moves the rung — you don't.** Push the branch that
   carries the task key, open the PR, land it; the platform's observation
   log moves the task. There is no status tool, by design.
8. **Closing a milestone is a PR, not a click.** The PR that lands the
   milestone's last task also edits the status file's row. No check
   reminds you; the reviewer and the record do. Closing the epic is
   marking it completed where it lives — the Linear project, or the
   console — and filling the last row.
9. **Retry safely.** A push, a PR, a merge are all idempotent from the
   tree's point of view: if a step failed half-way, read `task_get`, then
   do the next step, never the previous one twice.

## When a check goes red

Read the failing job (`runs_get`, `runs_read_logs`, or the Actions log) and
fix it on the same branch. Never re-run hoping, never skip a test to get
green, never merge around a red check — the fold would record a landing
that did not happen.
