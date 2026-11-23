# port-paytrol-workers — risks and open questions

## PAY-A — Node.js compatibility in Cloudflare Workers (RESOLVED)

The application uses `node:crypto` in auth and several Azure / Google SDKs. Cloudflare Workers supports these APIs under `compatibility_flags = ["nodejs_compat"]`.

## PAY-B — Vercel Cron migration (RESOLVED)

Paytrol defines a cron in `vercel.json` (`0 3 * * *`). Cloudflare Cron Triggers together with a custom Worker entry point (`worker.ts`) trigger the `/api/retention/cleanup` endpoint with `CRON_SECRET` headers.

## PAY-C — Next.js 16 Standalone output (RESOLVED)

OpenNext requires `output: "standalone"` in `next.config.ts` to package the server runtime for `@opennextjs/cloudflare`.
