# Survey, port plan, report

## Contents
1. Running the survey
2. Reading the signals
3. Choosing the lane
4. What is out of scope
5. Port plan template
6. Milestones
7. Report template

## 1. Running the survey

```bash
git clone https://github.com/<owner>/<repo>.git <scratch>/upstream   # full history
python3 <skill>/templates/scripts/survey.py <scratch>/upstream > <scratch>/survey.md
```

Then read, at minimum: the root and every app's `package.json`, `vercel.json`,
the framework config (`next.config.*`, `astro.config.*`...), middleware or
`proxy.ts`, `instrumentation.*`, the env example file, the README's deploy
section and any `docs/` page on hosting or configuration, and the upstream's
CI workflow (it becomes your merge gate). Check the live site
(`curl -sI https://<domain>`: a `server: Vercel` header and the status tell
you whether it is up and on Vercel) and the default branch's recent CI.

The survey is a heuristic. Its job is to point you at files; the decisions
come from reading them.

"Proven" in this skill means one earlier port ran it, on that app's code.
It lowers the odds, it does not settle this app: an app whose core lives in
an experimental adapter path (all routing in `proxy.ts`, Node middleware,
a WebAssembly SDK) gets that path as a named risk with a fallback, checked
by the first local `wrangler dev` build, not waved through as proven.

## 2. Reading the signals

For each signal, decide one of: **keep** (works on Workers unchanged),
**replace** (Cloudflare or Orun equivalent), **rewrite** (code change),
**gate** (wired but waiting on a credential), **out of scope**.

| Signal | What to check |
|---|---|
| framework + version | the recipe in `frameworks.md`; for Next, the adapter's minimum Next version and what `npx vinext check` reports (the `nextjs-on-workers` skill) |
| several apps (`apps/*`, `demos/*`) | one Worker component each; which one the domain serves; how they reference each other (iframes, origins) |
| `vercel.json` crons | Cron Triggers via a custom Worker entry |
| `vercel.json` rewrites/redirects/headers | framework config, or `_redirects`/`_headers` in static assets |
| `vercel.json` functions (maxDuration, memory, regions) | Workers CPU limits; long jobs move to Queues/Workflows or stay external |
| runtime fs read, `process.cwd()` | Workers have no filesystem at request time: bundle at build or serve from assets |
| `use cache`, `revalidate*`, ISR, `unstable_cache()` | needs an incremental cache binding (KV) |
| `next/og`, `@vercel/og` | fonts and images must be bundled, not read from disk |
| `next/image` remote | Cloudflare Images binding, or `unoptimized` |
| `waitUntil`/`after`, geolocation headers, `VERCEL_*` env | `ctx.waitUntil`, `request.cf`, explicit env vars |
| data SDKs | lane and bindings (§3) |
| auth in middleware | the middleware runs on every request: its env must be complete at runtime or every page 500s |
| native modules, headless browsers | web alternative or out of scope |
| size risks (Shiki, editors, SDKs with WebAssembly, Studio packages) | budget them now (`nextjs-on-workers` §Size) |
| Drizzle with `postgres` (Postgres.js), `prepare: false` | switch to `pg` before Hyperdrive (`supabase-lane.md` §1) |
| env vars | split: build-time public, runtime secret, runtime plain, Vercel system |

## 3. Choosing the lane

- Data lives outside Vercel already (a hosted database, a
  backend-as-a-service, a CMS the team owns): **cloudflare**, keep the
  backend, deploy it with a `gated-deploy` component if it has a deploy
  step (functions it pushes, migrations against its own database), else
  nothing.
- Vercel Postgres, or a Postgres the product should own going forward:
  **cloudflare+supabase**. Hyperdrive only if the app opens a socket
  (Drizzle, Prisma with a pg adapter, `pg`, `postgres`); not for
  `@supabase/supabase-js` (PostgREST over HTTP).
- Vercel KV / Upstash: Upstash keeps working over REST (keep, as a
  credential tail) or move to Workers KV behind the same surface (no
  credential needed: preferred when the usage is simple get/set/incr).
- Vercel Blob: R2. Flag it: the standard `workers-deploy` token cannot
  create R2 buckets; it needs a token scoped for R2 (see `mapping.md`).
- SQLite or simple relational needs without Postgres features: D1.

## 4. What is out of scope

Port the rest and name these in the plan:

- Serverless functions in Python, Go, Ruby or Rust (`api/*.py`...):
  container lane.
- A long-lived server (Express listening on a port, WebSocket server,
  socket.io): rewrite to Hono, Durable Objects, or a container.
- Native modules without a web alternative, `node:child_process` at runtime,
  headless Chrome at runtime (Browser Rendering is a separate product).
- Builds that need live credentials (GraphQL codegen against a live CMS
  endpoint): possible only once the credential is stored as a build secret.
- Vercel-only products with no Cloudflare twin (Vercel Sandbox, v0
  integrations): name the replacement or drop.

## 5. Port plan template

```markdown
# Port plan: <project>

**Verdict:** <portable / portable with N gated features / partly portable (what is not)>.
**Lane:** cloudflare | cloudflare+supabase. **Apps:** <n>. **Estimated Workers:** <names>.

## What runs where today
| Part | Today | After |
|---|---|---|
| <app> | Vercel project <name> | Worker <project>-<app>-<env> (<recipe>) |
| <backend> | <service> | unchanged / gated-deploy / Supabase project |

## Vercel features and their replacements
| Feature (file) | Replacement | Kind (keep/replace/rewrite/gate) |

## Code changes Workers force
1. <change> (<files>), because <reason>.

## Bindings and infra roots
| Root/binding | Why | Wiring keys |

## Secrets
| Name | Source (broker template / generated / owner) | Used by |

## Credential tails (work once the owner provides them)
- <credential>: what does not work until then.

## Risks
| Risk | Likelihood | How we will know early | Fallback |

## Out of scope
- <part>: why, and what it would take.

## Milestones
<see §6>
```

## 6. Milestones

One task per milestone at the start; fixes found while going live become
extra tasks under the live milestone.

| Milestone | Lands | Done when |
|---|---|---|
| X0 the spec | design doc set, task contracts | merged |
| X1 the app runs on Workers | adapter, config, forced code changes | Worker under 64 MiB uncompressed and deploys (startup under 1 s); `wrangler dev` passes the route matrix; upstream checks green |
| X2 Orun runs it | intent, compositions, infra roots, CI | `orun plan` resolves; a PR plans and verifies |
| X3 live on stage and prod | the first convergence, fixes | route matrix passes live in both; browser console clean of port errors |
| X4 ready to hand over | README, docs, status file | the owner can finish the cut-over from the README |

## 7. Report template

```markdown
# <project> on Orunbase: port report

## Outcome
<one paragraph: what is live, what waits on whom>
| Environment | <app> | <app> |
## Status
| Milestone | Tasks | PRs | State |
## What was created
| Thing | Value |   (repo, workspace id/account, link, connection, epic, tasks)
## Measured results
| Check | Result |  (sizes, route matrix per env, browser console, upstream checks)
## Problems found, and fixes
| # | Problem | Fix |
## What is left
<credential tails, domain cut-over, platform gaps>
```
