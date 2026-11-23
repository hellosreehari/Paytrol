---
orun-rev: sha256:d070d616a00b1fe03e17062e1daf4c95d05509090b2b563f9a511f268938e73a
orun-source: default
name: mcp-tools
title: The Orunbase MCP tools, by job
description: "Which Orunbase MCP tool answers which question — 35 tools (26 read-only, 9 that write), the order to call them in when diagnosing a failed run, a service, an access question or a task's verdict, and the rules for using a result. Use whenever you are about to answer a question about a workspace or call an orun MCP tool."
appliesTo: [implementer, initiative-owner, orchestrator, reviewer, bootstrapper]
---
# The Orunbase MCP tools — which one for which job

The Orunbase connector in your session, or the local `orun mcp serve`, is
one tool plane. Everything it answers is the workspace's record: what deployed, what ran, what it cost,
who may do what, and the work plane (epics, milestones, tasks, skills). Use
it instead of reading files at random or remembering.

## Rules of use

- **Scope every call.** Every tool takes `workspace` (a `ws_…` from `whoami`
  or `workspaces_list`). A bare slug is refused when two accounts share it.
- **Read before you claim.** A number, a status, an owner or a verdict in
  your answer comes from a tool result you can name. If no tool answers,
  say so.
- **Read-only first.** The tools marked ✓ below change nothing; call them
  freely. The others WRITE — they are policy-gated, they leave an audit row,
  and you ask before calling one unless the user's instruction already named
  it.
- **Start with the facts.** "How is the workspace / this component / this
  epic doing": `insights_get` — runs, steps, changed components, pull
  requests, tasks, epics, headwinds and flow over a window, compared with
  the window before, as a report you can quote and JSON you can compute
  on; `groupBy: component` for the leaderboard. Then drill in below.
- **Diagnose in order.** A failing delivery: `runs_list` → `runs_get` (the
  job DAG) → `runs_read_logs` (the failing job, paged by `nextSeq`). A
  question about a service: `catalog_search` → `catalog_get_entity` →
  `catalog_read_doc`. A "why can't I": `access_explain`. A "what changed":
  `events_search` for the typed stream, `audit_search` for who did it.
- **The work plane is the record of work.** `task_get` gives a task's
  contract and DERIVED verdict — the rung and the evidence — which is what
  "is it done" means here. Before attaching a contract, `policy_preview`
  says which secrets it would stop resolving.
- **A mirrored epic is the tracker's.** For an epic that mirrors a Linear
  project, its title, state, description, milestones and the membership of
  its issues are edited in the tracker; a write here answers 412 `mirrored`
  and names it, and the change arrives by itself. Owner, target date and
  health stay writable. `epic_create`, `milestone_create` and `task_create`
  are for work the workspace creates in Orunbase; which that is, is the
  workspace's Work setting. Nothing in a repository declares work.
- **Skills are policy.** `skills_list` and `skill_get` are the registry the
  `orunbase` skill told you to check at session start; pin the `rev` you
  ran under.

## The tools

Generated from the server's own manifest (`packages/mcp/tool-manifest.json`)
by `pnpm --filter @saas/mcp emit:skill`; edit the preface beside this file,
not the table.

| Tool | Read-only | What it answers |
|---|---|---|
| `access_explain` | ✓ | Answer "who can do what here, and via which grant": effective permissions with provenance (direct / team / account-cascade) plus the work… |
| `audit_search` | ✓ | Search the workspace's immutable audit log (one page per call): filter by time range (`from`/`to`, ISO-8601), actor, subject, event type,… |
| `billing_summary` | ✓ | Read a workspace's billing posture: current plan, subscription, customer status, and the full entitlement set (plan + overrides). |
| `bootstrap_get` | ✓ | The resolved bootstrap behind a `bst_…` id from the console's Review step: baseline at its tag, repository, every input (the console's va… |
| `catalog_get_entity` | ✓ | Fetch one catalog entity by its exact entityRef (e.g. `component:default/api`): identity, owner, relations, and provenance. |
| `catalog_read_doc` | ✓ | Browse the workspace's git-authored catalog docs (filter by `entityRef`, `role`, `project`, `q`), or pass `digest` (from a browse row or… |
| `catalog_search` | ✓ | Search the workspace's org-wide service catalog (the merged, git-derived component graph). |
| `config_read` | ✓ | Read the settings and feature flags at one config scope — organization (default), project, or project+environment. |
| `events_search` | ✓ | Explore the workspace's typed event stream (one page per call): filter by `type` glob, `source`, project/environment, and time range — or… |
| `insights_get` | ✓ | How a workspace, component, repo, team or epic is performing over a window: runs, steps, changed components, pull requests, tasks, epics,… |
| `policy_preview` | ✓ | Answer "if this contract were attached, which secrets would stop resolving?" BEFORE attaching it — attaching without previewing is a blin… |
| `projects_list` | ✓ | List the projects (git repos) in a workspace. |
| `quota_check` | ✓ | Check one `metric` against the workspace's quota: allowed/limit/used/remaining plus period and enforcement mode. |
| `runs_get` | ✓ | Fetch one run's projection plus its plan-DAG job statuses — the starting point for diagnosing a failed run. |
| `runs_list` | ✓ | List delivery runs, newest first — org-wide when only `workspace` is given, or one project's history when `project` is set. |
| `runs_read_logs` | ✓ | Read one job's assembled logs (byte-capped) with a live-tail cursor: pass the returned `nextSeq` back as `fromSeq` to resume where you le… |
| `secrets_list` | ✓ | List secret METADATA (keys, versions, rotation state) at one config scope. |
| `security_events_list` | ✓ | List the calling actor's authentication/session security events (sign-ins, session lifecycle, failures), newest first. |
| `skill_get` | ✓ | One skill's body and frontmatter — the latest revision, or exactly the one `rev` pins (sha256:<hex> from `skills_list` or a PR manifest)… |
| `skills_list` | ✓ | Every skill's latest revision: name, content-addressed rev (sha256 of the canonical body — pin it; sessions record the revisions they ran… |
| `task_get` | ✓ | One ref, the full picture. |
| `task_list` | ✓ | List the workspace's tasks (newest first) — key, key origin (adopted from a tracker vs derived by orun), mirrored title with its sync age… |
| `usage_summary` | ✓ | Summarize a workspace's metered usage for one `metric` (totals plus hour/day rollups), optionally narrowed by project/environment and a t… |
| `webhook_deliveries_list` | ✓ | Debug webhook delivery failures: pass `endpoint` (`whep_…`) to page through that endpoint's delivery attempts, newest first; omit it to l… |
| `whoami` | ✓ | Identify the authenticated actor and list the workspaces they belong to (with roles where the API reports them). |
| `workspaces_list` | ✓ | List the workspaces the caller is a member of: slugs, `ws_…` refs, and kind (account/workspace). |
| `environment_create` | **writes** | Create a new environment (e.g. staging) under a project. |
| `epic_create` | **writes** | Create an orun-native epic — the container tasks and milestones club under (e.g. an infra baselining programme). |
| `flag_set` | **writes** | Set a feature flag at one config scope — organization (default), project, or project+environment: updates `enabled` and/or `value` for `f… |
| `member_invite` | **writes** | Invite a person to a workspace by email with an organization role (they join once they accept). |
| `milestone_create` | **writes** | Add a milestone — a PHASE — to an orun-native epic, in order: `after` names the sibling it follows (`null` = first, omitted = last). |
| `project_create` | **writes** | Create a new project (git repo) in a workspace. |
| `task_create` | **writes** | Create a task — the unit of WORK (not a run, not a ticket). |
| `webhook_create` | **writes** | Create a webhook endpoint (delivery URL) in a workspace — optionally project-scoped via `project` — and subscribe it to the given `events… |
| `webhook_delivery_replay` | **writes** | Re-send a past webhook delivery attempt to its endpoint through the normal signing/delivery path; returns the NEW attempt with its post-d… |

## Prompts the server also offers

- `investigate_failed_run` — Diagnose a failed delivery run: find it, read the failing jobs' logs, and summarize the root cause with verifiable ids.
- `access_review` — Review who can do what in a workspace, via which grant, cross-checked against recent security and audit activity.
- `usage_review` — Review usage against quotas and plan entitlements; flag anomalies and dimensions nearing their limits.
- `service_snapshot` — One-shot service brief: catalog identity + owner + relations, its docs, and recent delivery health.
