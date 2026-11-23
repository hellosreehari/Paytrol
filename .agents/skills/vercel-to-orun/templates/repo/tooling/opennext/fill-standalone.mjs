// Next's standalone trace for a nested app (built with the repository as its
// Turbopack root) leaves out server chunks that instrumentation.js and some
// routes load at runtime. Copy the build's server directory over the
// standalone one, never overwriting, before OpenNext bundles it.
// Usage: node tooling/opennext/fill-standalone.mjs <app dir>
import { cpSync } from "node:fs";

const app = process.argv[2];
if (!app) {
  console.error("usage: fill-standalone.mjs <app dir>");
  process.exit(2);
}
cpSync(`${app}/.next/server`, `${app}/.next/standalone/${app}/.next/server`, {
  recursive: true,
  force: false,
});
console.log(`[OpenNext] filled ${app} standalone server output`);
