#!/usr/bin/env python3
"""Where the Worker's bytes go, against Cloudflare's size limit.

    python3 bundle-report.py <dry-run-outdir> [--handler <path/to/handler.mjs>]

<dry-run-outdir> is what `wrangler deploy --dry-run --outdir <dir>` wrote.
The report lists every uploaded file with raw and gzip size (WebAssembly and
fonts show up here) and, when an un-minified OpenNext handler is given
(.open-next/server-functions/default/handler.mjs, built with --noMinify),
attributes its bytes to packages via esbuild's `// path` module markers.
Cloudflare's limit (since 2026-09-04) is the uncompressed bundle, wrangler's
"Total Upload": 64 MiB on every plan. The compressed limits (3 MB Free, 10 MB
Paid) are gone; gzip is shown for reference. A big bundle also costs startup
time, and a Worker whose global scope takes over 1 s to run is refused
(error 10021). Standard library only.
"""
LIMIT = 64 * 1048576
import collections
import gzip
import re
import sys
from pathlib import Path


def gz(b):
    return len(gzip.compress(b, 9))


def mb(n):
    return f"{n / 1048576:6.2f} MiB"


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    out = Path(sys.argv[1])
    handler = None
    if "--handler" in sys.argv:
        handler = Path(sys.argv[sys.argv.index("--handler") + 1])

    rows = []
    for f in sorted(out.rglob("*")):
        if f.is_file() and not f.name.endswith(".map"):
            b = f.read_bytes()
            rows.append((len(b), gz(b), str(f.relative_to(out))))
    rows.sort(reverse=True)
    total_raw = sum(r[0] for r in rows)
    total_gz = sum(r[1] for r in rows)
    print("## Uploaded files (source maps excluded)")
    print(f"{'raw':>12} {'gzip':>12}  file")
    for r, g, n in rows[:25]:
        print(f"{mb(r):>12} {mb(g):>12}  {n}")
    print(f"{mb(total_raw):>12} {mb(total_gz):>12}  TOTAL (approx.; wrangler's Total Upload is authoritative)")
    pct = 100 * total_raw / LIMIT
    verdict = "OVER the limit" if total_raw > LIMIT else ("close to the limit" if pct > 80 else "fits")
    print(f"\n{pct:.0f}% of the 64 MiB uncompressed limit: {verdict}")
    dupes = collections.Counter(re.sub(r"^[0-9a-f]{40}-(\d+-)?", "", Path(n).name) for _, _, n in rows)
    d = [n for n, c in dupes.items() if c > 1]
    if d:
        print(f"\nShipped more than once: {', '.join(d)}")

    if handler and handler.exists():
        text = handler.read_text(errors="replace")
        marks = [(m.start(), m.group(1)) for m in re.finditer(r"^// (\S+\.(?:m?js|cjs|json|wasm))\s*$", text, re.M)]
        if not marks:
            print("\n(no module markers: rebuild with --noMinify to attribute the handler)")
            return
        groups = collections.defaultdict(list)
        for i, (pos, path) in enumerate(marks):
            end = marks[i + 1][0] if i + 1 < len(marks) else len(text)
            m = re.search(r"node_modules/(?:\.pnpm/[^/]+/node_modules/)?((?:@[^/]+/)?[^/]+)", path)
            if m:
                key = m.group(1)
                if key == "next":
                    sub = re.search(r"next/dist/(compiled/[^/]+|server|shared|lib)", path)
                    key = "next/" + (sub.group(1) if sub else "other")
            elif ".next/server/chunks" in path:
                key = "[app server chunks]"
            elif ".next/server/app" in path:
                key = "[app route entries]"
            else:
                key = "[other]"
            groups[key].append(text[pos:end])
        sized = []
        for k, parts in groups.items():
            b = "".join(parts).encode()
            sized.append((gz(b), len(b), k))
        sized.sort(reverse=True)
        print(f"\n## {handler.name} by package (top 30)")
        print(f"{'gzip':>10} {'raw':>10}  package")
        for g, r, k in sized[:30]:
            print(f"{mb(g):>10} {mb(r):>10}  {k}")
        print("\nLarge packages that only run in the browser can be aliased to a server")
        print("stand-in (the nextjs-on-workers skill, 'Size and startup time').")


if __name__ == "__main__":
    main()
