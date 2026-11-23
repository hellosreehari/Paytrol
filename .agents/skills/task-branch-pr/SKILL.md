---
orun-rev: sha256:83c7d906a21d7919290364e9e5fa429b84947cab4f70c7083f456c80f1f6ebfd
orun-source: default
name: task-branch-pr
title: "One change, the pen: task → branch → commits → PR → landing"
description: "The per-change loop in an Orunbase repository, done with git, gh, the tracker and the MCP tools — find or create the task and write its contract, branch on the grammar, commit with the trailer, open the PR with its manifest block, land it when green, and record it in the epic's status. Use whenever you are about to change code in a linked repository, whatever the size of the change."
appliesTo: [implementer, initiative-owner, orchestrator]
---
# One change, the pen

Everything in an Orunbase repository lands through the same seven moves.
They are cheap; skipping one is what CI catches (`orunbase` §3). Do them in
order, once per change.

## 1. Know the task

A change belongs to a **task**, and a task belongs to a **milestone** of an
**epic**. Find it before you branch:

- `task_get <KEY>` — one task: its contract, rung and evidence.
  `task_list` with the epic's slug — the open tasks and where they sit.
- The epic's doc set, `specs/epics/<slug>/` — the milestones in order and
  what each one lands.

**The task exists:** read its brief and contract; the file is
`tasks/<KEY>.TaskContract.yaml`. A task adopted from the tracker (an issue)
may have no contract yet: write one (below) and attach it —
`orun task attach <KEY>` with the binary, or ask whoever has it.

**It does not exist yet — the epic is the tracker's** (a Linear project):
create the issue in the project under its milestone; it arrives in
Orunbase within seconds with the tracker's key (`ORU-34`). Then write its
contract and attach it.

**It does not exist yet — the epic is Orunbase's:** `task_create` with the
`contract` inline and `adoptKey` for the key you chose in the epic's
cluster code (`GT-3` after `GT-2`), under the milestone (`mls_…` from
`task_get` on the epic). Then write the same contract file in the tree. A
task without a contract parks at `in_review` after its merge and never
folds to done.

```yaml
# tasks/<KEY>.TaskContract.yaml
apiVersion: orun.io/v1
kind: TaskContract
metadata:
  name: <KEY>
  title: "<what the task is, in a line>"
spec:
  goal: "<one sentence: what is true when this task is done>"
  affects:                # the ceiling on what your diff may touch
    - "<path/glob>"
    - "specs/epics/<slug>/**"
    - "tasks/**"
  doneWhen:
    - "<observable fact>"
  gates: []               # merge alone finishes the task
```

## 2. Branch on the grammar

```sh
git checkout -b orun/<KEY>-<slug>            # e.g. orun/GT-3-the-platform
```

The key in the branch is the key in every commit and in the manifest. One
task, one branch. Never work on `main`, never on a branch named any other
way — the branch name is how the platform joins your PR to your task.

## 3. Change, and stay inside the ceiling

Implement inside the bounded contexts the repository already has: a
migration in the migrations package (plus its lock and manifest), routes in
the owning worker, wire types in `contracts`, the surface in the console,
tests beside each. Run the repository's own fast checks before you commit
(`pnpm -r --filter "<changed packages>" test`, or what its README says).
Keep the diff inside the contract's `affects`; widen the contract in the
same PR if the work honestly needs it, never silently.

## 4. Commit with the trailer

```sh
git commit --trailer "Orun-Task: <KEY>" -m "<CODE>n: <what changed, as a sentence>"
git log -1 --format=%B | grep Orun-Task                    # see it
```

One sentence a reader can act on; the body says why, not what. Every commit
ahead of the base carries the trailer — a fixup does too.

## 5. Open the PR with its manifest

The PR body ends with the manifest block. Fill the pins from the
`orun-rev` in the frontmatter of each skill you followed (or `skills_list`):

```sh
cat > /tmp/pr-body.md <<'BODY'
<what and why, two paragraphs at most>

<!-- orun:manifest
{"version":1,"task":"<KEY>","epic":"<epic-slug>",
 "skills":[{"name":"orunbase","rev":"sha256:…"},{"name":"task-branch-pr","rev":"sha256:…"}]}
-->
BODY
git push -u origin orun/<KEY>-<slug>
gh pr create --title "<CODE>n: <name>" --body-file /tmp/pr-body.md
```

The `orun/compliance` check judges the lineage (the rules in `orunbase`
§3) and names what is missing; `orun pr check` runs its branch, trailer and
one-task rules locally. Fix the lineage on the same branch and push again — the
manifest is read from the PR body as it was when the push arrived, so edit
the body first, then push.

## 6. Land

When the decision is yours (`orunbase` §4, "Who decides": by default, when
the person agrees or asks; a loop that drives you says "ship"):

```sh
gh pr checks <n> --watch                     # every check, not the ones you like
gh pr merge <n> --squash --delete-branch
```

A red check is yours to read (`runs_get`, `runs_read_logs`, or
`gh run view --log-failed`) and fix on the same branch — never re-run it
hoping, never merge around it, never skip or quarantine a test to get
green. Land one PR at a time.

## 7. Record it

In this PR when it closes a milestone, else in the next:

- `specs/epics/<slug>/IMPLEMENTATION-STATUS.md`: the milestone's row (state,
  PR) and any departure from `design.md`, said plainly. No check reminds
  you when the PR lands a milestone's last task; the reviewer and the
  record do.
- `task_get <KEY>` should read `done` once the merge lands and the contract
  has no open gates. If it does not, say so.

## The whole loop, as a checklist

1. task found or created, contract in the tree and attached ·
2. `orun/<KEY>-<slug>` · 3. tests, inside `affects` ·
4. `--trailer "Orun-Task: <KEY>"` · 5. body with the manifest,
`gh pr create` · 6. `gh pr checks --watch`, `gh pr merge --squash` ·
7. status file.

With the `orun` binary, `orun pr check`, `orun pr open` and `orun pr land`
do steps 5 and 6 for you — see `orun-cli`.
