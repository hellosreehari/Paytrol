# --- Self-healing adoption ---
# When state does not track the database but Cloudflare has one under this
# name, look it up at plan time with the job's brokered credentials and import
# it instead of colliding. Fresh databases resolve to id = "" and create
# normally; a resource already in state skips the lookup.

data "external" "adopt_platform_database" {
  program = ["bash", "-c", <<-EOT
    set -euo pipefail
    name="$(jq -r .name)"
    state_file="$(mktemp)"
    trap 'rm -f "$state_file"' EXIT
    code="$(curl -s -o "$state_file" -w '%%{http_code}' \
      -u "$TF_HTTP_USERNAME:$TF_HTTP_PASSWORD" "$TF_HTTP_ADDRESS" || echo 000)"
    if [ "$code" = "200" ] && jq -e \
        '[.resources[]? | select(.type == "cloudflare_d1_database" and .name == "platform")] | length > 0' \
        "$state_file" >/dev/null 2>&1; then
      jq -n '{id: ""}'
      exit 0
    fi
    resp="$(curl -fsS --retry 3 -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
      "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database?per_page=100")"
    printf '%s' "$resp" | jq -c --arg n "$name" \
      '{id: ([.result[] | select(.name == $n) | .uuid] | first // "")}'
  EOT
  ]
  query = {
    name = local.database_name
  }
}

import {
  for_each = toset(compact([data.external.adopt_platform_database.result.id]))
  to       = cloudflare_d1_database.platform
  id       = "${var.cloudflare_account_id}/${each.value}"
}
