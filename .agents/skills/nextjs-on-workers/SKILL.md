---
orun-rev: sha256:4065d3019624e50f0ae4cbb6398c90ca395d7227fa6f2efb337dc44d3bdc0eb1
orun-source: default
name: nextjs-on-workers
title: Next.js on Workers — run a Next.js app on Cloudflare with OpenNext
description: "Run a Next.js app on Cloudflare Workers with @opennextjs/cloudflare: which adapter and Next versions go together, OpenNext or vinext, which incremental cache to use (KV, R2, Durable Objects), Cache Components, file reads at request time, bundle size and startup time, middleware and proxy.ts, Postgres through Hyperdrive, images and OG images, several Next apps in one repo, and checking it on workerd before a deploy. Use it for any Next.js app on Workers, ported from Vercel (vercel-to-orun sends you here) or not, and for errors from opennextjs-cloudflare build, wrangler dev or a deploy of a Next app."
appliesTo: [implementer, bootstrapper, orchestrator]
---
# Next.js on Workers (`@opennextjs/cloudflare`)

Everything here ran in a Next.js port deployed by Orun, or under
`wrangler dev`, and the why is given so you can judge cases it does not
name. The adapter moves fast: check the versions in §1 against npm before
you trust them.

`<v2o>` below is the `vercel-to-orun` skill's directory. Its bundle carries
the files this skill names (`templates/next/`, `templates/scripts/`), and
its `stamp.py` writes the repository tooling (`tooling/wire`,
`tooling/opennext`). Without it, do the same steps by hand.

## Contents
1. Versions
2. OpenNext or vinext
3. Install and build
4. Caching
5. No filesystem at request time
6. Size and startup time
7. Middleware, auth, instrumentation
8. Postgres through Hyperdrive
9. Images and OG images
10. Several Next apps in one repo
11. Local verification

## 1. Versions

The adapter sets a floor on Next with each release (security patches):
1.20.12+ needs Next ≥ 16.4.1, 1.20.16 needs ≥ 16.4.5 (check
`npm view @opennextjs/cloudflare@<v> peerDependencies`). Upgrade Next (and
`@next/mdx`, `eslint-config-next`) to the floor of the adapter you choose;
prefer the newest adapter whose Next floor is at least a day old if the
package manager enforces a minimum release age (pnpm 11 does).

On 2026-11-09 the newest pair was `@opennextjs/cloudflare` 1.20.16 with
Next 16.4.5 (its peer range: `next >=15.5.29 <16 || >=16.4.5`, wrangler
`^4.148.0`).

Next 15 → 16 changes to expect: `middleware.ts` may be `proxy.ts`;
`experimental.ppr` is gone; eslint-config-next is flat-config only.

## 2. OpenNext or vinext

- **OpenNext** adapts the output of the app's own `next build`. Use it for
  an existing app: what runs is what the upstream builds and tests.
- **vinext** is Cloudflare's reimplementation of the Next.js API on Vite.
  Cloudflare's docs recommend it for new Next.js apps on Workers, and lead
  their Vercel-to-Workers Next.js guide with it, while calling it beta.

For a port, run `npx vinext check` in the app (it only reads) and put what
it reports in the plan, then build with OpenNext unless the person chose
vinext. Revisit when vinext leaves beta.

## 3. Install and build

```bash
pnpm add -D @opennextjs/cloudflare wrangler
```

- `next.config`: `output: "standalone"`. OpenNext bundles the standalone
  output; without it `opennextjs-cloudflare build --skipBuild` fails copying
  `.next/standalone/...` files.
- Scripts (keep the upstream `build` as is, add):
  - `build:worker`: `<upstream build> && opennextjs-cloudflare build --skipBuild`
    (`--skipBuild` because OpenNext would otherwise shell `pnpm build` with
    whatever pnpm is on PATH, which may fail the repo's `engines`).
  - `preview:worker`: `pnpm wire:fixture && opennextjs-cloudflare preview`.
  - `wire:fixture`: render `wrangler.jsonc` from the template with the
    fixture (`tooling/wire/render.mjs`, which `stamp.py` writes).
- pnpm: allow `workerd`'s install script (pnpm 10+ `onlyBuiltDependencies`,
  pnpm 11 `allowBuilds: { workerd: true }`).
- Give `@opennextjs/cloudflare` its own esbuild when the repo also has
  another esbuild (another build tool's): it lists esbuild only as a devDependency,
  so pnpm's hidden hoist can hand it an older one.

  ```yaml
  # pnpm-workspace.yaml
  packageExtensions:
    "@opennextjs/cloudflare":
      dependencies:
        esbuild: ^0.28.2
  ```
- Minification: try the default first. If esbuild panics
  (`Unexpected expression of type <nil>`, reproducible with
  `esbuild <chunk> --minify-syntax`), build with `--noMinify`; budget the
  extra size.
- Memory: `next build` of a large app needs more than Node's default heap
  on small machines: `NODE_OPTIONS=--max-old-space-size=4096` locally,
  6144 in CI (GitHub runners have 16 GB).
- Keep the upstream's lockfile formatting. If the upstream CI runs Prettier
  on changed files and its `pnpm-lock.yaml` is Prettier-formatted, run
  Prettier on the lockfile after every `pnpm add`.

## 4. Caching

Pick by what the app does:

| App uses | OpenNext config | Bindings |
|---|---|---|
| fully dynamic, no ISR, no `"use cache"` | `defineCloudflareConfig({})` | none |
| static/SSG pages only (content site) | `staticAssetsIncrementalCache`, and `opennextjs-cloudflare populateCache local` after the build | none |
| ISR, `"use cache"`, `unstable_cache()` (time-based) | `kvIncrementalCache` + `doQueue` (`<v2o>/templates/next/open-next.config.kv.ts`) | `NEXT_INC_CACHE_KV` (next-cache-kv root), `NEXT_CACHE_DO_QUEUE` + `"new_sqlite_classes"` migration, `WORKER_SELF_REFERENCE` |
| plus `revalidateTag` / `revalidatePath` | add `doShardedTagCache` | `NEXT_TAG_CACHE_DO_SHARDED` |

`cacheComponents: true` (Cache Components / PPR) makes requests fail or
hang on Workers (opennextjs-cloudflare#1450, and the fix in PR #1318; both
were open on 2026-11-09, so check).
Until it is, replace it with `experimental: { useCache: true }`: every
`"use cache"`, `cacheLife` and `cacheTag` call keeps working; partial
prerendering is lost and most routes become dynamic. This also removes the
Cache Components prerender error about `new Date()` and other unstable
values that appears once you take filesystem I/O out of a code path (§5).

Prefer KV over R2 for the incremental cache: the standard `workers-deploy`
token can create KV namespaces and cannot create R2 buckets.

## 5. No filesystem at request time

`fs.readFile`, `readdir`, `existsSync` with `process.cwd()` in code that runs
per request (blog post loaders, markdown routes, sitemaps, `llms.txt`,
OG-image font loads) fail on Workers. They worked on Vercel because the
function bundle traced the files. Fix by bundling at build time:

- A generator script (`<v2o>/templates/next/generate-server-content.mjs`)
  reads the files into a git-ignored module (`export const posts = [...]`,
  a font as base64), run on `postinstall`, before `dev` and before `build`.
  The loaders import the module; their signatures stay the same.
- Or import the file as a module (`import font from "./font.ttf"` with a
  bundler rule), or serve it as a static asset and fetch it via the
  `ASSETS` binding.
- Scripts and tests that read files at build time are fine.
- Remove `outputFileTracingIncludes` that only existed for those reads.

## 6. Size and startup time

Cloudflare's size limit (since 2026-09-04) is the uncompressed bundle,
wrangler's `Total Upload`: 64 MiB on every plan. The old compressed limits
(3 MB Free, 10 MB Paid) are gone, so older guides that say a Next app must
be under 10 MB are out of date. A large Next app can land at 40 to 60 MiB
uncompressed, so the limit still bites the biggest apps. The other limit is
startup: a Worker whose global scope takes over 1 s is refused at deploy
(`Script startup exceeded CPU time limit`, 10021), and a heavy bundle
starts slower on every cold request. Measure on the first build:

```bash
pnpm exec wrangler deploy --dry-run --outdir /tmp/dist
python3 <v2o>/templates/scripts/bundle-report.py /tmp/dist --handler .open-next/server-functions/default/handler.mjs
```

Trim when the report says over or close to the limit (over 80%), when the
deploy is refused for startup time, or when cold starts are slow; otherwise
ship it and note the size in the report.

The usual weight is browser-only code that reaches the server because
client components are also rendered on the server:

- Full Shiki (every grammar, about 9 MB raw): on the server use
  `shiki/core` + `createJavaScriptRegexEngine` + the languages the app
  needs (`shiki/langs/<lang>.mjs`); for client-only highlighting, alias it.
- SDKs with WebAssembly (crypto, chat SDKs), editors, chart and PDF
  libraries used only in effects or event handlers.

Alias browser-only modules to a server stand-in, in `next.config`:

```js
turbopack: {
  resolveAlias: {
    // the module the app imports, routed through a tiny wrapper file
    "@/lib/browserOnlySdk": {
      browser: "./lib/browserOnlySdk.ts",        // export * from "the-sdk"
      default: "./lib/browserOnlySdk.server.ts", // throwing stand-ins
    },
  },
},
```

Route the import through an app module (`@/lib/...`), not the package
name: aliasing a package to itself in the browser branch recurses, and
packages in Next's `serverExternalPackages` list bypass aliases. The
stand-in exports the same names and throws if called; it is never called on
the server when the real calls live in effects or handlers. Apply the same
alias in every Next app of the repo that imports the module. Dynamic
`import()` alone does not help: the server build still emits the chunk.

## 7. Middleware, auth, instrumentation

- `middleware.ts` / `proxy.ts` runs as OpenNext "Node middleware"
  (experimental, works). A `runtime` export in it must go.
- Auth libraries in middleware read env at module load. With an incomplete
  env every page through the middleware answers 500 (an SDK throws without
  its client id, or without a long enough cookie secret). Before the owner's
  credentials exist: a public placeholder client id as a var, a generated
  cookie password as a Worker secret. Pages render for anonymous visitors
  and sign-in fails at the provider, which is the honest state.
- Routes the middleware skips (static, content-only) are your smoke check's
  safest target only if the secret delivery runs after smoke; with the
  `workers-app` composition it runs before, so smoke the real page.
- Every route the port adds for machine callers (a file-serving route an
  outside service fetches, a webhook, a cron path) must get past the
  middleware: auth middleware that redirects cookie-less requests (guest
  sign-in, login) answers those callers with a redirect. Read its matcher
  and exempt the new paths.
- `instrumentation.ts` is supported (1.20.3+).

## 8. Postgres through Hyperdrive

- Use `pg` (node-postgres), on its own or under Drizzle
  (`drizzle-orm/node-postgres`) or Prisma (its `pg` adapter). Cloudflare's
  Hyperdrive docs say Drizzle on Postgres.js is not supported, and that
  Postgres.js with `prepare: false` can make queries hang or fail now and
  then. Apps written for Vercel often have exactly that pairing: switch the
  driver, not the queries.
- Build the client inside the request, from
  `getCloudflareContext().env.HYPERDRIVE.connectionString`. A module-level
  pool fails: Workers cannot reuse a connection another request opened.
- For `wrangler dev`, set the binding's `localConnectionString` (or
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`).

## 9. Images and OG images

- `next/image` with `remotePatterns`: `"images": {"binding": "IMAGES"}` in
  the wrangler template (Cloudflare Images; free tier covers 5,000 unique
  transformations a month), or `images.unoptimized: true`.
- `next/og`: works (resvg and yoga WebAssembly ship in the Worker, about
  0.5 MB compressed). Fonts read from `node_modules/` or disk must be bundled
  (§5).

## 10. Several Next apps in one repo

- Each app gets its own `open-next.config.ts`, `wrangler.template.jsonc`,
  `output: "standalone"`, Worker and component.
- A nested app built from the repo root (Turbopack root above the app, as
  in `next build <dir>`) gets an incomplete standalone trace: server chunks
  that `instrumentation.js` and routes load are missing, and the Worker
  fails at startup (`ChunkLoadError ... instrumentation`). Copy the build's
  server directory over the standalone one before OpenNext bundles it
  (`node tooling/opennext/fill-standalone.mjs <app dir>`, no overwrite).
- Origins between apps (iframe parents, CSP `frame-ancestors`) become fixed
  per-environment values, so build order stops mattering.

## 11. Local verification

```bash
pnpm wire:fixture                     # wrangler.jsonc from the template
cp .dev.vars.example .dev.vars        # generated secrets for local runs
pnpm build:worker
pnpm exec wrangler dev --port 8787    # serves the built Worker on workerd
bash <v2o>/templates/scripts/route-matrix.sh http://127.0.0.1:8787 routes.txt
```

Read the `wrangler dev` output: a 500's stack trace is there. Check that
`"use cache"` entries land in the local KV
(`/cdn-cgi/local/explorer/api/storage/kv/namespaces/<id>/keys`).
