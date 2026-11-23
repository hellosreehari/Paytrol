#!/usr/bin/env bash
# Check a deployed (or local) app route by route.
#
#   route-matrix.sh <base-url> <routes-file>
#
# routes-file: one route per line, "<path> <expected-status> [text-to-find]".
# Lines starting with # are skipped. Expected status may be a list (200|307).
# Every request has a timeout (a hung request is a finding, not a wait), and
# the page body is matched with a here-string, never a pipe, so a large page
# cannot fail the check with SIGPIPE under pipefail.
#
#   /                 307
#   /home             200   Welcome
#   /blog/feed.xml    200
#   /login            307
set -uo pipefail
base="${1:?base url}"; routes="${2:?routes file}"
fail=0; total=0
while read -r path want text; do
  [ -z "${path:-}" ] && continue
  case "$path" in \#*) continue ;; esac
  total=$((total + 1))
  body_file=$(mktemp)
  meta=$(curl -s -o "$body_file" -w "%{http_code} %{size_download} %{time_total} %{redirect_url}" --max-time 40 "$base$path")
  code=${meta%% *}
  ok=1
  [[ "|$want|" == *"|$code|"* ]] || ok=0
  if [ $ok = 1 ] && [ -n "${text:-}" ]; then
    body=$(cat "$body_file")
    grep -qi -- "$text" <<< "$body" || ok=0
  fi
  rm -f "$body_file"
  if [ $ok = 1 ]; then mark="ok  "; else mark="FAIL"; fail=$((fail + 1)); fi
  printf '%s %-45s %s\n' "$mark" "$path" "${meta:0:140}"
done < "$routes"
echo "$((total - fail))/$total routes as expected on $base"
[ $fail = 0 ]
