---
orun-rev: sha256:fe17c72a27677ad7935fb59f4e74076038d5bf6f95639eebcbaf175087f32404
orun-source: default
name: orunbase
title: Working the Orunbase way
description: "Use for ANY work in a repository that has an intent.yaml at its root or is linked to an Orunbase workspace — fixing a bug, adding a feature, starting a task, creating a branch, committing, opening or landing a pull request, writing a design or an epic, reporting on a workspace. This is the entry point; it routes you to the playbook for the job and names the rules CI enforces. Everything here is done with git, gh, the workspace's tracker and the Orunbase MCP tools; the orun CLI is optional (see orun-cli)."
appliesTo: [implementer, initiative-owner, orchestrator, bootstrapper, reviewer]
---
# Working the Orunbase way

You are in a repository that Orunbase runs. **Orunbase** is the hosted
control plane (workspaces, the work plane, the skill registry, runs, the
catalog); you read it through the **Orunbase MCP tools** — the connector
attached to your session, or the local server `orun mcp serve`. **`orun`**
is the open-source CLI; CI runs it, and you may have it too, but nothing in
these playbooks needs it. What they need is `git`, `gh`, the MCP tools, the
workspace's tracker when it has one, and the files in this repository.

Nothing here is optional etiquette: the rules in **Non-negotiables** are
the ones the `orun/compliance` check verifies on every pull request, and a
repository linked in `required` mode refuses a pull request that breaks one.

## 0. Start every session here

1. `whoami`, then the workspace this repository reports to:
   `execution.state.workspace` in `intent.yaml`. Confirm with the user only
   if the repository names none; never guess a `ws_…`.
2. `skill_get orunbase` and compare its `rev` with the `orun-rev` in this
   file's frontmatter. **If they differ, follow the live body.** Do the same
   for the playbook you are about to follow. A skill on disk is a cache; the
   registry is the truth.
3. Read `intent.yaml` and the `component.yaml` beside each unit you will
   touch: the intent files are the source of truth for what deploys, and
   the pipeline runs `orun plan` and `orun run` — never a raw `pnpm`,
   `wrangler` or `terraform` deploy from a session. The epic doc sets live
   under `specs/epics/<slug>/` and the task contracts under
   `tasks/<KEY>.TaskContract.yaml`; neither directory is a tracker.

## 1. Two owners, one writer per field

Work is tracked in exactly two places, and every epic has one **structure
owner**, fixed by where it was created:

| The tracker owns (a Linear project and its issues, mirrored in) | Orunbase owns (console, MCP, CLI) |
|---|---|
| a mirrored epic's title, description, state, milestones and the membership of its issues | a native epic's title, summary, state, milestones and task membership |
| the title of a linked task | owner, target date, health, assignment, notes — on every epic |
| | a task's rung and evidence (from your PRs), its contract, container contracts, epic docs |
| | the `EP-n` / `mls_…` / `tsk_…` ids |

A console or MCP write to a tracker-owned field answers **412 `mirrored`**
and names the tracker: change it there, and it arrives here by itself. A
platform epic is edited here. The repository owns neither: it holds the
design of record (`specs/epics/<slug>/`) and the contract a change is held
to (`tasks/`), and nothing in it creates, renames, moves or closes an epic,
a milestone or a task. (It did once — an `epic.yaml` per epic, synced on
merge. saas-work-gitops-teardown removed that model from both repositories;
a reference you meet to `work:` in `intent.yaml`, `orun work sync`, a
managed epic or a reserved prefix is stale.)

**Where new work starts** is a workspace setting (Settings → Work in the
console; `…/tasks/settings` over the SDK): `platform`, `tracker`, or *not
chosen*. With `tracker`, a new epic or an unfiled task made here answers
412 authored_elsewhere — create it in the tracker instead.

## 2. Route to the playbook

| When you are… | Load |
|---|---|
| turning an idea into a plan of milestones, or changing a plan before it is built | `planning` |
| starting a product from an idea, or authoring a grand epic for a new capability | `software-factory` |
| handed a `bst_…` bootstrap id from the console's Review step, alone or inside a prompt | `baselining` |
| moving an app that deploys on Vercel onto Cloudflare through Orunbase, or asked whether one can move | `vercel-to-orun` |
| building, caching, sizing or debugging a Next.js app on Cloudflare Workers (OpenNext, vinext) | `nextjs-on-workers` |
| creating an epic, its milestones and its design docs | `initiative-lifecycle`, then `design-authoring` |
| starting a task, creating a branch, committing, opening or landing a PR | `task-branch-pr` (the pen), `pr-provenance` (the rules behind it) |
| working through a milestone's tasks in order, closing a milestone or an epic | `milestone-loop` |
| answering a question about the workspace — runs, logs, catalog, usage, access, tasks | `mcp-tools` |
| you have the `orun` binary and want its shortcuts, or you must sign it in | `orun-cli` |

If none fits, it is almost certainly a task: load `task-branch-pr`.

## 3. Non-negotiables

Each line names the rule as the `orun/compliance` check reports it. On a
repository linked in `advisory` mode a violation is reported; in `required`
mode it fails the check.

- `branch-grammar` — every branch is `orun/<KEY>-<slug>`; the key is the
  task's (`ORU-34`, `GT-3`), the slug is lowercase `[a-z0-9-]`. A tracker's
  key and a platform-minted key satisfy it alike.
- `task-trailer` — every commit carries `Orun-Task: <KEY>`:
  `git commit --trailer "Orun-Task: <KEY>"`.
- `one-task-one-pr` — one task per branch, per PR, per manifest. A second
  change is a second task.
- `task-contract` — `tasks/<KEY>.TaskContract.yaml` exists in the tree and
  is attached to the task (`task_create` with `contract`, or `orun task
  attach`); its `affects` is the ceiling on what the diff may touch.
- `affects-ceiling` — the diff stays inside the contract's `affects`.
- `manifest` — the PR body carries the `<!-- orun:manifest … -->` block.
  You write it (`pr-provenance` has the three lines); `orun pr open` writes
  the same block for those who have it.
- `skill-pins` — the manifest names the skill revisions you followed: the
  `orun-rev` of each skill you loaded, or `skills_list`.
- `skill-current` — those revisions are the registry's latest, or were when
  the PR opened. Check at the start of the session, not after the push.

And the ones no check can see, which matter more:

- **Plan before you converge.** `orun plan` in CI shows the deviation
  between the declared intent and the live state; read the plan job's
  output on your PR before you land.
- **Never invent state.** If a tool can answer, call it. A number you cannot
  trace to a run, an entity, a task or an audit record does not go in your
  answer.
- **Ask before anything irreversible** — deleting resources, rotating
  credentials, force-pushing, converging production, canceling an epic.
- **Credentials stay where they are.** Never print a secret, copy one
  between files, pass one on a command line, or commit one. You never need
  one: the PR is your identity, and CI holds its own.
- **One writer per field** (§1). Never work around a 412 with a second
  tool, a second account or a direct API call; the tracker or the console
  is the door.
- **The status file is the record.** The PR that lands a milestone's last
  task updates the epic's `IMPLEMENTATION-STATUS.md` (`milestone-loop`).
  No check reminds you; the reviewer and the record do.
- **Merge only when every check is green.** `gh pr checks --watch`, then
  `gh pr merge --squash`. Never re-run a failing check hoping, never merge
  around it, never skip or quarantine a test to get green.

## 4. Who decides

The playbooks name decisions they do not make: who adopts a design, when a
pull request lands, when the next milestone starts. Whoever set up your
session says who makes each one — your kickoff, your instructions, the
person. Where nothing says, these defaults hold:

| Decision | Default |
|---|---|
| a design is adopted | the person reviews the design PR and merges it; never merge your own design unasked |
| a pull request lands | every check is green and the person has agreed — or asked you to land it |
| the next milestone starts | the person, once the last one's status row is filled |
| a task you created runs | the person; say its key and leave it |

A surface that drives you on a loop (orun.work's build loop, a scheduler)
states its own answers — for example, "the plan's approval is the design's
adoption" and "land when you are asked to ship". Follow those as written;
they replace the defaults above, never the rules in §3.

## 5. When you finish

Say what landed (the PR, the task key, its rung from `task_get`), what the
epic's status file now says, and anything you could not do and why.
