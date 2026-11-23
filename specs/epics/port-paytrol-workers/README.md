# Epic: port-paytrol-workers (PAY)

**Port Paytrol from Vercel onto Cloudflare Workers via `@opennextjs/cloudflare` and deploy through Orunbase from `main`, with stage and prod verified live.**

Paytrol is a Next.js fuel tracking and expense splitting application. This epic adapts the runtime to Cloudflare Workers while keeping external Azure Cosmos DB, Azure Blob Storage, Gemini AI, and NextAuth providers intact, replacing Vercel cron with Cloudflare Cron Triggers.

## Status

| Field | Value |
|---|---|
| Status | In Progress |
| Cluster | **PAY** (PAY0–PAY4) |
| Owner(s) | `paytrol-app` (web) |
| Builds on | Cloudflare Workers lane via `@opennextjs/cloudflare` |
| Changes | Runtime adaptation to workerd, Orun intent, stack compositions, GitHub Actions CI |
| Decisions locked | (1) Use OpenNext adapter (`@opennextjs/cloudflare` v1.20.18). (2) Static incremental cache for initial zero-binding lane. (3) Replace Vercel cron with Cloudflare Cron Trigger worker entry. |
| Gate | PAY0 is the spec doc set. PAY1 proves local workerd execution. PAY2 verifies Orun intent. PAY3 goes live. PAY4 hands over. |

## Read order

1. `design.md` — runtime model, architecture, secrets, and boundaries
2. `implementation-plan.md` — the five milestones and observable done-when facts
3. `risks-and-open-questions.md` — identified runtime risks and mitigations
4. `IMPLEMENTATION-STATUS.md` — as-built tracking and design departures

## Milestones at a glance

| Milestone | What it lands | Done when |
|---|---|---|
| PAY0 — the spec | this doc set and task contracts | merged to `main` |
| PAY1 — app on Workers | OpenNext adapter, standalone config, worker.ts, wrangler fixture | builds and runs under `wrangler dev` |
| PAY2 — Orun wiring and CI | `intent.yaml`, stack compositions, `.github/workflows/orun.yml` | `orun plan` resolves cleanly |
| PAY3 — live on stage and prod | deployments converged and verified | endpoints answer live on `.workers.dev` |
| PAY4 — ready to hand over | README, cleanup of `vercel.json`, final report | owner handover complete |
