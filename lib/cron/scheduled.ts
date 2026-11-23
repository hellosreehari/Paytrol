import { TRIGGER, duePaths } from "./schedule";

type FetchHandler = (request: Request, env: never, ctx: never) => Response | Promise<Response>;
interface Controller {
  cron: string;
  scheduledTime: number;
}

// Vercel ran each cron job by requesting its path with GET, a `vercel-cron/1.0`
// User-Agent and, when CRON_SECRET is set, `Authorization: Bearer
// <CRON_SECRET>`. This handler makes the same request for every schedule due
// this minute, in-process through the app's own fetch handler, so the
// upstream's routes (and their secret check) run unchanged. The origin is a
// placeholder the routes do not read.
export const CRON_ORIGIN = "https://cron.internal";

export function makeScheduled(fetch: FetchHandler) {
  return async function scheduled(
    controller: Controller,
    env: { CRON_SECRET?: string },
    ctx: unknown,
  ): Promise<void> {
    if (controller.cron !== TRIGGER) {
      console.warn(`scheduled: no schedule for cron "${controller.cron}" (this Worker's trigger is "${TRIGGER}")`);
      return;
    }
    // One at a time; every due path runs even when an earlier one failed.
    const failures: string[] = [];
    for (const path of duePaths(controller.scheduledTime)) {
      const headers = new Headers({ "user-agent": "vercel-cron/1.0" });
      if (env.CRON_SECRET) headers.set("authorization", `Bearer ${env.CRON_SECRET}`);
      try {
        const response = await fetch(new Request(`${CRON_ORIGIN}${path}`, { headers }), env as never, ctx as never);
        const body = await response.text();
        if (!response.ok) {
          failures.push(`${path} answered ${response.status}: ${body.slice(0, 200)}`);
          continue;
        }
        console.log(`cron ${path} ${response.status}`);
      } catch (error) {
        failures.push(`${path} threw: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    // A thrown error marks the invocation failed in the Worker's logs.
    if (failures.length > 0) throw new Error(failures.join("; "));
  };
}
