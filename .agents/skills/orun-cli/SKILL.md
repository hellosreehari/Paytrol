---
orun-rev: sha256:8c475ab27e312b0f7bf78453bab1ee64d9c8f77d033a3c9986a654b85ec229d9
orun-source: default
name: orun-cli
title: "The orun CLI: when you have it, and how to sign it in"
description: "The advanced path. Every Orunbase practice is met with git, gh and the MCP tools; the orun binary adds shortcuts (pr check, pr open, pr land, task check, task attach, skills pull, plan and run) for those who have it. This is the ONLY skill that explains authentication — device login, browser login, ORUN_TOKEN on a runner — and the rules around credentials. Load it when orun is on PATH, when a step says 'with orun', or when you must sign the CLI in."
appliesTo: [implementer, initiative-owner, bootstrapper, orchestrator]
---
# The orun CLI

`orun` is the open-source CLI Orunbase's CI runs. You do not need it: the
playbooks in this registry are written for `git`, `gh` and the MCP tools,
and CI judges the result the same way whichever you used. What the binary
adds is speed — the preflight that names a finding before the PR exists,
the landing that waits for the checks — and two things nothing else does:
a local `orun plan` against the platform, and `orun agent run`.

## When to want it

| You want to… | The shortcut | Without it |
|---|---|---|
| check the branch, the trailers and one-task-one-PR before pushing | `orun pr check --base origin/main` | push and read the `orun/compliance` check |
| open the PR with the manifest written for you | `orun pr open --task <KEY> --epic <slug>` | `gh pr create` with the block from `pr-provenance` |
| land when green and return to a pulled main | `orun pr land --number <n>` | `gh pr checks --watch`, `gh pr merge --squash` |
| compare the diff with the contract's `affects` | `orun task check <KEY> --base main` | read the contract and the diff |
| attach a contract to a task the tracker minted | `orun task attach <KEY>` | `task_create` with the contract inline (platform epics only); ask whoever has the binary |
| install or refresh the skills from the registry | `orun skills pull --client claude-code` (or `codex`, `cursor`, `vscode`; `--project` for the repository's directory) | the mirror at `https://orunbase.com/skills/index.json` |
| serve the tool plane locally | `orun mcp serve` (stdio) | the Orunbase connector |
| plan or converge intent from your machine | `orun plan`, `orun run` | CI does it on merge |

## Install

```sh
curl -fsSL https://orun.dev/install.sh | sh     # into ~/.local/bin
orun version                                     # v2.70.0 or later
```

If `~/.local/bin` is not on `PATH`, tell the user the one line to add to
their shell profile rather than editing their dotfiles silently.

## Sign in

The CLI needs its own login; MCP and `gh` logins do not carry over. Choose
the flow for where you are:

**A machine without a browser (a container, a cloud session, a runner
you are typing into):**

```sh
orun auth login --device
```

It prints a **pairing code and a URL**. Show both to the user verbatim and
wait; the code is a one-time pairing code, not a credential, and it expires
in a few minutes. If your harness refuses to run this, ask the user to run
it themselves in the same shell (Claude Code: `! orun auth login --device`).

**A machine with a browser where the user is present:**

```sh
orun auth login
```

**A headless runner (CI, a scheduled job):** the user mints an API key in
the console under **Settings → API keys** and exports it as `ORUN_TOKEN`.
GitHub Actions needs neither: `sourceplane/orun-action` exchanges the
job's OIDC token, which is how CI's own jobs authenticate.

Then verify, and check the workspace:

```sh
orun auth status
```

The `Orgs` list must include the workspace `intent.yaml` names
(`execution.state.workspace`). If it does not, **stop and tell the user**:
the account you signed in with is not a member of that workspace, and only
they can fix it (grant the membership, or sign in with the right account).
Do not try other workspaces.

## The rules around credentials

- **Never** read, print, echo or copy the credential file, and never ask
  the user to paste a credential into the chat. Every call you make later
  carries this login, and the platform's roles, audit log and metering
  apply to it.
- A secret travels only through standard input or a 0600 file; never on a
  command line, never in a notes file, never in a commit.
- The local MCP server (`orun mcp serve`) reuses the CLI's login. The
  remote connector has its own — a human authorised it once — and it may
  be a different account; `whoami` says which.
- Nothing you do to a repository needs a credential in your session: the
  PR is your identity, and CI holds its own.

## With the binary, the pen in four lines

```sh
orun githooks install                      # once per clone: the commit-msg hook stamps Orun-Task
orun pr check <KEY> --base origin/main
orun pr open --task <KEY> --epic <slug> --title "<CODE>n: <name>" --body-file body.md
orun pr land --number <n>
```

Everything else in `task-branch-pr` stays the same.
