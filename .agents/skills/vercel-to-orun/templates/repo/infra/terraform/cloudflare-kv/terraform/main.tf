terraform {
  required_version = ">= 1.15.0"

  # State lives on the platform: the runner exports TF_HTTP_* per job, so
  # this block stays empty — no S3 bucket, no AWS role, no workspaces.
  backend "http" {}

  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.30"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.3"
    }
  }
}

# --- Providers ---

# Authenticates via the CLOUDFLARE_API_TOKEN env var (provider-native): the
# token is an orun-managed secret resolved into the job env at run time, so it
# never transits Terraform variables.
provider "cloudflare" {}

# --- Variables ---
# The standard Orun parameters are in orun-variables.tf (stamp.py writes it).

# --- KV namespace for api-edge idempotency replay store ---
#
# Backs the app's key-value needs (session, cache, counters). Keys are
# scoped by the app and entries TTL'd via the
# Worker (`expirationTtl`); no Terraform-side TTL knob exists
# for KV namespaces themselves — TTL is per-PUT, owned by the Worker.

locals {
  # Prefixed with var.repo: KV titles are unique per account (error 10014
  # otherwise). Workers resolve the namespace by id through the wiring secret,
  # so the title is free to change.
  idempotency_namespace_title = "${var.namespacePrefix}${var.repo}-app-kv-${var.environment}"
}

resource "cloudflare_workers_kv_namespace" "app_kv" {
  account_id = var.cloudflare_account_id
  title      = local.idempotency_namespace_title
}

# --- Wiring manifest (via orun secrets) ---
# The consumable outputs are published by the composition's wire-secrets step
# as the WIRING_CLOUDFLARE_KV secret on the project/{{env}} rung; worker
# deploys read it back as WIRING_CLOUDFLARE_KV_<ENV> secretEnv.

output "wiring" {
  description = "Wiring document for downstream deploy-time binding resolution (pushed to orun secrets)"
  value = jsonencode({
    app_kv_id    = cloudflare_workers_kv_namespace.app_kv.id
    app_kv_title = cloudflare_workers_kv_namespace.app_kv.title
  })
}

# --- Outputs (non-secret) ---

output "app_kv_id" {
  description = "Cloudflare Workers KV namespace ID for api-edge idempotency replay store"
  value       = cloudflare_workers_kv_namespace.app_kv.id
}

output "app_kv_title" {
  description = "Cloudflare Workers KV namespace title (human-readable identifier)"
  value       = cloudflare_workers_kv_namespace.app_kv.title
}
