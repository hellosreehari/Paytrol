# port-paytrol-workers — implementation plan

Milestones land in order. Each is one task, one pull request, landed through git, gh, and the Orunbase verification gates.

## PAY0 — The spec and intent (PAY-1)

This document set under `specs/epics/port-paytrol-workers/` and the task contracts under `tasks/`.

**Done when**
- The 5 epic documents exist on `main`
- Task contracts are attached to tasks PAY-1 through PAY-5

## PAY1 — App runs on Workers (PAY-2)

Install `@opennextjs/cloudflare` and `wrangler`, adapt `next.config.ts` (`output: "standalone"`), generate `open-next.config.ts`, `worker.ts`, and `wrangler.template.jsonc`.

**Done when**
- Worker builds locally using `npm run build:worker`
- `wrangler dev` serves public routes without fatal errors
- Bundle upload size is well under 64 MiB uncompressed

## PAY2 — Orun wiring and CI (PAY-3)

Stamp Orun templates: `intent.yaml`, `infra/stack/`, `tooling/wire/`, `wiring.fixture.json`, and `.github/workflows/orun.yml`.

**Done when**
- `orun validate` passes
- `orun plan --all` compiles without unresolved placeholders

## PAY3 — Live on stage and prod (PAY-4)

Push and converge deployments through Orunbase pipeline.

**Done when**
- `paytrol-web-stage` and `paytrol-web-prod` deploy
- Main routes respond with HTTP 200/302 on `workers.dev`

## PAY4 — Ready to hand over (PAY-5)

Update `README.md` with instructions on deploying and configuring credentials, remove `vercel.json`, and finalize the report in `IMPLEMENTATION-STATUS.md`.

**Done when**
- `vercel.json` is deleted
- Final port report is completed
