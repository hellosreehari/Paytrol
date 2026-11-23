# Framework recipes

Every recipe ends in the same shape: a Worker entry plus a static-assets
directory, deployed by the `workers-app` composition (or a plain Worker by
stack-tectonic's `cloudflare-worker-turbo`). The component parameters that
change per framework are `workerEntrypoint`, `assetsDir` and
`wranglerConfig`. Pin the adapter versions that are current when you port.

## Contents
- Next.js
- Astro
- Nuxt
- SvelteKit
- Remix / React Router 7
- Vite SPA, Gatsby, Docusaurus, other static output
- Hono and API-only Workers
- Vercel Functions in `api/` (no framework)
- Cron jobs (any framework)
- Wrangler config, common to all

## Next.js

`@opennextjs/cloudflare` + `wrangler`. Everything Next-specific is in the
`nextjs-on-workers` skill; read it whole. Component parameters:
`workerEntrypoint: .open-next/worker.js`, `assetsDir: .open-next/assets`,
`wranglerConfig: wrangler.jsonc` (rendered from `wrangler.template.jsonc`).
Templates: `templates/next/`.

## Astro

`@astrojs/cloudflare` (Astro 7.4 with adapter 14.4 on 2026-11-09; check
npm). The adapter builds through the Cloudflare Vite plugin:

- Do not set `main` in `wrangler.jsonc`; the plugin resolves the entry.
- The build emits `dist/server/entry.mjs`, `dist/server/wrangler.json`
  (derived from yours) and `dist/client/`. Parameters:
  `wranglerConfig: dist/server/wrangler.json`,
  `workerEntrypoint: dist/server/entry.mjs`, `assetsDir: dist/client`.
- The adapter turns on KV sessions (`SESSION` binding with no id): set
  `session: false` unless the app uses sessions, or bind a KV namespace.
- Env: `import { env } from 'cloudflare:workers'` for vars, secrets and
  bindings. Astro 5's `Astro.locals.runtime` is gone: `runtime.env` becomes
  that import, `runtime.cf` becomes `Astro.request.cf`, `runtime.ctx`
  becomes `Astro.locals.cfContext`. Never read secrets from
  `import.meta.env` (inlined at build).
- `imageService`: `cloudflare-binding` (the default, the Images binding at
  request time) or `compile` (sharp at build, prerendered pages only;
  on-demand pages then serve the original).
- ISR and `s-maxage` pages: route caching, `cache: { provider:
  cacheCloudflare() }` from `@astrojs/cloudflare/cache`, then
  `Astro.cache.set({ maxAge, swr, tags })` per page. It turns on Workers
  Cache (`mapping.md`), and Astro still calls it experimental; a page that
  changes only on deploy is better prerendered.
- Tests: vitest with `getViteConfig({ test }, { configFile: false })`; the
  Cloudflare plugin's `cloudflare:workers` import breaks dependency
  optimisation otherwise.

## Nuxt

Nitro preset `"cloudflare_module"` with `cloudflare: { deployConfig: false }`
(otherwise Nitro writes its own wrangler config and ignores yours).
Parameters: `workerEntrypoint: .output/server/index.mjs`,
`assetsDir: .output/public`, `wranglerConfig: wrangler.jsonc`. Runtime env
through `useRuntimeConfig()` reads Worker vars and secrets.

## SvelteKit

`@sveltejs/adapter-cloudflare`. Parameters:
`workerEntrypoint: .svelte-kit/cloudflare/_worker.js`,
`assetsDir: .svelte-kit/cloudflare`. Which adapter goes with which kit:

- **SvelteKit 3 with adapter 8** (8.0.2 on 2026-11-09): `event.platform` is
  gone. Import `env`, `waitUntil` and `cache` from `cloudflare:workers`;
  geolocation is `request.cf`. Variables are declared in `src/env.js`
  (`defineEnvVars`) and read from `$app/env/private` or `$app/env/public`;
  the `$env/*` modules are deprecated. CI builds have no Worker secrets, so
  make required values optional while `building`. A prerendered route
  cannot read `cloudflare:workers`.
- **SvelteKit 2 with adapter 7**: bindings via `event.platform.env`,
  secrets from `$env/dynamic/private`.

SvelteKit 2→3 moves: `$app/stores` → `$app/state`, form actions instead of
method overrides, `cookie` 1.x API. The adapter's Worker exports only
`fetch`: cron needs a second Worker that calls an authenticated route.

## Remix / React Router 7

Remix v2 is best moved to React Router 7 framework mode with
`@cloudflare/vite-plugin` (the official Cloudflare template). Entry
`workers/app.ts` exporting `fetch` with `createRequestHandler`; assets
`build/client`. Loaders read bindings from `context.cloudflare.env`.

## Vite SPA, Gatsby, Docusaurus, other static output

No server: a Worker with `assets` only (`"assets": {"directory": "dist",
"not_found_handling": "single-page-application"}` for SPAs), no `main`.
Use `cloudflare-workers-assets-turbo` or `workers-app` with a tiny entry, or
stack-tectonic's `cloudflare-pages*` compositions. Rewrites from
`vercel.json` become `_redirects`; headers become `_headers`.

## Hono and API-only Workers

Native Worker: stack-tectonic's `cloudflare-worker-turbo` with a committed
`wrangler.jsonc` carrying `env.{stage,prod}` (that composition deploys with
`--env`). Tests call `app.request()`. Express/Fastify servers are not
Workers: port routes to Hono (usually mechanical) or name them out of scope.

## Vercel Functions in `api/` (no framework)

`api/*.ts` handlers (`export default function handler(req, res)` or
`export function GET(request)`) become routes of one Hono Worker:
web-standard ones move as they are; Node `(req, res)` ones need the small
rewrite to `Request`/`Response`. Python/Go/Ruby/Rust functions are out of
scope (container lane).

## Cron jobs (any framework)

Vercel calls `GET <path>` on schedule with a `vercel-cron/1.0` User-Agent
and, when the app sets `CRON_SECRET`, `Authorization: Bearer
$CRON_SECRET`. Both platforms evaluate cron in UTC.

**Default (proven live; `stamp.py` writes it when
`vercel.json` has `crons`):** one `* * * * *` Cron Trigger per environment
and a custom entry whose `scheduled` handler runs every upstream schedule
due that minute:

- `lib/cron/schedule.ts`: the upstream's schedules, copied from
  `vercel.json` as they are, and a five-field matcher in Vercel's syntax.
- `lib/cron/scheduled.ts`: for each due path, the same request Vercel sent
  (GET, its User-Agent, the bearer secret when `CRON_SECRET` is set),
  in-process through the app's fetch handler; it throws on any non-2xx so
  failures show in Workers logs.
- `worker.ts` (Next): re-exports OpenNext's `fetch` (and `DOQueueHandler`
  with the KV cache) and adds `scheduled`; it is the wrangler `main` and the
  component's `workerEntrypoint`. Other frameworks: add the same
  `scheduled` to their entry, except SvelteKit, whose adapter owns the
  entry (a second Worker, above).

Why the default: two triggers in all (Workers Free allows 5 per account,
Paid 250, and stage and prod each count), no weekday translation, the
upstream routes run unchanged. Mind the limits the job rate implies (KV
Free allows 1,000 writes a day; an every-minute job writes 1,440).

**Alternative, one trigger per schedule:** `"triggers": { "crons": [...] }`
with each expression, and the handler maps `controller.cron` to its route.
Cloudflare numbers weekdays 1-7 with 1 = Sunday, Vercel 0-6 with 0 =
Sunday: rewrite numeric weekdays as names (`0 0 * * 0` → `0 0 * * SUN`)
and use the rewritten string in the lookup.

Either way, stage runs the jobs too: when they have side effects (emails,
billing), render `triggers` only into prod's config or make stage's a
no-op, and say so in the plan. Verify locally with `wrangler dev
--test-scheduled` and `curl "http://localhost:8787/cdn-cgi/local/scheduled?cron=*+*+*+*+*"`
(add `&format=json` for the outcome), or the Cron Triggers page of Local
Explorer at `/cdn-cgi/local/explorer`.

## Wrangler config, common to all

Start from `templates/next/wrangler.template.*.jsonc` and keep:

- `"compatibility_date"` recent; `compatibility_flags: ["nodejs_compat",
  "global_fetch_strictly_public"]`. Since 2025-04-01 `"nodejs_compat"`
  populates `process.env` from vars and secrets, so module-scope env reads
  work; from compatibility date 2026-08-04 it is on by default, and listing
  it stays harmless.
- `"upload_source_maps": false`: large apps' source maps exceed Cloudflare's
  60 MiB per Worker and the deploy is refused (error 10021).
- `"keep_names": false`: wrangler's esbuild keep-names wraps functions in
  `__name()`, and frameworks that serialize a function into the page (theme
  scripts) then throw `ReferenceError: __name is not defined` in browsers.
- `"observability": { "enabled": true }`.
- `"name": "<worker>-__ENV__"` with `__ENV__` substituted by `tooling/wire`,
  and the `@@wiring(<root>/__ENV__:<key>)@@` tokens for binding ids.
