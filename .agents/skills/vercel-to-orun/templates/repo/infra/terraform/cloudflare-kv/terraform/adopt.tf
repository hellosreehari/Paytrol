# --- Self-healing adoption ---
# When state does not track the namespace but Cloudflare has one under this
# title, look it up at plan time with the job's brokered credentials and import
# it instead of colliding (error 10014). Fresh namespaces resolve to id = ""
# and create normally; a resource already in state skips the lookup.

data "external" "adopt_idempotency_namespace" {
  program = ["bash", "-c", <<-EOT
    set -euo pipefail
    title="$(jq -r .title)"
    state_file="$(mktemp)"
    trap 'rm -f "$state_file"' EXIT
    code="$(curl -s -o "$state_file" -w '%%{http_code}' \
      -u "$TF_HTTP_USERNAME:$TF_HTTP_PASSWORD" "$TF_HTTP_ADDRESS" || echo 000)"
    if [ "$code" = "200" ] && jq -e \
        '[.resources[]? | select(.type == "cloudflare_workers_kv_namespace" and .name == "app_kv")] | length > 0' \
        "$state_file" >/dev/null 2>&1; then
      jq -n '{id: ""}'
      exit 0
    fi
    resp="$(curl -fsS --retry 3 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/storage/kv/namespaces?per_page=100")"
    printf '%s' "$resp" | jq -c --arg t "$title" \
      '{id: ([.result[] | select(.title == $t) | .id] | first // "")}'
  EOT
  ]
  query = {
    title = local.idempotency_namespace_title
  }
}

import {
  for_each = toset(compact([data.external.adopt_idempotency_namespace.result.id]))
  to       = cloudflare_workers_kv_namespace.app_kv
  id       = "${var.cloudflare_account_id}/${each.value}"
}
