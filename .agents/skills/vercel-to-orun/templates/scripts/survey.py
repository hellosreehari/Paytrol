#!/usr/bin/env python3
"""Survey a cloned Vercel project for a Cloudflare/Orun port.

    python3 survey.py <repo-dir> [--json]

Prints a markdown signals report: package manager and workspaces, the apps
and their frameworks, Vercel-specific features, data and service SDKs, cron,
runtime filesystem reads, native modules, size risks, env vars. It is a
heuristic aid for the port plan (references/survey.md), not a verdict: read
the code behind every signal it raises. Standard library only.
"""
import json
import os
import re
import sys
from pathlib import Path

SKIP_DIRS = {"node_modules", ".git", ".next", ".open-next", ".wrangler", "dist",
             "build", "out", ".vercel", ".turbo", ".svelte-kit", ".nuxt", ".output",
             "coverage", "_generated", ".cache"}
CODE_EXT = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".vue", ".svelte", ".astro"}

# dependency -> (category, note)
DEPS = {
    # frameworks
    "next": ("framework", "Next.js -> @opennextjs/cloudflare"),
    "astro": ("framework", "Astro -> @astrojs/cloudflare"),
    "nuxt": ("framework", "Nuxt -> Nitro cloudflare_module preset"),
    "@sveltejs/kit": ("framework", "SvelteKit -> @sveltejs/adapter-cloudflare"),
    "@remix-run/react": ("framework", "Remix -> React Router 7 + @cloudflare/vite-plugin"),
    "@react-router/dev": ("framework", "React Router 7 -> @cloudflare/vite-plugin"),
    "@tanstack/react-start": ("framework", "TanStack Start -> Cloudflare preset"),
    "@solidjs/start": ("framework", "SolidStart -> Nitro cloudflare_module"),
    "hono": ("framework", "Hono -> native Worker"),
    "express": ("framework", "Express server: rewrite to Hono or needs a container lane"),
    "fastify": ("framework", "Fastify server: rewrite to Hono or needs a container lane"),
    "vite": ("framework", "Vite (SPA if no SSR framework) -> static assets Worker"),
    "gatsby": ("framework", "Gatsby -> static build to assets"),
    "@docusaurus/core": ("framework", "Docusaurus -> static build to assets"),
    "nextra": ("framework", "Nextra (Next.js docs) -> OpenNext + Pagefind"),
    # vercel-only
    "@vercel/analytics": ("vercel", "remove; keep the app's analytics or add the Cloudflare Web Analytics beacon"),
    "@vercel/speed-insights": ("vercel", "remove (Web Analytics beacon covers vitals)"),
    "@vercel/kv": ("vercel", "Vercel KV (Upstash Redis) -> Workers KV behind the same surface, or keep Upstash REST"),
    "@vercel/postgres": ("vercel", "Vercel Postgres (Neon) -> Supabase lane + Hyperdrive, or keep Neon over HTTP"),
    "@vercel/blob": ("vercel", "Vercel Blob -> R2 (needs an R2-capable token) behind an upload route"),
    "@vercel/edge-config": ("vercel", "Edge Config -> Worker vars / KV"),
    "@vercel/og": ("vercel", "@vercel/og -> next/og or workers-og; fonts must be bundled"),
    "@vercel/functions": ("vercel", "waitUntil/geolocation -> ctx.waitUntil / request.cf via getCloudflareContext"),
    "@vercel/flags": ("vercel", "Vercel Flags -> env vars / KV"),
    "@vercel/otel": ("vercel", "remove; Workers observability is in wrangler config"),
    "@vercel/sandbox": ("vercel", "Vercel Sandbox: no direct equivalent (Cloudflare Sandbox SDK / containers)"),
    "@vercel/firewall": ("vercel", "Vercel Firewall -> Cloudflare WAF / rate-limit binding"),
    "@vercel/edge": ("vercel", "edge helpers -> request.cf"),
    "@vercel/toolbar": ("vercel", "remove"),
    "botid": ("vercel", "BotID -> Cloudflare Turnstile / Bot Management"),
    # data
    "@upstash/redis": ("data", "Upstash Redis over REST works on Workers as is; or Workers KV"),
    "@upstash/ratelimit": ("data", "works over REST; or the native rate-limit binding"),
    "@neondatabase/serverless": ("data", "Neon over HTTP/WebSocket works on Workers; or Supabase + Hyperdrive"),
    "@supabase/supabase-js": ("data", "PostgREST client: Supabase lane, no Hyperdrive needed"),
    "@supabase/ssr": ("data", "Supabase auth helpers: Supabase lane"),
    "drizzle-orm": ("data", "Drizzle: Postgres socket -> Hyperdrive, per-request client"),
    "@prisma/client": ("data", "Prisma: needs driver adapter (@prisma/adapter-pg / -neon) on Workers"),
    "prisma": ("data", "Prisma CLI: migrations become a db-migrate component"),
    "pg": ("data", "pg driver: Hyperdrive, per-request client"),
    "postgres": ("data", "postgres.js: Hyperdrive, per-request client"),
    "mysql2": ("data", "MySQL: Hyperdrive supports MySQL"),
    "@planetscale/database": ("data", "PlanetScale over HTTP works on Workers"),
    "@libsql/client": ("data", "Turso/libSQL over HTTP works; or D1"),
    "mongodb": ("data", "MongoDB driver: needs nodejs_compat TCP; prefer Data API/Atlas over HTTP"),
    "mongoose": ("data", "Mongoose: risky on Workers (TCP); consider a container lane"),
    "convex": ("data", "Convex: keep on Convex Cloud; gated-deploy component"),
    "firebase": ("data", "Firebase client: works; keep external"),
    "firebase-admin": ("data", "firebase-admin: heavy, Node APIs; check carefully"),
    "@sanity/client": ("data", "Sanity: keep external; mount Studio client-only"),
    "contentful": ("data", "Contentful: keep external"),
    # auth / payments / ai
    "next-auth": ("service", "Auth.js: works on Workers; AUTH_SECRET as Worker secret"),
    "@auth/core": ("service", "Auth.js core"),
    "@clerk/nextjs": ("service", "Clerk: works; keys as secrets/env"),
    "@workos-inc/authkit-nextjs": ("service", "WorkOS AuthKit in middleware: needs WORKOS_CLIENT_ID + cookie password at runtime"),
    "better-auth": ("service", "better-auth: DB-backed; follows the data lane"),
    "stripe": ("service", "Stripe: Stripe.createFetchHttpClient(), constructEventAsync; placeholder key for the build"),
    "ai": ("service", "AI SDK: works; Vercel AI Gateway needs its key, or switch provider"),
    "@ai-sdk/gateway": ("service", "Vercel AI Gateway: keep with AI_GATEWAY_API_KEY or switch to Cloudflare AI Gateway"),
    "resend": ("service", "Resend: works over fetch"),
    "@sentry/nextjs": ("service", "Sentry: use @sentry/cloudflare or drop"),
    "posthog-js": ("service", "PostHog: works; key is build-time public"),
    "inngest": ("service", "Inngest: works; serve route + signing key"),
    "@trigger.dev/sdk": ("service", "Trigger.dev: works externally"),
    # size / runtime risks
    "shiki": ("size", "full Shiki bundles every grammar (~9 MB): use shiki/core + chosen langs on the server"),
    "sharp": ("native", "sharp is native: use the Cloudflare Images binding or drop"),
    "bcrypt": ("native", "bcrypt is native: use bcryptjs or WebCrypto"),
    "argon2": ("native", "argon2 is native"),
    "canvas": ("native", "canvas is native"),
    "better-sqlite3": ("native", "better-sqlite3 is native: D1"),
    "puppeteer": ("native", "headless Chrome: Cloudflare Browser Rendering"),
    "playwright": ("native", "headless browser at runtime: Browser Rendering (fine as a devDependency)"),
    "@sparticuz/chromium": ("native", "Lambda Chrome: Browser Rendering"),
    "ffmpeg-static": ("native", "ffmpeg: container lane"),
    "@aws-sdk/client-s3": ("size", "AWS SDK v3 is large; R2 speaks S3 (or use aws4fetch)"),
    "aws-sdk": ("size", "AWS SDK v2: too large/Node-only; aws4fetch"),
    "monaco-editor": ("size", "client-only; keep out of server bundles"),
    "mermaid": ("size", "client-only; keep out of server bundles"),
    "lexical": ("size", "large editor; client components still render on the server"),
    "@sanity/ui": ("size", "Studio: mount client-only"),
    "sanity": ("size", "Sanity Studio (~10 MB): next/dynamic ssr:false"),
    "pdfjs-dist": ("size", "large; client-only"),
    "@xdevplatform/chat-xdk": ("size", "WASM SDK: alias to a server stand-in if browser-only"),
}

SIGNAL_PATTERNS = {
    "runtime fs read": re.compile(r"\b(readFile|readFileSync|readdir|readdirSync|createReadStream|existsSync|statSync)\s*\("),
    "process.cwd()": re.compile(r"process\.cwd\(\)"),
    "edge runtime export": re.compile(r"export\s+const\s+runtime\s*=\s*['\"](edge|nodejs|experimental-edge)['\"]"),
    "use cache": re.compile(r"['\"]use cache(:[a-z]+)?['\"]"),
    "revalidateTag/Path": re.compile(r"\brevalidate(Tag|Path)\s*\("),
    "unstable_cache": re.compile(r"\bunstable_cache\s*\("),
    "ISR revalidate export": re.compile(r"export\s+const\s+revalidate\s*="),
    "next/og ImageResponse": re.compile(r"from\s+['\"](next/og|@vercel/og)['\"]"),
    "next/image": re.compile(r"from\s+['\"]next/image['\"]"),
    "waitUntil / after": re.compile(r"\b(waitUntil|unstable_after|after)\s*\("),
    "geolocation headers": re.compile(r"x-vercel-ip-|request\.geo\b|geolocation\("),
    "VERCEL_* env": re.compile(r"\bVERCEL_[A-Z_]+"),
    "WebSocket server": re.compile(r"new\s+WebSocketServer|ws\.Server\b|socket\.io"),
    "child_process": re.compile(r"from\s+['\"](node:)?child_process['\"]|require\(['\"](node:)?child_process"),
}
ENV_RE = re.compile(r"process\.env\.([A-Z][A-Z0-9_]+)|import\.meta\.env\.([A-Z][A-Z0-9_]+)")


def read_json(p):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return None


def walk(root):
    for d, dirs, files in os.walk(root):
        dirs[:] = [x for x in dirs if x not in SKIP_DIRS and not x.startswith(".git")]
        for f in files:
            yield Path(d) / f


def is_runtime_code(rel):
    s = str(rel)
    return not re.search(r"(^|/)(scripts|tests?|__tests__|e2e|cypress|playwright|fixtures|examples?)/|\.(test|spec|stories)\.", s)


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    root = Path(sys.argv[1]).resolve()
    as_json = "--json" in sys.argv
    rep = {"root": str(root)}

    # package manager / workspaces
    lock = next((n for n in ["pnpm-lock.yaml", "yarn.lock", "package-lock.json", "bun.lockb", "bun.lock"] if (root / n).exists()), None)
    rep["lockfile"] = lock
    pkg = read_json(root / "package.json") or {}
    rep["packageManager"] = pkg.get("packageManager")
    rep["engines"] = pkg.get("engines")
    ws = []
    if (root / "pnpm-workspace.yaml").exists():
        txt = (root / "pnpm-workspace.yaml").read_text()
        m = re.search(r"^packages:\s*\n((?:\s+-.*\n?)+)", txt, re.M)
        ws = re.findall(r"-\s*['\"]?([^'\"\n]+)['\"]?", m.group(1)) if m else []
    elif isinstance(pkg.get("workspaces"), list):
        ws = pkg["workspaces"]
    elif isinstance(pkg.get("workspaces"), dict):
        ws = pkg["workspaces"].get("packages", [])
    rep["workspaces"] = ws

    # every package.json = a candidate app/package
    apps = []
    for p in walk(root):
        if p.name != "package.json":
            continue
        data = read_json(p) or {}
        deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
        rel = p.parent.relative_to(root)
        found = {k: deps[k] for k in deps if k in DEPS}
        fw = [k for k in found if DEPS[k][0] == "framework"]
        # vite is only "the framework" when nothing else is (vitest pulls it in)
        if "vite" in fw and len(fw) > 1:
            fw.remove("vite")
        apps.append({"path": str(rel) or ".", "name": data.get("name"), "frameworks": {k: deps[k] for k in fw},
                     "signals": {k: {"version": deps[k], "category": DEPS[k][0], "note": DEPS[k][1]} for k in found if DEPS[k][0] != "framework"},
                     "scripts": data.get("scripts", {}), "dep_count": len(deps)})
    rep["packages"] = apps

    # next.config / framework configs
    cfgs = {}
    for p in walk(root):
        if re.match(r"^(next|astro|nuxt|svelte|vite|remix|react-router|app)\.config\.(js|mjs|ts|cjs|mts)$", p.name):
            txt = p.read_text(errors="ignore")
            flags = [k for k in ["output", "cacheComponents", "experimental", "images", "i18n", "rewrites", "redirects", "headers", "basePath", "serverExternalPackages", "outputFileTracing", "ppr", "turbopack", "webpack", "adapter"] if re.search(r"\b" + k + r"\b", txt)]
            cfgs[str(p.relative_to(root))] = flags
    rep["configs"] = cfgs

    # vercel.json files
    vj = {}
    for p in walk(root):
        if p.name == "vercel.json":
            d = read_json(p) or {}
            vj[str(p.relative_to(root))] = {k: d.get(k) for k in ["crons", "rewrites", "redirects", "headers", "functions", "regions", "buildCommand", "installCommand", "outputDirectory", "framework", "git"] if k in d}
    rep["vercel_json"] = vj

    # api/ directory (Vercel Functions outside a framework)
    rep["vercel_functions_dirs"] = sorted({str(p.parent.relative_to(root)) for p in walk(root)
                                           if p.parent.name == "api" and p.suffix in {".py", ".go", ".rb", ".rs", ".ts", ".js"}
                                           and "app/api" not in str(p) and "pages/api" not in str(p) and "src/" not in str(p.relative_to(root))})
    rep["non_js_functions"] = sorted({str(p.relative_to(root)) for p in walk(root) if p.suffix in {".py", ".go", ".rb", ".rs"} and "/api/" in "/" + str(p.relative_to(root))})[:20]

    # middleware / proxy / instrumentation
    rep["entry_files"] = sorted(str(p.relative_to(root)) for p in walk(root)
                                if re.match(r"^(middleware|proxy|instrumentation)(\.[a-z]+)?\.(ts|js|mjs)$", p.name))

    # code signals
    sig = {k: [] for k in SIGNAL_PATTERNS}
    env_names = set()
    for p in walk(root):
        if p.suffix not in CODE_EXT:
            continue
        rel = p.relative_to(root)
        try:
            txt = p.read_text(errors="ignore")
        except Exception:
            continue
        for m in ENV_RE.finditer(txt):
            env_names.add(m.group(1) or m.group(2))
        if not is_runtime_code(rel):
            continue
        for k, rx in SIGNAL_PATTERNS.items():
            if rx.search(txt) and len(sig[k]) < 25:
                sig[k].append(str(rel))
    rep["code_signals"] = {k: v for k, v in sig.items() if v}

    # env vars: .env.example + code
    example = []
    for n in [".env.example", ".env.local.example", ".env.sample", ".env.template", "example.env"]:
        for p in root.rglob(n):
            if any(s in p.parts for s in SKIP_DIRS):
                continue
            for line in p.read_text(errors="ignore").splitlines():
                m = re.match(r"^\s*#?\s*([A-Z][A-Z0-9_]+)\s*=", line)
                if m:
                    example.append(m.group(1))
    allenv = sorted(set(example) | env_names)
    rep["env"] = {
        "public_build_time": [e for e in allenv if re.match(r"^(NEXT_PUBLIC_|VITE_|PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_)", e)],
        "vercel_system": [e for e in allenv if e.startswith("VERCEL_")],
        "server": [e for e in allenv if not re.match(r"^(NEXT_PUBLIC_|VITE_|PUBLIC_|NUXT_PUBLIC_|EXPO_PUBLIC_|VERCEL_|NODE_ENV|NEXT_RUNTIME|NEXT_PHASE|CI$)", e)],
    }

    # cron
    crons = []
    for f, d in vj.items():
        for c in (d.get("crons") or []):
            crons.append({"file": f, **c})
    rep["crons"] = crons

    # verdict hints
    cats = {}
    for a in apps:
        for k, v in a["signals"].items():
            cats.setdefault(v["category"], set()).add(k)
    lane = "cloudflare"
    if cats.get("data", set()) & {"@supabase/supabase-js", "@supabase/ssr", "drizzle-orm", "pg", "postgres", "@vercel/postgres", "@prisma/client", "prisma"}:
        lane = "cloudflare+supabase (Postgres) unless the database stays external"
    if cats.get("data", set()) & {"convex", "firebase", "firebase-admin", "@planetscale/database", "@neondatabase/serverless", "mongodb", "mongoose"}:
        lane += "; external backend(s) kept: " + ", ".join(sorted(cats["data"] & {"convex", "firebase", "firebase-admin", "@planetscale/database", "@neondatabase/serverless", "mongodb", "mongoose"}))
    blockers = []
    if rep["non_js_functions"]:
        blockers.append("non-JS serverless functions (Python/Go/Ruby/Rust): container lane, out of scope for Workers")
    if cats.get("native"):
        blockers.append("native modules: " + ", ".join(sorted(cats["native"])))
    if rep["code_signals"].get("WebSocket server"):
        blockers.append("a WebSocket server: Durable Objects rewrite")
    if rep["code_signals"].get("child_process"):
        blockers.append("child_process at runtime")
    rep["hints"] = {"lane": lane, "blockers": blockers}

    if as_json:
        print(json.dumps(rep, indent=2, default=list))
        return
    out = [f"# Vercel port survey: {root.name}", ""]
    out.append(f"- Lockfile: {lock}; packageManager: {rep['packageManager']}; engines: {rep['engines']}")
    out.append(f"- Workspaces: {ws or 'none'}")
    out.append(f"- Lane hint: **{lane}**")
    out.append(f"- Possible blockers: {'; '.join(blockers) if blockers else 'none found'}")
    out.append("")
    out.append("## Packages")
    for a in apps:
        if not a["frameworks"] and not a["signals"]:
            continue
        out.append(f"### `{a['path']}` ({a['name']}, {a['dep_count']} deps)")
        if a["frameworks"]:
            out.append("Frameworks: " + ", ".join(f"{k}@{v} ({DEPS[k][1]})" for k, v in a["frameworks"].items()))
        for k, v in sorted(a["signals"].items(), key=lambda x: x[1]["category"]):
            out.append(f"- [{v['category']}] `{k}@{v['version']}`: {v['note']}")
        bs = {k: v for k, v in a["scripts"].items() if k in ("build", "dev", "start", "postinstall", "prebuild", "vercel-build")}
        if bs:
            out.append("Scripts: " + "; ".join(f"`{k}`: `{v}`" for k, v in bs.items()))
        out.append("")
    out.append("## Framework configs")
    for f, flags in cfgs.items():
        out.append(f"- `{f}`: {', '.join(flags) or '(nothing notable)'}")
    out.append("")
    out.append("## vercel.json")
    for f, d in vj.items():
        out.append(f"- `{f}`: {json.dumps(d)[:600]}")
    if not vj:
        out.append("- none")
    out.append("")
    out.append(f"## Middleware / proxy / instrumentation\n- {', '.join(rep['entry_files']) or 'none'}\n")
    if rep["vercel_functions_dirs"] or rep["non_js_functions"]:
        out.append(f"## Vercel Functions outside the framework\n- dirs: {rep['vercel_functions_dirs']}\n- non-JS: {rep['non_js_functions']}\n")
    out.append("## Code signals (runtime code only; read each file)")
    for k, v in rep["code_signals"].items():
        out.append(f"- **{k}** ({len(v)}{'+' if len(v) >= 25 else ''}): {', '.join(v[:8])}{' …' if len(v) > 8 else ''}")
    out.append("")
    out.append("## Env vars")
    for k, v in rep["env"].items():
        out.append(f"- {k} ({len(v)}): {', '.join(v[:60])}{' …' if len(v) > 60 else ''}")
    out.append("")
    out.append(f"## Cron\n- {crons or 'none in vercel.json'}")
    print("\n".join(out))


if __name__ == "__main__":
    main()
