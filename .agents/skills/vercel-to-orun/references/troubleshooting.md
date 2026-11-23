# Troubleshooting: symptom → cause → fix

Every row happened in a real port. Search this file for the error text
before debugging from scratch, and add a row whenever a port teaches a new
one.

## Contents
1. Local machine and install
2. Build
3. Size
4. On workerd (`wrangler dev` or live)
5. Orun plan and CI lanes
6. Deploy
7. Live, in the browser
8. Process

## 1. Local machine and install

| Symptom | Cause | Fix |
|---|---|---|
| `node` will not start (`dyld: Library not loaded: ...dylib`, or a missing shared library) | a package-manager upgrade broke one of the installed Node builds | use another installed Node (nvm, volta, an official tarball, another formula); never relink or reinstall the person's toolchain without asking |
| `ERR_PNPM_UNSUPPORTED_ENGINE` / wrong pnpm | the repo pins a pnpm (`packageManager`) the machine lacks | `corepack enable` or a corepack shim for that version; CI reads it from the component's `pnpmVersion` |
| `workerd` or `esbuild` missing binary at runtime | pnpm 10+ skips install scripts | `onlyBuiltDependencies: [workerd, esbuild, sharp]` (pnpm 10) or `allowBuilds: { workerd: true }` (pnpm 11) |
| A test times out on this machine | slow machine, not the port | run it on unmodified upstream `main`; if it fails there too, note it and move on |

## 2. Build

| Symptom | Cause | Fix |
|---|---|---|
| `@opennextjs/cloudflare ... requires next >=16.4.x` (peer) | the adapter raises its Next floor with security releases | upgrade `next`, `@next/mdx`, `eslint-config-next` to the floor; see the `nextjs-on-workers` skill §1 |
| Worker boots with `Unexpected loadManifest(preview-props.json)` | Next newer than the adapter knows | pin Next to the adapter's tested range until it catches up |
| `opennextjs-cloudflare build` fails the `engines` check | it shells `pnpm build` with the machine's pnpm | `<build> && opennextjs-cloudflare build --skipBuild` |
| `ENOENT ... .next/standalone/...` | no standalone output | `output: "standalone"` in `next.config` |
| `JavaScript heap out of memory` in `next build` / type check | Next 16 builds of big apps exceed 2 GB | `NODE_OPTIONS=--max-old-space-size=4096` (6144 in CI) |
| `Route ... used new Date() ... before accessing uncached data` (prerender) | Cache Components; often appears after removing fs reads, which used to defer the call | `experimental.useCache` instead of `cacheComponents` |
| esbuild `Unexpected expression of type <nil>` | esbuild bug with `--minify-syntax` on a Turbopack chunk; sometimes the adapter got an older esbuild via pnpm's hidden hoist | `packageExtensions` gives the adapter its own esbuild; if it still panics, `--noMinify` |
| `experimental.ppr` rejected / `runtime` export rejected in `proxy.ts` | Next 16 removed both | delete them (`ppr` is part of `cacheComponents`, which we avoid) |
| ESLint `circular structure` from `FlatCompat` | eslint-config-next 16 is flat-only | `defineConfig([...nextVitals, ...nextTs, globalIgnores([...])])` |
| New lint errors `react-hooks/set-state-in-effect`, `react-hooks/refs` | eslint-config-next 16 rules | turn the rule off in the config; do not rewrite upstream code for lint |
| Build throws at a module-scope SDK client (`createClient('', '')`, `new Stripe(undefined)`) | a credential-free build evaluates route modules | create the client per call, or a placeholder value in the build script only |
| ISR page fetches a third party at build and fails without credentials | build runs with no secrets | `force-dynamic` on that page, or remove its `generateStaticParams` |
| Nuxt ignores your `wrangler.jsonc` | Nitro writes its own | `cloudflare: { deployConfig: false }` |
| Astro build: `main` not found / `SESSION` KV binding with no id | the Cloudflare Vite plugin owns the entry; adapter enables sessions | no `main` in `wrangler.jsonc`; `session: false` |
| CI Prettier fails on `pnpm-lock.yaml` | upstream formats its lockfile | `prettier --write pnpm-lock.yaml` after every dependency change |

## 3. Size

| Symptom | Cause | Fix |
|---|---|---|
| `Your Worker exceeded the size limit` | over 64 MiB uncompressed (the only size limit since 2026-09-04; before, 10 MB compressed on Paid and 3 MB on Free): browser-only code rendered on the server, full Shiki, WebAssembly SDKs, embedded admin or editor UIs | `templates/scripts/bundle-report.py` to find it; `turbopack.resolveAlias` stand-ins; Shiki core; admin UIs client-only (`next/dynamic`, `ssr: false`). See the `nextjs-on-workers` skill §6 |
| `Script startup exceeded CPU time limit` (10021) | the global scope takes over 1 s: a big bundle, or work at module load (schema builds, SDK clients, large JSON parsed at import) | move the work into handlers or to build time; trim the bundle as above |
| Alias does nothing | the package is in `serverExternalPackages`, or aliased to itself | route the import through an app module (`@/lib/x`) and alias that |
| `Your Worker's source maps exceed 60 MiB` (10021) | source maps upload by default | `"upload_source_maps": false` |

## 4. On workerd (`wrangler dev` or live)

| Symptom | Cause | Fix |
|---|---|---|
| Every page through middleware/proxy answers 500 | auth SDK reads env at load and throws (no client id, a cookie secret that is too short, no keys) | placeholder public id as a var, generated secret as a Worker secret; real values later |
| `ENOENT` / `fs.readFile is not a function` on a route | fs at request time | generate a module at build (`templates/next/generate-server-content.mjs`), or the ASSETS binding |
| Prerendered routes answer 404 or 500 | no incremental cache for SSG pages | `staticAssetsIncrementalCache` + `populateCache local` (or KV + DO queue) |
| Requests hang forever | `cacheComponents: true` (opennextjs-cloudflare#1450) | `experimental.useCache` |
| Worker fails to start: `ChunkLoadError ... instrumentation` | a nested app's standalone trace misses server chunks | `tooling/opennext/fill-standalone.mjs` before OpenNext bundles |
| A new route (file serving, webhook, cron) answers 302/307 to machine callers | the app's middleware redirects every cookie-less request (guest or login redirect) and its matcher covers the new path | exempt the path in the middleware matcher |
| Calls to GitHub's API answer 403 | Workers send no User-Agent | set `User-Agent` on every server-side `fetch` to GitHub (and any API that requires one) |
| Postgres: `Cannot perform I/O on behalf of a different request` | module-level pool | client per request from `env.HYPERDRIVE.connectionString` |
| Postgres queries through Hyperdrive hang or fail now and then | Postgres.js with `prepare: false`, often under Drizzle (Cloudflare does not support Drizzle on Postgres.js) | `pg`, and Drizzle's `drizzle-orm/node-postgres` (`supabase-lane.md` §1) |
| `Disallowed operation called within global scope` (random values, `fetch`, timers at module load) | code that runs on import: a bcrypt/argon hash of a dummy password, `crypto.randomUUID()` for a constant, a warm-up fetch | compute it lazily on first use inside a handler, or precompute it at build time |
| A streamed reply stops being saved when the client disconnects | the response's work ends with the request on Workers | finish the persistence in `after()` (Next) / `ctx.waitUntil()` |
| Stripe webhook signature fails | Node crypto path | `constructEventAsync` + `Stripe.createSubtleCryptoProvider()`; `Stripe.createFetchHttpClient()` |
| A weekly or weekday cron never fires, or the deploy rejects the expression | Cloudflare's weekday field is 1-7 with 1 = Sunday; Vercel's is 0-6 with 0 = Sunday | write weekdays as names (`SUN`, `MON-FRI`) and match the same strings in the `scheduled` handler |
| `res.json()` typed `unknown` after adding workers-types | `@cloudflare/workers-types` v5 as a global type | hand-type `cloudflare-env.d.ts` instead of the global |

## 5. Orun plan and CI lanes

| Symptom | Cause | Fix |
|---|---|---|
| PR plan selects 0 components | CI checkout has no local base branch, so `--changed` cannot read the base `intent.yaml` | the workflow creates it: `git branch "$GITHUB_BASE_REF" "origin/$GITHUB_BASE_REF"` (in `templates/repo/.github/workflows/orun.yml`) |
| A component at path `.` never runs on PRs | a root path owns no files under `--changed` | `change.inputs` lists the globs it owns |
| An intent-only change runs only watcher components | that is how intent diffs select | touch a file the component owns, or `on: workflow_dispatch` |
| A step runs `<no value>` | orun renders parameters without schema defaults | set every parameter the job uses on the component |
| stack-tectonic structure check wants `package.json` / committed `wrangler.jsonc` | its checks assume a flat Worker package | the repo-local `workers-app` composition (template) |
| Turbopack `Could not find the Next.js package` / missing instrumentation trace in a lane | staged job trees symlink `node_modules/` outside Turbopack's root | `orun run --isolation none` |
| `context deadline exceeded` exchanging the OIDC token before any job ran | transient | cancel, `gh run rerun --failed` (the run resumes the same execution) |
| Orun workflow skipped on every PR | `ORUN_CI` repo variable unset (the template gates on it) | set it once secrets exist: `gh variable set ORUN_CI --body true` |

## 6. Deploy

| Symptom | Cause | Fix |
|---|---|---|
| Smoke fails before the Worker has its secrets | `materialize` runs after smoke | the `workers-app` composition's `worker-secrets` step runs before smoke |
| Worker secrets never arrive in CI | `materialize` reads Cloudflare credentials from the `orun run` process; CI brokers them per job | `worker-secrets` step: JSON on stdin to `wrangler secret bulk` with the job's token |
| Smoke fails with exit 141 on a healthy page | `curl` piped into `grep -q` with `pipefail` on a page over 64 KB (SIGPIPE) | match against a here-string: `body=$(curl ...); grep -q text <<<"$body"` |
| Smoke hangs for an hour | `curl` with no timeout | `curl --max-time 40` |
| `parent_grant_insufficient` creating a brokered secret | the connection's token lacks the template's permissions | reconnect Cloudflare with a wider token; R2 needs `r2-data` (not part of `workers-deploy`) |
| Terraform root fails creating an R2 bucket | `workers-deploy` cannot create R2 | prefer KV for the Next cache; R2 only with the `r2-data` secret |

## 7. Live, in the browser

| Symptom | Cause | Fix |
|---|---|---|
| `ReferenceError: __name is not defined` in the console | esbuild keep-names wraps functions serialized into inline scripts (theme scripts) | `"keep_names": false` |
| Iframe/embed refused between two apps | CSP `frame-ancestors` built from a Vercel URL | fixed per-environment origins in the wrangler vars |
| Images 404 or unoptimized | `next/image` loader expects Vercel | `images` binding (Cloudflare Images) or `images.unoptimized: true` |
| Analytics silent | `@vercel/analytics` no-ops off Vercel | remove it or replace (Cloudflare Web Analytics, PostHog); name it in the report |

## 8. Process

| Symptom | Cause | Fix |
|---|---|---|
| A secret-store write is refused by the session's safety check | writing credentials needs the person's approval | ask once, naming each secret; run it only after a yes |
| A stacked PR closed itself and will not reopen | its base branch was deleted on merge | open a new PR for the task; next time rebase and retarget before deleting (`work-discipline.md` §3) |
| Tasks stay `ready` after their PRs merge | Orunbase receives no PR events for this repo (the account's GitHub connection does not cover the org) | install the Orunbase GitHub App on the org; until then report the gap |
| A component is missing from the catalog | its `domain` has the same name as a component (`web` in domain `web`); they share one name space | `domain: app` (or any name no component uses) |
| `orun workspace use <new>` does not know the new workspace | the CLI's workspace list is cached at login | `export ORUN_WORKSPACE=<ws_...>` |
| `orun auth token` returns a token for the wrong tenant | run inside a repo whose `intent.yaml` names another workspace | run it from a neutral directory (`cd /tmp`) |
