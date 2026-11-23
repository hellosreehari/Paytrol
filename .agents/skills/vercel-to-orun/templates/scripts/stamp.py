#!/usr/bin/env python3
"""Stamp the vercel-to-orun templates into a repository.

Copies the Orun files a port needs (intent.yaml, the repo-local compositions,
the Terraform roots the app binds, the wiring tooling, the CI workflow, the
Worker config for the app's framework) and fills their placeholders. It never
overwrites a file unless --force, and it ends by listing what is still yours
to fill (smoke text, migrations, the env the app reads).

  python3 stamp.py --repo ../my-app --project my-app --ws ws_ABC123 \
      --owner my-org --subdomain my-sub --roots next-cache-kv

Only the standard library. Run with --dry-run first to see what it would do.
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import sys
from pathlib import Path

# This file is <skill>/templates/scripts/stamp.py.
SKILL = Path(__file__).resolve().parent.parent.parent

# Files that tools index by name ship renamed: a copy of this bundle inside a
# repository (the orunbase.com mirror under apps/, a project-level skills
# pull) must not be planned as a component or resolved as a workspace package.
TEMPLATE_NAMES = {
    "component.template.yaml": "component.yaml",
    "package.template.json": "package.json",
}
T = SKILL / "templates"

# What each framework builds, and where the workers-app composition finds it.
# `main` is what the wrangler template's "main" says (None: the framework's
# Vite plugin resolves the entry and refuses one); `config` is the file the
# deploy hands to wrangler.
FRAMEWORKS = {
    "next": dict(entry=".open-next/worker.js", assets=".open-next/assets",
                 config="wrangler.jsonc", build="pnpm build:worker"),
    # The adapter derives dist/server/wrangler.json (assets ../client) from
    # the source config, whose assets directory is ./dist.
    "astro": dict(entry="dist/server/entry.mjs", assets="dist/client",
                  config="dist/server/wrangler.json", build="pnpm build",
                  main=None, not_found="none", tmpl_assets="./dist"),
    "nuxt": dict(entry=".output/server/index.mjs", assets=".output/public",
                 config="wrangler.jsonc", build="pnpm build",
                 main=".output/server/index.mjs", not_found="none"),
    "sveltekit": dict(entry=".svelte-kit/cloudflare/_worker.js",
                      assets=".svelte-kit/cloudflare", config="wrangler.jsonc",
                      build="pnpm build", main=".svelte-kit/cloudflare/_worker.js",
                      not_found="none"),
    "react-router": dict(entry="build/server/index.js", assets="build/client",
                         config="build/server/wrangler.json", build="pnpm build",
                         main="./workers/app.ts", not_found="none"),
    "static": dict(entry="worker/assets-worker.js", assets="dist",
                   config="wrangler.jsonc", build="pnpm build",
                   main="worker/assets-worker.js",
                   not_found="single-page-application"),
}

# Terraform roots: the keys of their wiring document (fixture values are
# fakes for verify lanes and local runs) and the wrangler binding they feed.
ROOTS = {
    "next-cache-kv": dict(fixture={"next_inc_cache_kv_id": "0" * 31 + "{n}",
                                   "next_inc_cache_kv_title": "fixture-next-cache-{env}"},
                          wired=True),
    "cloudflare-kv": dict(fixture={"app_kv_id": "0" * 30 + "1{n}",
                                   "app_kv_title": "fixture-kv-{env}"},
                          wired=True,
                          binding=('kv_namespaces',
                                   '{ "binding": "KV", "id": "@@wiring(cloudflare-kv/__ENV__:app_kv_id)@@" }')),
    "cloudflare-d1": dict(fixture={"d1_database_id": "00000000-0000-0000-0000-00000000000{n}",
                                   "d1_database_name": "fixture-d1-{env}"},
                          wired=True,
                          binding=('d1_databases',
                                   '{ "binding": "DB", "database_name": "@@wiring(cloudflare-d1/__ENV__:d1_database_name)@@", '
                                   '"database_id": "@@wiring(cloudflare-d1/__ENV__:d1_database_id)@@" }')),
    "cloudflare-r2": dict(fixture={"r2_bucket_name": "fixture-bucket-{env}"},
                          wired=True,
                          binding=('r2_buckets',
                                   '{ "binding": "BUCKET", "bucket_name": "@@wiring(cloudflare-r2/__ENV__:r2_bucket_name)@@" }')),
    "cloudflare-hyperdrive": dict(fixture={"hyperdrive_id": "0" * 30 + "2{n}",
                                           "hyperdrive_name": "fixture-hyperdrive-{env}"},
                                  wired=True,
                                  binding=('hyperdrive',
                                           '{ "binding": "HYPERDRIVE", "id": "@@wiring(cloudflare-hyperdrive/__ENV__:hyperdrive_id)@@" }')),
    # Supabase feeds env (URL, keys), not wrangler bindings: map its secrets
    # in the component's secretEnv (references/supabase-lane.md §3).
    "supabase": dict(fixture={}, wired=False),
}
ENV_INDEX = {"stage": 1, "prod": 2}
# Build-time public env prefix per framework.
PUBLIC_PREFIX = {"next": "NEXT_PUBLIC_", "astro": "PUBLIC_", "sveltekit": "PUBLIC_",
                 "nuxt": "NUXT_PUBLIC_", "react-router": "VITE_", "static": "VITE_"}
PLACEHOLDER = re.compile(r"__[A-Z][A-Z0-9_]*__")
RUNTIME_TOKENS = {"__ENV__"}  # substituted by tooling/wire at build time


class Stamper:
    def __init__(self, args: argparse.Namespace):
        self.a = args
        self.repo = Path(args.repo).resolve()
        self.written: list[str] = []
        self.skipped: list[str] = []
        self.todo: list[str] = []

    # ------------------------------------------------------------ helpers
    def values(self) -> dict[str, str]:
        a = self.a
        v = {
            "__PROJECT__": a.project, "__WS__": a.ws, "__OWNER__": a.owner,
            "__SUBDOMAIN__": a.subdomain, "__PNPM_VERSION__": a.pnpm,
            "__ORUN_VERSION__": a.orun, "__STACK_TECTONIC__": a.stack_tectonic,
            "__WORKER__": f"{a.project}-{a.app_name}", "__APP__": a.app_name,
            "__VERCEL_PROJECT__": a.project,
        }
        if a.smoke_text:
            v["__SMOKE_TEXT__"] = a.smoke_text
        return v

    def fill(self, text: str) -> str:
        for k, val in self.values().items():
            text = text.replace(k, val)
        return text

    def put(self, rel: str, text: str, mode: int | None = None) -> None:
        dest = self.repo / rel
        if dest.exists() and not self.a.force:
            self.skipped.append(rel)
            return
        self.written.append(rel)
        if self.a.dry_run:
            return
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(text)
        if mode:
            dest.chmod(mode)

    def copy_tree(self, src: Path, rel_dest: str, overlay: Path | None = None,
                  skip: set[str] = frozenset()) -> None:
        """Copy src to rel_dest; a file in `overlay` with the same relative path
        replaces src's, and overlay-only files are added. `skip` drops paths."""
        files = {str(f.relative_to(src)): f for f in src.rglob("*") if f.is_file()}
        if overlay is not None:
            files.update({str(f.relative_to(overlay)): f for f in overlay.rglob("*") if f.is_file()})
        for relpath in sorted(files):
            if relpath in skip:
                continue
            f = files[relpath]
            rel = f"{rel_dest}/{relpath}"
            for template_name, real_name in TEMPLATE_NAMES.items():
                if rel.endswith("/" + template_name):
                    rel = rel[: -len(template_name)] + real_name
            try:
                self.put(rel, self.fill(f.read_text()), f.stat().st_mode & 0o777)
            except UnicodeDecodeError:
                if not (self.repo / rel).exists() or self.a.force:
                    self.written.append(rel)
                    if not self.a.dry_run:
                        (self.repo / rel).parent.mkdir(parents=True, exist_ok=True)
                        shutil.copy2(f, self.repo / rel)

    # ------------------------------------------------------------ pieces
    def build_command(self, prefix: str, wired: list[str]) -> str:
        fw = FRAMEWORKS[self.a.framework]
        render = (f'node {prefix}tooling/wire/render.mjs --template wrangler.template.jsonc '
                  f'--out wrangler.jsonc --map {prefix}wiring.fixture.json --env "${{ORUN_ENVIRONMENT}}"')
        if wired:
            live = (f'node {prefix}tooling/wire/live.mjs --template wrangler.template.jsonc '
                    f'--out wrangler.jsonc --components {",".join(wired)} --env "${{ORUN_ENVIRONMENT}}"')
            wire = f'if [ -n "${{CLOUDFLARE_API_TOKEN:-}}" ]; then {live}; else {render}; fi'
        else:
            wire = render
        return f"'{wire} && {fw['build']}'"

    def component_text(self, text: str, indent: str, prefix: str) -> str:
        """Rewrite the app component's framework, wiring and dependency lines.

        `indent` is the depth of the component's own keys (four spaces inline
        in intent.yaml, two in a component.yaml under `spec:`).
        """
        fw = FRAMEWORKS[self.a.framework]
        roots = self.a.roots
        wired = [r for r in roots if ROOTS[r]["wired"]]
        inner = indent + "  "

        def sub_param(key: str, value: str, s: str) -> str:
            pat = re.compile(rf"^({inner}{key}: ).*$", re.M)
            if not pat.search(s):
                sys.exit(f"stamp: template lost its `{key}:` line; update stamp.py")
            return pat.sub(lambda m: m.group(1) + value, s, count=1)

        text = sub_param("wranglerConfig", fw["config"], text)
        entry = "worker.ts" if (self.a.crons and self.a.framework == "next") else fw["entry"]
        text = sub_param("workerEntrypoint", entry, text)
        text = sub_param("assetsDir", fw["assets"], text)
        text = sub_param("buildCommand", self.build_command(prefix, wired), text)
        if self.a.framework != "next":
            text = re.sub(r"\n\s*NEXT_TELEMETRY_DISABLED: \"1\"", "", text)
            text = text.replace("NEXT_PUBLIC_SITE_URL", PUBLIC_PREFIX[self.a.framework] + "SITE_URL")
            text = re.sub(r"  # non-Next: see references/frameworks.md", "", text)

        # dependsOn: every infra root the app needs before it deploys.
        deps = list(roots) + (["db-migrate"] if self.a.db_migrate else [])
        dep_items = "".join(f"{inner}- component: {d}\n" for d in deps)
        dep_block = re.compile(rf"^{indent}dependsOn:\n(?:{inner}[-#].*\n)+", re.M)
        if dep_block.search(text):
            text = dep_block.sub(lambda m: (f"{indent}dependsOn:\n" + dep_items) if deps else "",
                                 text, count=1)
        elif deps:
            anchor = f"{indent}lane: isolated\n"
            if anchor not in text:
                sys.exit("stamp: template lost its `lane: isolated` line; update stamp.py")
            text = text.replace(anchor, anchor + f"{indent}dependsOn:\n" + dep_items, 1)

        # optionalSecretEnv: the wiring documents live.mjs reads in deploy lanes.
        lines = []
        for r in wired:
            k = "WIRING_" + r.upper().replace("-", "_")
            for env in ("stage", "prod"):
                lines.append(f'{inner}{k}_{env.upper()}: "secret://__WS__/__PROJECT__/{env}/{k}"\n')
        block = (f"{indent}optionalSecretEnv:\n" + "".join(lines)) if lines else ""
        ose = re.compile(rf"^{indent}optionalSecretEnv:\n(?:{inner}.*\n)+", re.M)
        if ose.search(text):
            text = ose.sub(lambda m: block, text, count=1)
        elif block:
            anchor = f"{indent}subscribe:\n"
            if anchor not in text:
                sys.exit("stamp: template lost its `subscribe:` line; update stamp.py")
            text = text.replace(anchor, block + anchor, 1)
        return self.fill(text)

    def wrangler_template(self) -> str:
        fw_name = self.a.framework
        if fw_name == "next":
            kind = self.a.next_cache
            src = T / "next" / f"wrangler.template.{'kv' if kind == 'kv' else 'static'}.jsonc"
            text = src.read_text()
        else:
            fw = FRAMEWORKS[fw_name]
            text = (T / "worker" / "wrangler.template.jsonc").read_text()
            if fw["main"] is None:
                text = re.sub(r'\n  "main": "__MAIN__",', "", text)
            text = (text.replace("__MAIN__", fw.get("main") or "")
                        .replace("__ASSETS_DIR__", fw.get("tmpl_assets", fw["assets"]))
                        .replace("__NOT_FOUND__", fw["not_found"]))
        if self.a.crons and fw_name == "next":
            text = text.replace('"main": ".open-next/worker.js"', '"main": "worker.ts"', 1)
            cut = text.rstrip().rfind("}")
            text = (text[:cut] + '  // One trigger; lib/cron/schedule.ts runs the upstream schedules due each minute.\n'
                    '  "triggers": { "crons": ["* * * * *"] },\n' + text[cut:])
        # Bindings for the other roots, before the closing brace. KV joins an
        # existing kv_namespaces array when the Next cache already made one.
        for r in self.a.roots:
            b = ROOTS[r].get("binding")
            if not b:
                continue
            key, entry = b
            if f'"{key}": [' in text:
                text = text.replace(f'"{key}": [', f'"{key}": [\n    {entry},', 1)
            else:
                cut = text.rstrip().rfind("}")
                text = (text[:cut] + f'  // Rename the binding to what the code reads.\n'
                        f'  "{key}": [{entry}],\n' + text[cut:])
        return self.fill(text)

    def fixture(self) -> str:
        doc: dict[str, dict[str, str]] = {}
        for r in self.a.roots:
            if not ROOTS[r]["wired"]:
                continue
            for env, n in ENV_INDEX.items():
                doc[f"{r}/{env}"] = {k: v.format(n=n, env=env)
                                     for k, v in ROOTS[r]["fixture"].items()}
        return json.dumps(doc, indent=2) + "\n"

    def gitignore(self) -> None:
        want = [".open-next/", ".wrangler/", "wrangler.jsonc", ".dev.vars*",
                "!.dev.vars.example", "**/.orun/"]
        if self.a.framework != "next":
            want.remove(".open-next/")
        path = self.repo / ".gitignore"
        have = path.read_text().splitlines() if path.exists() else []
        missing = [w for w in want if w not in have]
        if missing:
            self.written.append(".gitignore (+" + ", ".join(missing) + ")")
            if not self.a.dry_run:
                with path.open("a") as fh:
                    fh.write("\n# Cloudflare Workers build and local state (vercel-to-orun)\n")
                    fh.write("\n".join(missing) + "\n")

    # ------------------------------------------------------------ run
    def run(self) -> None:
        a = self.a
        app_dir = a.app_dir.strip("/") or "."
        at_root = app_dir == "."
        prefix = "" if at_root else "../" * len(Path(app_dir).parts)

        # intent.yaml
        intent = (T / "repo" / "intent.template.yaml").read_text()
        if at_root:
            web_start = intent.index("  - name: web\n")
            web_end = intent.index("\n  # OPTIONAL: a backend")
            web = self.component_text(intent[web_start:web_end] + "\n", "    ", "")
            web = web.replace("  - name: web\n", f"  - name: {a.app_name}\n", 1)
            intent = intent[:web_start] + web.rstrip("\n") + "\n" + intent[web_end:]
            intent = intent.replace(
                "  # The main app. Shown for an app at the repository root (path: .); for an\n"
                "  # app under apps/<name>, use templates/repo/apps-app.component.template.yaml instead\n"
                "  # and drop this block.\n", "  # The main app, at the repository root (the upstream layout).\n", 1)
        else:
            # The app has its own component.yaml; the intent declares none inline.
            web_start = intent.index("  # The main app.")
            web_end = intent.index("  # OPTIONAL: a backend")
            intent = intent[:web_start] + intent[web_end:]
            intent = intent.replace("    # - apps/          # OPTIONAL: monorepo apps with their own component.yaml",
                                    f"    - {Path(app_dir).parts[0]}/")
        if a.app_name != "web":
            intent = intent.replace("-web-stage.", f"-{a.app_name}-stage.").replace("-web-prod.", f"-{a.app_name}-prod.")
        intent = intent.replace(
            "      # - component: backend              # OPTIONAL: an external backend deploys first\n", "")
        if a.db_migrate:
            # db-migrate builds the `db` component (packages/db) first.
            intent = intent.replace("    - infra/\n", "    - infra/\n    - packages/db/\n", 1)
        self.put("intent.yaml", self.fill(intent))

        if not at_root:
            comp = (T / "repo" / "apps-app.component.template.yaml").read_text()
            comp = comp.replace("workspaceDir: ../..", f"workspaceDir: {prefix.rstrip('/') or '.'}")
            comp = self.component_text(comp, "  ", prefix)
            self.put(f"{app_dir}/component.yaml", comp)

        # Compositions
        self.put("infra/stack/stack.yaml", self.fill((T / "repo/infra/stack/stack.yaml").read_text()))
        self.copy_tree(T / "repo/infra/stack/compositions/workers-app",
                       "infra/stack/compositions/workers-app")
        if a.gated_deploy:
            self.copy_tree(T / "repo/infra/stack/compositions/gated-deploy",
                           "infra/stack/compositions/gated-deploy")

        # Infra roots, migrations
        for r in a.roots:
            self.copy_tree(T / "repo/infra/terraform" / r, f"infra/terraform/{r}")
            shared = (T / "repo/infra/terraform/shared/orun-variables.tf").read_text()
            self.put(f"infra/terraform/{r}/terraform/orun-variables.tf", self.fill(shared.replace("__ROOT__", r)))
        if a.db_migrate:
            # The same runner and db-migrate composition; the adapter differs
            # (Supabase Management API, or the D1 HTTP API).
            d1 = "supabase" not in a.roots
            self.copy_tree(T / ("repo/infra/db-migrate-d1" if d1 else "repo/infra/db-migrate"), "infra/db-migrate")
            # packages-db holds the shared runner; packages-db-d1 only what differs.
            self.copy_tree(T / "repo/packages-db", "packages/db",
                           overlay=T / "repo/packages-db-d1" if d1 else None,
                           skip={"src/runner/supabase-api-adapter.ts"} if d1 else set())
            self.todo.append("pnpm-workspace.yaml lists packages/db, and turbo is a root devDependency "
                             "(the db-migrate composition runs turbo)")
            self.todo.append("packages/db/src/manifest.ts: list the app's migrations "
                             "(__MIGRATIONS__), then `pnpm --filter @saas/db run manifest:fix`")

        # Wiring and CI
        self.copy_tree(T / "repo/tooling/wire", "tooling/wire")
        self.put("wiring.fixture.json", self.fixture())
        self.copy_tree(T / "repo/github", ".github")  # bundles carry no dot-folders

        # The app's Worker config
        base = "" if at_root else f"{app_dir}/"
        self.put(f"{base}wrangler.template.jsonc", self.wrangler_template())
        if a.framework == "next":
            oc = "kv" if a.next_cache == "kv" else "static"
            self.put(f"{base}open-next.config.ts", (T / f"next/open-next.config.{oc}.ts").read_text())
            self.put(f"{base}.dev.vars.example", (T / "next/dev.vars.example").read_text())
            if a.fill_standalone:
                self.copy_tree(T / "repo/tooling/opennext", "tooling/opennext")
                self.todo.append(f"build:worker runs `node tooling/opennext/fill-standalone.mjs {a.app_dir}` "
                                 "between the Next build and the OpenNext bundle")
            self.todo.append(f"{base}package.json: add build:worker, preview:worker, wire:fixture "
                             "(the nextjs-on-workers skill, §3)")
            app_root = self.repo / (a.app_dir if a.app_dir != "." else "")
            configs = sorted(app_root.glob("next.config.*"))
            if not configs:
                self.todo.append(f"{base}next.config.ts does not exist: create it with output: \"standalone\"")
            else:
                cfg = configs[0].read_text(errors="ignore")
                if "standalone" not in cfg:
                    self.todo.append(f"{configs[0].relative_to(self.repo)}: add output: \"standalone\"")
                if re.search(r"cacheComponents\s*:\s*true", cfg):
                    self.todo.append(f"{configs[0].relative_to(self.repo)}: cacheComponents: true hangs on Workers "
                                     "(opennextjs-cloudflare#1450): use experimental.useCache, or drop it")
        elif a.framework == "static":
            self.put(f"{base}worker/assets-worker.js", (T / "worker/assets-worker.js").read_text())
            self.todo.append(f"assetsDir is `dist`: change it (component and wrangler template) "
                             "if the build writes elsewhere (build/, public/, out/)")
        if a.crons:
            sched = "[\n" + "".join(
                f'  {{ path: {json.dumps(c["path"])}, schedule: {json.dumps(c["schedule"])} }},\n'
                for c in a.crons) + "]"
            self.put(f"{base}lib/cron/schedule.ts",
                     (T / "cron/lib/cron/schedule.ts").read_text().replace("__CRON_SCHEDULES__", sched))
            self.put(f"{base}lib/cron/scheduled.ts", (T / "cron/lib/cron/scheduled.ts").read_text())
            if a.framework == "next":
                do = ('// @ts-ignore generated by the build\n'
                      'export { DOQueueHandler } from "./.open-next/worker.js";\n') if a.next_cache == "kv" else ""
                self.put(f"{base}worker.ts", (T / "cron/worker.ts").read_text().replace("__DO_EXPORTS__\n", do))
            else:
                self.todo.append(f"cron ({len(a.crons)} schedules): add a `scheduled` handler to this framework's "
                                 "Worker entry using lib/cron/scheduled.ts, and `triggers.crons: [\"* * * * *\"]` "
                                 "(references/frameworks.md, Cron jobs)")
            app_root = self.repo / (a.app_dir if a.app_dir != "." else "")
            uses_secret = any("CRON_SECRET" in f.read_text(errors="ignore")
                              for f in app_root.rglob("*") if f.is_file() and f.suffix in (".ts", ".tsx", ".js", ".mjs")
                              and not {"node_modules", ".next", ".open-next"} & set(f.parts)
                              and f.parent != app_root / "lib" / "cron")  # skip the files stamped above
            if uses_secret:
                self.todo.append("the cron routes check CRON_SECRET: generate it as an Orun secret, map it in "
                                 "secretEnv and list it in workerSecrets (references/orun-wiring.md §3)")
            self.todo.append(f"cron: {len(a.crons)} upstream schedule(s) run from one every-minute trigger per "
                             "environment; stage runs them too, so gate side effects there if needed")
        if a.framework in ("astro", "react-router"):
            self.todo.append(f"{a.framework}: check `{FRAMEWORKS[a.framework]['config']}` and the entry "
                             "exist after the first build; adjust the component if not")
        if "next-cache-kv" in a.roots and a.framework == "next" and a.next_cache != "kv":
            self.todo.append("next-cache-kv is stamped but --next-cache is not kv: drop one")
        if "supabase" in a.roots:
            self.todo.append("map the supabase root's secrets onto the env the app reads "
                             "(secretEnv; references/supabase-lane.md §3)")
        self.gitignore()

    def report(self) -> None:
        mode = "would write" if self.a.dry_run else "wrote"
        print(f"stamp: {mode} {len(self.written)} file(s) in {self.repo}")
        for w in self.written:
            print(f"  + {w}")
        for s in self.skipped:
            print(f"  = {s} (exists; --force to replace)")
        left: dict[str, set[str]] = {}
        if not self.a.dry_run:
            for rel in self.written:
                p = self.repo / rel.split(" (")[0]
                if p.is_file():
                    try:
                        found = set(PLACEHOLDER.findall(p.read_text())) - RUNTIME_TOKENS
                    except UnicodeDecodeError:
                        continue
                    if found:
                        left[rel] = found
        if left:
            print("\nplaceholders still to fill:")
            for rel, found in left.items():
                print(f"  {rel}: {', '.join(sorted(found))}")
        if self.todo:
            print("\nnext, by hand:")
            for t in self.todo:
                print(f"  - {t}")


def detect(repo: Path) -> tuple[str | None, str | None]:
    pkg = repo / "package.json"
    if not pkg.exists():
        return None, None
    data = json.loads(pkg.read_text())
    deps = {**data.get("dependencies", {}), **data.get("devDependencies", {})}
    pm = data.get("packageManager", "")
    pnpm = pm.split("@", 1)[1].split("+")[0] if pm.startswith("pnpm@") else None
    for name, fw in (("next", "next"), ("astro", "astro"), ("nuxt", "nuxt"),
                     ("@sveltejs/kit", "sveltekit"), ("@react-router/dev", "react-router"),
                     ("@remix-run/dev", "react-router")):
        if name in deps:
            return fw, pnpm
    if "vite" in deps or "gatsby" in deps or "@docusaurus/core" in deps:
        return "static", pnpm
    return None, pnpm


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--repo", required=True, help="the new repository's checkout")
    p.add_argument("--project", required=True, help="repo name; Orun project slug; Worker name prefix")
    p.add_argument("--ws", required=True, help="Orun workspace id (ws_...)")
    p.add_argument("--owner", required=True, help="GitHub owner of the new repository")
    p.add_argument("--subdomain", required=True, help="the Cloudflare account's workers.dev subdomain")
    p.add_argument("--framework", choices=sorted(FRAMEWORKS), help="default: detected from package.json")
    p.add_argument("--app-dir", default=".", help="the app's directory (default: repository root)")
    p.add_argument("--app-name", default="web", help="component name and Worker suffix (default: web)")
    p.add_argument("--roots", default="", help=f"comma list of infra roots: {', '.join(ROOTS)}")
    p.add_argument("--next-cache", choices=["kv", "static", "none"],
                   help="Next.js incremental cache (default: kv with next-cache-kv in --roots, else static)")
    p.add_argument("--db-migrate", action="store_true",
                   help="schema migrations for the supabase or cloudflare-d1 root (infra/db-migrate + packages/db)")
    p.add_argument("--gated-deploy", action="store_true", help="include the gated-deploy composition (external backend)")
    p.add_argument("--fill-standalone", action="store_true", help="nested Next app built from the root (tooling/opennext)")
    p.add_argument("--smoke-text", help="text the deployed home page must contain")
    p.add_argument("--no-cron", action="store_true",
                   help="skip the cron entry even though vercel.json declares crons")
    p.add_argument("--pnpm", help="pnpm version (default: package.json packageManager, else 10.12.1)")
    p.add_argument("--orun", default="v2.89.0", help="orun CLI version CI installs (check the live baselines)")
    p.add_argument("--stack-tectonic", default="0.20.0", help="stack-tectonic tag (check the live baselines)")
    p.add_argument("--force", action="store_true", help="replace files that exist")
    p.add_argument("--dry-run", action="store_true", help="list what would be written")
    a = p.parse_args()

    repo = Path(a.repo).resolve()
    if not repo.is_dir():
        sys.exit(f"stamp: {repo} is not a directory")
    fw, pnpm = detect(repo / a.app_dir if a.app_dir != "." else repo)
    if fw is None and a.app_dir != ".":
        fw, _ = detect(repo)
    if pnpm is None:
        _, pnpm = detect(repo)
    a.framework = a.framework or fw
    if not a.framework:
        sys.exit("stamp: could not detect the framework; pass --framework")
    a.pnpm = a.pnpm or pnpm or "10.12.1"
    a.roots = [r for r in a.roots.split(",") if r]
    for r in a.roots:
        if r not in ROOTS:
            sys.exit(f"stamp: unknown root {r!r}; choose from {', '.join(ROOTS)}")
    if a.next_cache is None:
        a.next_cache = "kv" if "next-cache-kv" in a.roots else "static"
    if a.framework == "next" and a.next_cache == "kv" and "next-cache-kv" not in a.roots:
        a.roots.insert(0, "next-cache-kv")
    if a.db_migrate and not {"supabase", "cloudflare-d1"} & set(a.roots):
        sys.exit("stamp: --db-migrate needs a database root (--roots supabase,... or cloudflare-d1,...)")

    a.crons = []
    if not a.no_cron:
        for vj in ([repo / a.app_dir / "vercel.json"] if a.app_dir != "." else []) + [repo / "vercel.json"]:
            if vj.exists():
                a.crons = json.loads(vj.read_text()).get("crons", [])
                break
    print(f"stamp: framework={a.framework} app={a.app_dir} roots={','.join(a.roots) or '-'} "
          f"pnpm={a.pnpm} next-cache={a.next_cache if a.framework == 'next' else '-'} crons={len(a.crons)}")
    s = Stamper(a)
    s.run()
    s.report()


if __name__ == "__main__":
    main()
