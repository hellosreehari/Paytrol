# The cloudflare+supabase lane

Use it when the app's database was Vercel Postgres (Neon), or any Postgres
the product should own after the move. The templates follow the Supabase
lane of Orun's `lumen` baseline.

## Contents
1. Pieces
2. Secrets
3. App changes
4. Migrations
5. Order of the first deploy

## 1. Pieces

| Piece | Template | Publishes |
|---|---|---|
| `supabase` Terraform root: one project per environment | `infra/terraform/supabase` | `SUPABASE_PROJECT_REF`, `SUPABASE_DB_PASSWORD`, `SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `WIRING_SUPABASE` (`{supabase_url, supabase_anon_key}`) |
| `cloudflare-hyperdrive` root: pooled Postgres for the Worker | `infra/terraform/cloudflare-hyperdrive` | `WIRING_CLOUDFLARE_HYPERDRIVE` (`{hyperdrive_id, hyperdrive_name}`) |
| `db` package (`@saas/db`): migrations + runner | `packages-db` → `packages/db` | |
| `db-migrate` component: plan on PRs, apply on merge | `infra/db-migrate` | |

Hyperdrive only when the app opens a Postgres socket (Drizzle, Prisma with
a pg driver adapter, `pg`, `postgres`). An app that talks to Supabase only
through `@supabase/supabase-js` (PostgREST over HTTP) does not need it.

The driver is `pg` (node-postgres). Cloudflare's Hyperdrive docs say
Drizzle on Postgres.js is not supported, and that Postgres.js with
`prepare: false` can make queries hang or fail now and then. An app that
pairs them moves Drizzle to `drizzle-orm/node-postgres`; its queries stay
as they are. Name the switch in the port plan.

The `supabase` root needs `supabaseRegion` set (no default): pick the
region nearest the users, or the one the Vercel project ran in.

## 2. Secrets

From the account's Supabase connection, at the project rung:

```bash
orun integrations supabase secret create SUPABASE_ACCESS_TOKEN --connection <int_sb> --template management-access --project
orun integrations supabase secret create SUPABASE_ORG_ID --connection <int_sb> --template org-id --project
orun integrations cloudflare secret create CLOUDFLARE_HYPERDRIVE_TOKEN --connection <int_cf> --template hyperdrive-edit --project
```

The roots publish the rest after their first apply.

## 3. App changes

- Env names: map the template's names onto the published ones in the
  component. Build-time public values (`NEXT_PUBLIC_SUPABASE_URL`,
  `NEXT_PUBLIC_SUPABASE_ANON_KEY`) come from `WIRING_SUPABASE`; the service
  role key is a runtime secret (`secretEnv` + `workerSecrets`).
- Postgres through Hyperdrive: bind `"hyperdrive": [{"binding": "HYPERDRIVE",
  "id": "@@wiring(cloudflare-hyperdrive/__ENV__:hyperdrive_id)@@"}]` and build
  the client per request from `getCloudflareContext().env.HYPERDRIVE.connectionString`.
  Never a module-level pool: Workers refuse to reuse a socket across
  requests. For `wrangler dev`, set `localConnectionString` or
  `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`.
- A credential-free `next build` evaluates route modules: a module-scope
  `createClient(process.env.X!, ...)` must become per-call.
- Supabase Auth: `@supabase/ssr` works on Workers; cookies through the
  framework's request/response.

## 4. Migrations

The `db-migrate` composition (stack-tectonic) builds `@saas/db` with turbo
and runs its runner in `plan` (PRs) or `apply` (merges) mode against the
environment's project through Supabase's Management API.

- The repo needs a pnpm workspace with `packages/db` and `turbo` as a dev
  dependency; the package name must be `@saas/db`.
- Put the app's SQL under `packages/db/src/migrations/<NNN>_<slug>/up.sql`
  in order after `000_control`, list each in `src/manifest.ts`
  (`context: "app"`), then `pnpm --filter @saas/db run manifest:fix` to stamp
  checksums.
- Migrations run in autocommit through the Management API: make them
  idempotent (`IF NOT EXISTS`, `CREATE OR REPLACE`, DO blocks).
- Drizzle/Prisma: keep their CLIs for development, commit the generated SQL
  as migration folders; the runner, not drizzle-kit or prisma migrate,
  applies in CI.
- Seed scripts that the upstream runs by hand stay manual (document them).

## 5. Order of the first deploy

`supabase` apply → (`cloudflare-hyperdrive` apply) → `db-migrate` apply →
app deploy, expressed with `dependsOn` on the components (the app depends
on `db-migrate` and `cloudflare-hyperdrive`). All in the first merge's run,
stage then prod. A Supabase project takes a few minutes to become ready on
first creation; a failed apply is re-run with `gh run rerun --failed`.

This lane's Terraform roots run live in the `lumen` baseline; a port has
not deployed through them yet. Treat the first live run as the test, and
add what it teaches to `troubleshooting.md`.
