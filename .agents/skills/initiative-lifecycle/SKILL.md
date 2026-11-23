---
orun-rev: sha256:9ed675c8927140e4aee5f64cc21521cf1889af9d45b86b89dee68d92b3a13085
orun-source: default
name: initiative-lifecycle
title: Initiative lifecycle
description: "When to mint which noun — epic, milestone, task — and where each is minted: in the workspace's tracker (a Linear project, its milestones and its issues, mirrored into Orunbase) or in Orunbase over MCP (epic_create, milestone_create, task_create). The design doc set is reviewed in a pull request under specs/epics/<slug>/ and is the record of the design; the repository is never the tracker."
appliesTo: [initiative-owner, orchestrator, implementer]
---
# Initiative lifecycle

You run work under the model's own rules, never around them. An epic, a
milestone and a task live in a **tracker**: the workspace's own (Linear,
mirrored into Orunbase by the integration) or Orunbase itself. The
repository holds the **design** — `specs/epics/<slug>/` — and the
**contract** a change is held to — `tasks/<KEY>.TaskContract.yaml`. Nothing
in the repository creates, renames, moves or closes any of the three.

## Where new work starts

Ask the workspace before you mint anything: Settings → Work in the
console, or `GET …/tasks/settings` over the SDK.

| The workspace creates work in… | Mint the epic as… | Its milestones as… | Its tasks as… |
|---|---|---|---|
| its **tracker** (Linear connected) | a Linear project on the team the workspace mirrors | the project's milestones, in order, each with its exit criteria in the description | issues in the project under their milestone; the issue key (`ORU-34`) is the task key |
| **Orunbase** (`platform`, or *not chosen* with no tracker) | `epic_create` (slug, name, summary) | `milestone_create`, in order, each with `exitCriteria` | `task_create` with `contract` inline and `adoptKey` for the key you chose in the epic's cluster code (`GT-3`) |

A Linear project arrives in Orunbase within seconds as a mirrored epic
(`task_get <slug>` shows it, with the project's url); its issues arrive as
tasks carrying the tracker's keys. Everything else — the design, the
contract, the branch, the PR — is the same on both paths.

## The nouns

- **Epic** — a capability worth a design. Minted in the tracker or over
  MCP, then given a doc set under `specs/epics/<slug>/` (`design-authoring`)
  in a pull request. The PR's review is the design's adoption; the merge
  changes nothing in the tracker.
- **Milestone** — a phase a human can see finished, in order, with exit
  criteria (the milestone's description in Linear; `exitCriteria` in
  Orunbase). Never delete one — mark it done in the status file. A
  milestone completes when its last task lands.
- **Task** — the unit of work, the unit of a PR. A Linear issue under its
  milestone, or a `task_create` under the `mls_…`. Its contract is
  `tasks/<KEY>.TaskContract.yaml` in the tree and attached to the task
  (`task-branch-pr` §1).
- **Owner, target date, health** — Orunbase's, on every epic; set in the
  console or over MCP.
- **State** — a tracker epic's state is the tracker's word; a platform
  epic's moves in the console or by `PATCH` over the SDK: `backlog`,
  `started`, `paused`, `completed`, `canceled`. Closing an epic is marking
  it completed where it lives and filling the status file's last row.

The first task of every epic is its own spec: `<CODE>-1`, whose PR adds the
doc set and the first contract.

## Etiquette

1. **Review before adoption.** The doc-set PR is reviewed like any other;
   the milestone table is what a reviewer approves. Ask for that review
   explicitly; do not merge your own epic unasked.
2. **One milestone in flight per epic** (`milestone-loop`). Re-plan in the
   tracker or the console, and say so in the status file.
3. **Superseded designs stay in the record.** Mark the old epic canceled
   where it lives, with a line in its status file naming the replacement;
   never delete a directory.
4. **Report health as a human word you can defend** — the status file's
   rows and the README's Status line are where it lives; a stale line is
   worse than an honest "at risk".
