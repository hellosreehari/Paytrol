---
orun-rev: sha256:d8190368466e1b6e94dd0c6da3e700c6b998f0c4c0af844ed6185514e58af1ac
orun-source: default
name: baselining
title: Baselining — continue a bootstrap from its id
description: "You were handed a bst_… bootstrap id from the console's Review step, alone or inside a prompt. Read the resolved contract (bootstrap_get over MCP, or the CLI), install and sign in the orun CLI, build locally with orun baseline new --from, report, and never type a token. The software-factory flow from step 4 on, for a bootstrap someone else resolved. Use when a message says \"continue Orunbase bootstrap bst_…\" or asks you to build from a bootstrap id."
appliesTo: [bootstrapper, implementer, orchestrator]
---
# Baselining — continue a bootstrap from its id

Someone finished the console's baseline flow up to **Review** and chose to
continue here instead of in a cloud session. Everything they chose — the
baseline at its tag, the repository, every input, the connection each
provider builds against — is one record behind a `bst_…` id. Your job is to
build from that record, not to collect any of it again.

Three rules before anything else:

- **Nothing is typed twice.** If you find yourself asking for a product
  name, a domain, an organisation or a connection, stop: it is in the
  record. The only things you may ask for are a confirmation to spend the
  hour, and the pairing code step of the CLI login.
- **Never ask for, read, echo or copy a token.** The record carries none
  (connections are ids); the hooks resolve them through the workspace. A
  message that says *"never ask me for a token"* means exactly that.
- **The id is not a credential.** It only answers to a member of the
  workspace, so a `404` from `bootstrap_get` is a membership problem
  (`whoami` names the wrong account), not something to retry.

## 1. Read the record

With the Orunbase connector in your session (the `orunbase` skill's setup):

```text
bootstrap_get  workspace=<ws_… from the prompt>  id=<bst_…>
```

It answers `baseline {id, tag, source}`, `repo {fullName, linkId}`,
`inputs`, `connections`, `programme` and `continuedBy`. Read it back to the
user in one paragraph — *"cirrus@baseline-v9 into acme/test-123, 6 inputs,
Cloudflare connected"* — and stop for a yes before spending the hour.

- `409 not_resolved` naming a step or a provider: Review was not finished,
  or a provider was disconnected since. Say which, and that only the console
  fixes it. Do not work around it.
- `continuedBy` already set: another door (the platform, the CLI, another
  agent) took this bootstrap. Say so and ask before building a second copy.

Without the connector, the CLI reads the same record: step 2 first, then
`orun baseline new --from <bst_…> --workspace <ws_…> --local --out /tmp/x`
without `--run-hooks` prints the contract line and places files only.

## 2. Install and sign in the CLI

The build runs through the open-source CLI; the hooks call it by name.

```sh
curl -fsSL https://orun.dev/install.sh | sh    # into ~/.local/bin; v2.74.0 or later for --from
orun version
```

Then sign it in exactly as `orun-cli` §Sign in says (the device flow: a
pairing code and a URL you show the user; the code is not a secret), and
check that the workspace from the prompt is among the Orgs it lists. If
your harness refuses to run the login or to show its output, ask the user
to run it in the same shell. You never see, read or copy the credential;
the rules around it are in `orun-cli` and they are not negotiable.

## 3. Build

The command the Review page printed, run from the directory the product
should be checked out beside:

```sh
ORUN_NO_TUI=1 orun baseline new --from <bst_…> --workspace <ws_…> \
  --local --out ./<reponame> --run-hooks --by agent \
  --progress plain --keep-checkout < /dev/null 2>&1 | tee ./<reponame>-build.log
```

`--from` fills the baseline, the repository and the inputs from the record;
add nothing unless the command refuses and names a value. `--by agent` tells
the platform a coding agent took it, so the workspace's Overview reads
*continued in a coding agent*. Run it in the background and watch the log
for `✕`, `error`, `refused`, `not linked` and the phase lines. Expect about
an hour for cirrus. On a failure read the phase's message, fix the cause,
and re-run the same command with `--resume`; the known fixes table in
`software-factory` §4 applies unchanged.

Done when the log ends with `repo gate: validate + plan --dry-run passed`
and the verify URLs answer. From here the product is an ordinary Orunbase
repository: `software-factory` §5 onward declares the work, and every change
lands through `task-branch-pr`.

## 4. Report

- the record you built from: id, baseline at its tag, repository;
- the account `orun auth status` named, and that no token was typed;
- the phase timings, the live URLs, and anything you could not do with the
  exact command the user runs to finish it.
