---
orun-rev: sha256:e6ed5ba1b93ec7d9f2900fcae69b7e7b54db92094f4f1a60f746f38c1c3ed975
orun-source: default
name: design-authoring
title: Design authoring
description: "The epic doc set (README, design, plan, risks, status) under specs/epics/<slug>/: demo-able milestone ladders, complete task contracts, and the alternative you rejected. The epic itself lives in the tracker or in Orunbase; the doc set is its design of record."
appliesTo: [initiative-owner, orchestrator, implementer]
---
# Design authoring

A design is a comparable, adoptable proposal — not prose with vibes. It
lives in the repository as an epic directory, `specs/epics/<slug>/`, and
its pull request is the adoption (`initiative-lifecycle`); the epic it
describes lives in the tracker or in Orunbase, and the directory names it
in its README.

## Structure

Every epic directory carries:

- `README.md` — the thesis in one bold paragraph, the Status table, the
  read order, the milestones at a glance.
- `design.md` — the model and the decisions, numbered, each with its why.
- `implementation-plan.md` — one section per milestone with a **done when**
  list of observable facts.
- `risks-and-open-questions.md` — each with its mitigation or its default.
- `IMPLEMENTATION-STATUS.md` — as built: a row per milestone, and every
  departure from `design.md`, said plainly.

The `software-factory` skill's `templates/` has each file's shape.

## Milestone ladders are demo-able, and no longer than they must be

Each milestone names a goal a human can SEE finished (`exitCriteria` in
observable terms — "the resolver answers typed keys", never "80% of the
resolver"). If you cannot say what the demo shows, the milestone is not
cut right. Order milestones so every rung leaves the system coherent —
land vocabulary before mutators, mutators before surfaces.

Cut a new milestone only at a boundary (`planning` rule 3): an outside
service or credential, a new audience to secure, a contract a later rung
needs in place first (a migration, a wire type, a stored record), another
repository or release, or a point a person must judge before the next rung.
More surface on the same data, copy, styling and polish ride with the
feature they belong to; two rungs with no boundary between them are one.

## One task per milestone, one pull request

A milestone is one task and one pull request unless its parts must land
separately: a change in another repository or release (orun and orun-cloud
are two pull requests), or a change that must be live before the code that
uses it (a migration the running code has to survive first). Never split a
milestone into tasks by layer or by page: a reviewer reads the feature in
one diff, and every extra pull request is another round of CI and review.
For an app in one repository with one deployable, that is one pull request
per milestone.

## Tasks carry complete contracts

Every task the ladder names has `tasks/<KEY>.TaskContract.yaml`: its
goal, the paths it may touch (`affects`), its `doneWhen`, its `gates`. A
task without a contract is a title, and titles cannot be reviewed. Name
dependencies in the plan's sequencing note so a reader can see why the
order is the order.

## Before requesting review

- `task_get` the epics already in flight in the workspace and
  `catalog_search` what exists — your design must account for both.
- Name the alternative you rejected and why, in `design.md`. A design
  reviewed without its alternative is approved by default, not by
  judgment.
- Show the milestone table and ask for the review; the merge is the
  adoption. Who adopts is `orunbase`'s "Who decides": by default the
  person, so do not merge your own epic unasked.
