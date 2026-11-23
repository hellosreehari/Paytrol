// OpenNext config: "use cache" entries and prerendered pages in Workers KV
// (NEXT_INC_CACHE_KV, from infra/terraform/next-cache-kv), refreshed in the
// background by a Durable Object queue (NEXT_CACHE_DO_QUEUE) that calls the
// Worker back through WORKER_SELF_REFERENCE. Add a tag cache if the app calls
// revalidateTag or revalidatePath.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
  queue: doQueue,
});
