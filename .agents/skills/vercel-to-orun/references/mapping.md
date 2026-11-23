# Vercel feature → Cloudflare / Orun

"Proven" marks a mapping that has run on a live Worker deployed by Orun;
the rest have run under `wrangler dev` and are expected to hold. Bindings come from an infra root's wiring document
(`orun-wiring.md` §Wiring); runtime access in Next.js is
`getCloudflareContext().env.<BINDING>`.

## Hosting and build

| Vercel | Cloudflare / Orun | Notes |
|---|---|---|
| Project per app | `workers-app` component per app, Worker `<project>-<app>-<env>` | proven |
| Preview / Production envs | Orun `stage` (PRs plan+verify, merges deploy) and `prod` (after stage) | per-PR previews are not part of the first port |
| Build command / install command | component `buildCommand` / `installCommand` | `vercel.json` goes at hand-over |
| Root directory | component `path` (+ `workspaceDir`, `appDir`) | |
| Env vars (build-time public) | per-environment `env:` on the component subscription | NEXT_PUBLIC_*, VITE_*, PUBLIC_* are inlined at build |
| Env vars (runtime secret) | Orun secret → `secretEnv` → `workerSecrets` (written into the Worker after deploy) | proven |
| Env vars (runtime plain) | wrangler `vars` in `wrangler.template.jsonc` | proven |
| `VERCEL_ENV`, `VERCEL_URL`, `VERCEL_GIT_COMMIT_SHA`, `VERCEL_PROJECT_PRODUCTION_URL` | explicit vars (`__ENV__` in the template), `NEXT_PUBLIC_SITE_URL` | grep the code: logging and metadataBase often read them |
| Domains | `cloudflare-domain` component after moving the zone to Cloudflare | Workers custom domains need the zone on Cloudflare |
| Wildcard / per-tenant subdomains (`*.example.com`, multi-tenant middleware) | a Workers Route `*.example.com/*` plus a proxied wildcard DNS record; the apex as a Custom Domain | workers.dev cannot serve them; Custom Domains take no wildcards; free Universal SSL covers one level only, so tenants under `stage.example.com` need their own zone (or a paid certificate), and stage needs a domain of its own anyway to test the tenant flow before prod; the domain steps need a zone token (`dns-edit`) and the owner |
| Deployment Protection | Cloudflare Access (not in the first port) | |
| Rewrites / redirects / headers (vercel.json) | framework config, or `_redirects` / `_headers` in the assets dir | |
| `regions`, `maxDuration`, `memory` | not applicable; Workers run everywhere with CPU-time limits | long jobs: Queues, Workflows, or keep external |

## Runtime

| Vercel | Cloudflare | Notes |
|---|---|---|
| Node.js runtime functions | Workers with the `"nodejs_compat"` flag | most Node APIs; no filesystem, no `node:child_process` |
| Edge runtime functions | Workers | `export const runtime = "edge"` is removed for OpenNext |
| Middleware / Next 16 `proxy.ts` | runs in the Worker (OpenNext "Node middleware", experimental but works) | proven; its env must be complete at runtime |
| `waitUntil` (`@vercel/functions`), `after()` | `ctx.waitUntil` via `getCloudflareContext().ctx` | `after()` works in Next on OpenNext |
| Geolocation (`x-vercel-ip-*`, `geolocation()`) | `request.cf` (country, city, region, lat/long) | |
| `instrumentation.ts` | supported by OpenNext 1.20.3+ | proven |
| Cron Jobs (`vercel.json` crons) | Cron Triggers: `triggers.crons` + a custom worker entry whose `scheduled` calls the route in-process | Free: 5 triggers per account, Paid: 250; stage and prod each count |
| ISR, `"use cache"`, `unstable_cache()`, `revalidateTag` | OpenNext incremental cache in KV (+ DO queue; + DO tag cache if `revalidateTag`/`revalidatePath` is called) | proven (KV + DO queue) |
| Static/SSG-only Next app | static-assets incremental cache + `populateCache local` | proven |
| ISR, `s-maxage` / `stale-while-revalidate` pages in Astro, Nuxt, SvelteKit | prerender what changes only on deploy; otherwise Workers Cache (`"cache": {"enabled": true}`, wrangler 4.69+), which caches `GET` responses by their `Cache-Control` | once it is on, every request is billed at the standard rate, static assets included, and hits use no CPU; `s-maxage` turns stale serving off (use `max-age` + `stale-while-revalidate`); a response that sets a cookie is not cached; each version starts cold; purge by `cache-tag` |
| Image Optimization (`next/image`) | Cloudflare Images binding (`"images": {"binding": "IMAGES"}`) or `images.unoptimized` | proven (binding) |
| OG images (`next/og`, `@vercel/og`) | `next/og` works; fonts and images bundled, not read from disk | proven |
| Web Analytics / Speed Insights | remove `@vercel/analytics`, `@vercel/speed-insights`; keep the app's analytics or add the Cloudflare Web Analytics beacon | proven |
| Edge Config | Worker vars, or KV for values that change without a deploy | |
| Feature flags (`@vercel/flags`) | env vars / KV | |
| Firewall, BotID | Cloudflare WAF, rate-limit binding, Turnstile | |
| OpenTelemetry (`@vercel/otel`) | Workers observability (`"observability": {"enabled": true}`) | |
| Log drains | Workers Logs / Logpush | |

## Storage and data

| Vercel | Cloudflare / keep | Infra root | Notes |
|---|---|---|---|
| Vercel KV / Upstash Redis | Workers KV behind the same surface, or keep Upstash REST | `cloudflare-kv` | KV is eventually consistent (up to ~60 s across locations): a flow that writes then reads at once (create, then redirect to it), a uniqueness check, or a counter needs D1 (`cloudflare-d1`) or a Durable Object instead |
| Vercel Postgres / Neon | Supabase (+ Hyperdrive for sockets), or keep Neon over HTTP | `supabase`, `cloudflare-hyperdrive`, `db-migrate` | per-request `pg` client; never a module-level pool; not Drizzle on Postgres.js (`supabase-lane.md` §1) |
| Vercel Blob | R2 behind an upload route and a serving route | `cloudflare-r2` | needs an R2-scoped Cloudflare token: `workers-deploy` cannot create buckets; unproven live |
| SQLite / libSQL, or a small table that must be read right after it is written | D1 (or keep libSQL over HTTP) | `cloudflare-d1`, plus `db-migrate` for the schema (`stamp.py --roots cloudflare-d1 --db-migrate`) | proven |
| A hosted database, backend-as-a-service or CMS reached over HTTPS | keep | `gated-deploy` component when there is a deploy step | proven |

## Services the app calls

Mostly unchanged; check how each behaves on Workers:

| Service | Workers note |
|---|---|
| Stripe | `Stripe.createFetchHttpClient()`; webhooks with `constructEventAsync` + `createSubtleCryptoProvider()`; stripe-node 18+ throws at import without a key, so give the build a placeholder |
| Auth.js / next-auth | works; `AUTH_SECRET` as a Worker secret |
| Clerk | works; keys as env/secrets |
| Hosted auth whose SDK runs in middleware | needs its public client id (a var) and its cookie or session secret (often 32+ chars, a Worker secret) at runtime, or every page through the middleware answers 500 | proven |
| Supabase Auth | `@supabase/ssr`; URL + anon key build-time public; service role a Worker secret |
| AI SDK | works; Vercel AI Gateway keeps working with `AI_GATEWAY_API_KEY`, or switch to the provider directly / Cloudflare AI Gateway |
| GitHub API | send a `User-Agent`: Workers send none and GitHub answers 403 | proven |
| Any `fetch` with `cache: "force-cache"` | fine inside Next (patched fetch) | proven |
| Resend, PostHog, Sentry | Resend over fetch; PostHog key build-time public; Sentry → `@sentry/cloudflare` |
