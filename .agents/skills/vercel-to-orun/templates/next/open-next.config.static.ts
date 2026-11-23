// OpenNext Cloudflare adapter config for a content app whose pages are
// static: prerendered output is served from the Worker's static assets
// (copied in by `opennextjs-cloudflare populateCache local`); nothing is
// written at runtime.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
});
