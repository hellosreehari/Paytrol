# Orun wiring

## Contents
1. Preflight
2. Repo and workspace
3. Secrets
4. Repository files (templates)
5. intent.yaml rules that make the first deploy pass
6. Wiring: binding ids per environment
7. CI workflow
8. Going live and watching it
9. Platform gaps seen so far

## 1. Preflight

```bash
orun version && orun auth status          # signed in; orgs list includes the target account
gh auth status                            # token with repo + workflow scopes
corepack --version && node --version      # Node 22+; if it will not start, try another installed Node
orun integrations list --workspace <any workspace in the account>   # Cloudflare (and Supabase) connections
```

- **Account id**: `orun auth status` lists orgs; the account's `ws_...` id
  comes from MCP `whoami` (`workspaces[].accountId`).
- **workers.dev subdomain**: read it from any earlier Worker deploy in the
  same Cloudflare account (MCP `runs_read_logs` on a deploy job shows
  `https://<worker>.<subdomain>.workers.dev`), or ask.
- **Versions to pin**: the orun version and stack-tectonic tag the live
  Orun baselines pin (`gh api repos/sourceplane/lumen/contents/.github/workflows/ci.yml`
  and `.../intent.yaml`); pass them to `stamp.py --orun` and
  `--stack-tectonic`.
- **pnpm**: corepack with the repo's `packageManager`; put a shim first on
  PATH (`corepack enable pnpm --install-directory <dir>`) so tools that shell
  `pnpm` get the right major.

## 2. Repo and workspace

```bash
git clone --single-branch --branch <default> https://github.com/<up>/<repo>.git <workdir>/<repo>
cd <workdir>/<repo> && git remote rename origin upstream
gh repo create <owner>/<repo> --public|--private --description "<...> ported to Cloudflare Workers through Orunbase" --disable-wiki
git remote add origin https://github.com/<owner>/<repo>.git && git push -u origin <default>
```

Not `gh repo fork`: a fork's `gh pr create` targets the upstream by default.

Workspace in a named account (the CLI's `workspace create` has no account
flag in some versions; the API does it):

```bash
TOK=$(cd /tmp && orun auth token)          # into a variable, never echoed
printf 'Authorization: Bearer %s\n' "$TOK" > <scratch>/auth.hdr; unset TOK   # 0600, deleted at the end
curl -s -X POST https://api.orunbase.com/v1/organizations \
  -H @<scratch>/auth.hdr -H "Content-Type: application/json" \
  -H "Idempotency-Key: <repo>-ws-<date>" \
  -d '{"name":"<Product>","slug":"<repo>","accountId":"<ws_ACCOUNT>"}'
# → data.organization.workspaceRef is the ws_... id
export ORUN_WORKSPACE=<ws_NEW>
orun integrations list --workspace <slug>  # account connections are inherited
orun cloud link --workspace <slug> --project <repo>
```

The GitHub owner of the repo should be the GitHub installation connected to
the account (`orun integrations list` shows it). CI authenticates with
GitHub OIDC through the repo link either way, but Orunbase only sees pull
request events (task evidence, the `orun/compliance` check) for repos under
the connected installation. If they differ, tasks stay at `ready`: say so
in the report, or put the repo under the connected owner.

## 3. Secrets

Writing secrets needs the person's explicit yes (auto-mode safety checks
refuse it otherwise). Ask once, listing them. Create them at the project
rung (`--project`): environments only exist after the first plan, and every
environment inherits the project rung.

| Secret | How | Used by |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | `orun integrations cloudflare secret create CLOUDFLARE_API_TOKEN --connection <int_cf> --template workers-deploy --project` (brokered per run: Workers scripts + KV) | Terraform roots, deploys |
| `CLOUDFLARE_ACCOUNT_ID` | same, `--template account-id` | same |
| `CLOUDFLARE_D1_TOKEN` | `--template d1-edit` | the D1 root |
| `CLOUDFLARE_HYPERDRIVE_TOKEN` | `--template hyperdrive-edit` | the Hyperdrive root |
| `CLOUDFLARE_DNS_TOKEN` | `--template dns-edit` | the domain cut-over (wildcard routes, Custom Domains, DNS records); confirm its scope covers Workers Routes with `orun integrations cloudflare templates list` before relying on it |
| `SUPABASE_ACCESS_TOKEN`, `SUPABASE_ORG_ID` | `orun integrations supabase secret create <KEY> --connection <int_sb> --template management-access` / `org-id` | the Supabase root |
| generated app secrets (cookie passwords, AUTH_SECRET, CRON_SECRET) | `openssl rand -base64 48 \| tr -d '\n' \| orun secrets set <KEY> --project` | `secretEnv` + `workerSecrets` |
| owner credentials (DB URLs, API keys, deploy keys) | the owner runs `orun secrets set <KEY> --env <env>` later | `optionalSecretEnv` until then |

`orun integrations cloudflare templates list` shows the templates the
connection offers. There is no R2-admin template in the standard set: an
R2 bucket root needs a broader token the person provides.

Check with MCP `secrets_list` (metadata only).

## 4. Repository files (templates)

Stamp them with `templates/scripts/stamp.py`: it copies what the plan calls for,
fills the placeholders, sets the framework's entry, assets and config,
adds a binding per root to the wrangler template, writes the fixture, adds
`.gitignore` lines, writes the cron entry when `vercel.json` has `crons`,
picks the Supabase or D1 migrations variant for `--db-migrate`, checks the
Next config (`standalone`, `cacheComponents`), and lists what is left to
fill by hand.

```bash
python3 <skill>/templates/scripts/stamp.py --repo <checkout> --project <repo> --ws <ws_...> \
  --owner <gh-owner> --subdomain <workers.dev subdomain> --smoke-text "<home page text>" \
  [--app-dir apps/web] [--app-name web] [--framework next|astro|nuxt|sveltekit|react-router|static] \
  [--roots next-cache-kv,cloudflare-kv,cloudflare-d1,cloudflare-r2,supabase,cloudflare-hyperdrive] \
  [--db-migrate] [--gated-deploy] [--fill-standalone] [--dry-run]
```

It never overwrites without `--force`, so a second app in the same repo is
a second run with `--app-dir`; merge its lines into what the first wrote
(one `intent.yaml`, one fixture). What it places, by hand if you prefer
(placeholders: `__PROJECT__`, `__WS__`, `__SUBDOMAIN__`, `__OWNER__`,
`__STACK_TECTONIC__`, `__ORUN_VERSION__`, `__PNPM_VERSION__`, `__WORKER__`,
`__SMOKE_TEXT__`, `__APP__`):

| Template | Goes to | When |
|---|---|---|
| `templates/repo/intent.template.yaml` | `intent.yaml` | always |
| `templates/repo/apps-app.component.template.yaml` | `apps/<app>/component.yaml` | apps not at the root |
| `templates/repo/infra/stack/` (`stack.yaml`, `workers-app`, `gated-deploy`) | `infra/stack/` | always (gated-deploy only with an external backend) |
| `templates/repo/infra/terraform/<root>/` (+ `shared/orun-variables.tf` as `terraform/orun-variables.tf`, `__ROOT__` = the root) | `infra/terraform/<root>/` | per binding the plan needs |
| `templates/repo/infra/db-migrate`, `packages-db` | `infra/db-migrate`, `packages/db` | Supabase lane with migrations |
| `templates/repo/infra/db-migrate-d1`, `packages-db-d1` | `infra/db-migrate`, `packages/db` | D1 with a schema (same runner, D1 HTTP API adapter; uses `CLOUDFLARE_D1_TOKEN`) |
| `templates/repo/tooling/wire/` | `tooling/wire/` | any wiring tokens |
| `templates/repo/tooling/opennext/fill-standalone.mjs` | `tooling/opennext/` | nested Next apps |
| `templates/repo/wiring.fixture.json` | `wiring.fixture.json` | any wiring tokens |
| `templates/repo/github/workflows/orun.yml` | `.github/workflows/orun.yml` | always (keep the upstream CI as the merge gate) |
| `templates/next/*` | app dir | Next apps |
| `templates/worker/*` | app dir | other frameworks (`assets-worker.js` for static sites) |

`.gitignore`: add `.open-next/`, `.wrangler/`, rendered `wrangler.jsonc`,
`.dev.vars*` (but not `.dev.vars.example`), generated modules, and
`**/.orun/` (the CLI writes an object-model cache there).

Files that tools index by name ship renamed (`*.template.yaml` for
components and the intent, `package.template.json`), so a copy of this
bundle inside a repository is never planned as a component or resolved as a
workspace package; they go in under their real names. Infra roots' components reference
`secret://__WS__/__PROJECT__/{{ .environment }}/<KEY>`.

## 5. intent.yaml rules that make the first deploy pass

Each of these failed a real deploy once:

- **Root apps are inline components** (`components:` in intent.yaml,
  `path: .`), so the upstream layout stays. Infra roots and `apps/*` keep
  their own `component.yaml`, found through `discovery.roots`.
- **A root-path component owns no files** under `orun plan --changed`.
  Give it `change.inputs` (globs of what changes the Worker); give apps that
  import shared code the shared globs too. Without them, merges that change
  the app never redeploy it.
- **The first wiring PR only deploys what it changes.** A new intent.yaml
  is a "global" change, which selects only components whose files changed.
  Plan for the go-live: either the wiring PR also touches the app's inputs,
  or the next PR edits the components' blocks (a components-only intent
  change selects exactly the components it touches), or use the manual
  `on: workflow_dispatch` deploy.
- **Parameters have no defaults at render time.** orun renders composition
  templates without schema defaults: a missing parameter becomes
  `<no value>` in the shell. Set every parameter a step uses
  (`installCommand`, `verifyCommand`, `workerSecrets: ""` ...).
- **Wiring documents are optional secrets.** `WIRING_<ROOT>_<ENV>` exist
  only after the root's first apply, and a pull request lane resolves
  `secretEnv` before anything is applied: declare them under
  `optionalSecretEnv`, and render from the fixture when the deploy token is
  absent (the `buildCommand` in the template does this).
- **Worker secrets are written by the deploy job** (`workerSecrets`
  parameter → `worker-secrets` step → `wrangler secret bulk` on stdin),
  before smoke. Orun's `materialize` block does not work in CI with
  brokered tokens (§9). Secrets persist across deploys.
- **Smoke checks**: `curl -sfL --max-time 30` into a variable, match with a
  here-string. The smoke step runs with `pipefail`; `echo "$html" | grep -q`
  fails with SIGPIPE on pages over 64 KB even when the text is there.
  Smoke the page users load (behind middleware), not a side route.
- **Environments**: stage activates on PRs and merges; prod only on merges,
  `promotion.dependsOn: stage`. PRs then cost one build per app.
- **Lanes**: `lane: isolated` on each Next app (its build is the longest).
- **Local validation** before any PR:

  ```bash
  orun validate --intent intent.yaml
  orun plan --intent intent.yaml --output /tmp/plan.json --all --trigger github-push-main
  jq -r '.jobs[] | "\(.id) \(.profile) deps=\(.deps)"' /tmp/plan.json
  # after committing: what a PR would select
  orun plan --intent intent.yaml --output /tmp/pr.json --trigger github-pull-request --changed --base origin/main --head HEAD
  ```

  Build the CI's pinned orun from source (`git worktree add --detach <dir> vX.Y.Z`
  in a local orun checkout, `go build ./cmd/orun`) when local and CI plans
  disagree.

## 6. Wiring: binding ids per environment

`wrangler.template.jsonc` carries `@@wiring(<root>/__ENV__:<key>)@@`; the
root's Terraform `wiring` output is published as the `WIRING_<ROOT>` secret
per environment (`secretOutputs: "WIRING_<ROOT>=wiring"`). The app's build:

- deploy lane (token present): `tooling/wire/live.mjs --template ... --components <root> --env "$ORUN_ENVIRONMENT"` reads `WIRING_<ROOT>_<ENV>`;
- verify lane / local: `tooling/wire/render.mjs --map wiring.fixture.json --env <env>`.

`__ENV__` names the Worker (`<worker>-<env>`) and the self-reference
service binding. Unresolved tokens fail the render loudly.

## 7. CI workflow

`templates/repo/github/workflows/orun.yml` (the cirrus baseline's workflow,
with what real go-lives added; its comments say why):

- gated on the `ORUN_CI` repository variable (`gh variable set ORUN_CI --body true`), so the wiring can merge before secrets exist;
- pull requests create the local base branch before `orun plan --changed`;
- `orun run --isolation none`, because Turbopack refuses staged job trees;
- `on: workflow_dispatch` with `component` and `environment` inputs for manual deploys from main;
- one GitHub job per lane; `gh run rerun --failed` resumes the same orun execution.

Keep the upstream's CI as the merge gate. If it runs Prettier on changed
files, format every file you add (YAML and lockfile included).

## 8. Going live and watching it

After the merge that should deploy:

- MCP `runs_list` (workspace) → `runs_get` (job states and errors) →
  `runs_read_logs` (a job's log; deploy logs show size and URL).
  GitHub's job API lags; Orunbase's view is current.
- A lane that fails in seconds with `oidc exchange ... context deadline
  exceeded` is transient: cancel the run if other lanes wait on it, then
  `gh run rerun <id> --failed`.
- Check the live URLs with `templates/scripts/route-matrix.sh`, then a real browser's
  console.

## 9. Platform gaps seen so far

Name them in the report; `troubleshooting.md` §5 and §6 have each
workaround: `materialize` cannot write Worker secrets in CI (the token is
brokered per job), `--changed` needs the base branch locally and treats
`path: .` as owning nothing, job staging breaks Turbopack builds,
stack-tectonic's Workers composition expects a committed `wrangler.jsonc`,
and PR events reach Orunbase only for repos under the account's connected
GitHub installation.
