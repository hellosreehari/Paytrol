---
orun-rev: sha256:f38dd7ebd94687af082ded957a77dc08741ab0084dff1eda614694ef6bd5f8fc
orun-source: default
name: vercel-to-orun
title: Vercel to Orun — port a Vercel app to Cloudflare through Orunbase
description: "Port a project that runs on Vercel onto Cloudflare Workers (and Supabase when it needs Postgres) through Orunbase. Given only a Vercel repo URL, it surveys the app, plans the port, creates the new repo and Orun workspace, makes the code changes Workers force, wires intent.yaml, components and CI, lands everything through the task, branch and PR discipline, deploys stage and prod, verifies them live, and writes a report. Use it whenever someone wants to move a Next.js, Astro, Nuxt, SvelteKit, Remix, Vite or Hono app off Vercel, asks to \"convert this Vercel project to Orun\", \"port to Cloudflare\", \"migrate off Vercel\", \"get this running on Workers\", or shares a repo that has a vercel.json, @vercel/* packages or a Vercel deploy badge and wants it on Orunbase. Also use it for the assessment alone (\"can this run on Cloudflare?\", \"what would porting X take?\"): it stops after the survey and port plan."
appliesTo: [implementer, bootstrapper, orchestrator]
---

# Vercel to Orun

You take a repository that deploys on Vercel and make it run on Cloudflare
Workers, deployed by Orun from `main`, with stage and prod verified live.
Whatever runs outside Vercel today (a hosted database, auth, payments, a CMS,
AI APIs) stays where it is: the port is the hosting layer plus the changes
the Workers runtime forces. Two lanes:

- **cloudflare**: Workers + static assets, with KV, D1, R2, Durable Objects,
  Cron Triggers and Images where the app needs them.
- **cloudflare+supabase**: the same, plus a Supabase project per environment
  (and Hyperdrive when the app opens a Postgres socket), when the app's
  database was Vercel Postgres or a Postgres it should now own.

Every rule here comes from a build or deploy that failed once; the why is
given so you can judge cases it does not name.

The bundle: `references/` (read on demand, map below) and `templates/`
(files the port copies; `templates/scripts/` holds the tools, run with
`python3` or `bash`). `<skill>` below is this skill's directory.

## Inputs

The only required input is the Vercel repo (a GitHub URL or `owner/name`).
It may be a folder of a monorepo (`.../tree/<branch>/<path>`, common for
template collections): the new repo then holds only that folder, with its
history (`git subtree split --prefix <path>`), and workspace dependencies
on sibling packages become published versions.
Settle the rest in one message before spending anything, using defaults
the person can override:

| Input | Default |
|---|---|
| Mode | `full` (port and go live). `survey` = stop after the port plan |
| Target GitHub owner and repo name | the org the person works in; repo name = upstream name |
| Visibility | upstream's: public stays public. AGPL/GPL code served to users must stay public |
| Orun account | the person's account that already has a Cloudflare connection |
| Cloudflare connection | the account's connection (`orun integrations list`), on Workers Paid: Free's 10 ms of CPU per request is too little for server rendering, and Free allows 5 cron triggers per account |
| Supabase connection | only for the cloudflare+supabase lane |
| Consent to write workspace secrets | ask explicitly: writing credentials is the person's decision |

Never invent third-party credentials (database URLs, auth keys, payment
keys). Wire them as optional and placeholder, ship what works without them,
and list them as credential tails in the report.

## The phases

Keep a running notes file (`<workdir>/<project>-port-notes.md`) with a
timestamped line per decision, failure and fix. It becomes the report.

### 0. Preflight

Check `orun version` and `orun auth status`, `gh auth status`, and a
working Node (22 or later) and pnpm (use `corepack`). This flow needs the
`orun` binary signed in; `orun-cli` is the only place that says how. If the
machine's Node is broken, try the other installed versions before giving
up, and never reinstall the person's toolchain without asking. Read
`references/orun-wiring.md` §Preflight for the exact commands, including
finding the workers.dev subdomain and the versions to pin. Stop and tell the
person if a row fails.

### 1. Survey and plan (read-only)

Clone the upstream (full history) into a scratch directory and run
`python3 <skill>/templates/scripts/survey.py <clone>`. Then read the code
behind every signal it raises and fill the port plan in
`references/survey.md`: the apps and their framework recipe, the lane, each
Vercel feature and its replacement, bindings and infra roots, external
backends, credential tails, size and runtime risks, out-of-scope parts,
milestones. `references/mapping.md` is the feature table;
`references/frameworks.md` the per-framework recipes.

In `survey` mode, deliver the plan and stop. In `full` mode, show the
person the plan's summary (lane, what changes, what will not work until
which credential arrives) and continue unless they object; they asked for
the port, so do not wait for approval on details.

If a part is out of scope (non-JS serverless functions, a WebSocket server,
native modules with no web alternative, a build that needs live
credentials), say so in the plan and port the rest; never silently drop it.

### 2. Repo, workspace and work plane

Create the new repo with the upstream history (`git push` of upstream
`main`, not a GitHub fork: a fork's PRs default to the upstream repo), the
workspace in the chosen account, link the repo, and mint the
connection-backed secrets (`references/orun-wiring.md` §Workspace and
§Secrets). Then the work plane: the port's epic, its milestones
(`references/survey.md` §Milestones) and one task per milestone, following
`initiative-lifecycle` and `design-authoring`; `references/work-discipline.md`
has what is particular to a port.

### 3. Port locally until it runs on workerd

Make the changes the plan names, the smallest diff that runs on Workers.
Keep the upstream layout: a root app stays at the root (Orun declares it
inline), so the upstream's open PRs still apply. Then prove it locally:

1. Build the Worker (`references/frameworks.md` per framework; Next.js:
   load the `nextjs-on-workers` skill).
2. Measure: `wrangler deploy --dry-run --outdir <dir>` and
   `python3 <skill>/templates/scripts/bundle-report.py <dir> --handler <handler>`.
   The limit is 64 MiB uncompressed on every plan, and a Worker whose
   startup takes over 1 s is refused. Fix either here, not in CI.
3. Serve with `wrangler dev` and run
   `bash <skill>/templates/scripts/route-matrix.sh` over the public routes,
   the auth redirects and the static files. Read the `wrangler dev` log for
   runtime errors (a 500 shows its cause there).
4. Run the upstream's own checks (typecheck, lint, format, tests). A test
   that fails on unmodified upstream `main` on this machine is not yours;
   prove it with a worktree of upstream before saying so.

### 4. Orun wiring

Stamp the templates into the repo with
`python3 <skill>/templates/scripts/stamp.py` (one run per app; it lists what
is left to fill), then validate with `orun validate` and a local
`orun plan --trigger github-push-main --all`: check the plan's order (infra
roots, then stage, then prod) and that no job renders `<no value>`. Read
`references/orun-wiring.md` before writing `intent.yaml`: it holds the rules
that make the first deploy pass (change inputs, parameters without
defaults, isolation, the base branch, secret delivery, smoke checks).
Supabase lane: `references/supabase-lane.md`.

### 5. Land and go live

Land one task per PR with `task-branch-pr` and `pr-provenance` (branch,
trailer, manifest), each merged only on green checks; the manifest pins this
skill's revision beside the others you followed. Turn on `ORUN_CI` once the
secrets exist. The merge that lands the wiring deploys: watch the run
(`runs_list`, `runs_get`, `runs_read_logs`) and fix forward, one new task per
fix. Each failure should match a row in `references/troubleshooting.md`; add
the row if not.

Verify live in both environments: `route-matrix.sh` on stage and prod, then
load the main page in a real browser and read the console. Only errors
explained by missing credential tails may remain.

### 6. Hand over

A last PR: a README section (live URLs, local Workers build, how a change
ships, the steps to finish the cut-over: each credential tail, the custom
domain, Workers Paid), configuration docs that replace the Vercel setup,
removal of `vercel.json`, and the epic's status file with every departure
from upstream and from the design. Then the report (template in
`references/survey.md` §Report) with live URLs, sizes, the route matrix,
every failure and fix, what is left, and platform gaps found.

## Guardrails

- Credentials: secrets go in through stdin or Orun's brokers, never on a
  command line, in a file you commit, or in a log. Generated values (cookie
  passwords) are piped from `openssl rand` straight into `orun secrets set`.
- One task per PR; never merge on red; never skip or quarantine a test.
- Never force-push a branch someone else works on; your own stacked task
  branches may be rebased and pushed `--force-with-lease`.
- Do not touch the upstream repository (no PRs, issues or pushes there)
  unless the person asks.
- Respect the upstream's own conventions file (AGENTS.md, CLAUDE.md,
  CONTRIBUTING): its style rules apply to the files you add.
- Ask before anything irreversible beyond the agreed scope: deleting
  resources, moving DNS, touching a production domain.

## Reference map

| File | Read it when |
|---|---|
| `references/survey.md` | phase 1; the port plan, milestones and report templates |
| `references/mapping.md` | deciding what replaces each Vercel feature |
| `references/frameworks.md` | building a non-Next app, or any app's Worker config |
| `references/orun-wiring.md` | phases 0, 2, 4, 5: workspace, secrets, intent, CI |
| `references/supabase-lane.md` | the cloudflare+supabase lane |
| `references/work-discipline.md` | the port's epic, stacked PRs, the status file |
| `references/troubleshooting.md` | any failure; check here first |

Next.js has a skill of its own, `nextjs-on-workers` (versions, OpenNext or
vinext, caching, size, middleware, Postgres, images): load it for any Next
app. Its `<v2o>` paths are this skill's directory.
