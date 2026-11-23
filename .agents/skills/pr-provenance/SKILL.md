---
orun-rev: sha256:ea0af746b15ef259878c1573ea57faf427f160a43f7cfcbf94516a434f682b43
orun-source: default
name: pr-provenance
title: PR provenance
description: "Branch grammar, the Orun-Task trailer, one task per PR, and the manifest block — the pen the orun/compliance check verifies, and how to write each piece by hand with git and gh."
appliesTo: [implementer, initiative-owner, bootstrapper]
---
# PR provenance

Every PR carries its lineage; the `orun/compliance` check verifies what the
pen wrote.
Provenance is not bureaucracy — it is how the observation log knows which
task your evidence belongs to, and how a reviewer re-reads the playbook you
followed. None of it needs the `orun` binary.

## Branch grammar

`orun/<KEY>-<slug>` — the task key in the branch name is how the platform
claims your task when the branch is seen. One task, one branch.
`git checkout -b orun/GT-3-the-platform`.

## The trailer

Every commit ahead of the base carries `Orun-Task: <KEY>`:

```sh
git commit --trailer "Orun-Task: GT-3" -m "GT2: the platform stops obeying git"
```

A fixup or a merge commit you author carries it too. (Those who have the
binary run `orun githooks install` once and the hook stamps it.)

## One task, one PR

A PR that closes two tasks documents neither. If the work grew, create
the follow-up task (an issue in the tracker, or `task_create`) with its
contract and reference it; never widen a PR silently.

## The manifest

The PR body carries a machine-readable block. It is three lines, and you
may write it yourself:

```html
<!-- orun:manifest
{"version":1,"task":"GT-3","epic":"saas-work-gitops-teardown",
 "skills":[{"name":"orunbase","rev":"sha256:…"},{"name":"task-branch-pr","rev":"sha256:…"}]}
-->
```

- `task` — the key; it must match the branch.
- `epic` — the slug, when the task belongs to one.
- `skills` — every skill you followed in this session, at the revision you
  followed: the `orun-rev` in each `SKILL.md`'s frontmatter, or the `rev`
  `skills_list` reports. An empty list fails `skill-pins` in `required` mode;
  a revision the registry never published fails `skill-current`.

The block is parsed, not pattern-matched: valid JSON between the markers,
anywhere in the body. `orun pr open` writes the same block for those who
have it; edit the body rather than opening a second PR when you got it
wrong.

## When the check goes red

The `orun/compliance` check failing means the lineage is wrong, not that the code
is bad: a branch off the grammar, a commit without the trailer, a manifest
with no pins, a contract the tree lacks. Each finding names the rule
(`orunbase` §3) and the fix. Fix the lineage on the same branch and push
again — the manifest is read from the PR body as it was when the push
arrived, so edit the body first. Never argue with the evidence, and never
delete the labels the App applied; they self-heal.
