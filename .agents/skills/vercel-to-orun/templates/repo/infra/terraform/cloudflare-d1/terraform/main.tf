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

# --- The app's database ---
#
# One D1 database per environment. D1 has no cross-database query or foreign
# key, so keep the app's tables together in one.

locals {
  # Prefixed with var.repo: D1 names are unique per account. Workers resolve the
  # database by id through the wiring secret, so the name is free to change.
  database_name = "${var.namespacePrefix}${var.repo}-${var.environment}"
}

resource "cloudflare_d1_database" "platform" {
  account_id = var.cloudflare_account_id
  name       = local.database_name
}

# --- Wiring manifest (via orun secrets) ---
#
# The consumable outputs are published by the composition's wire-secrets step
# as the WIRING_CLOUDFLARE_D1 secret on the project/{{env}} rung; worker
# deploys read it back as WIRING_CLOUDFLARE_D1_<ENV> secretEnv and render the
# committed @@wiring(...)@@ tokens from it. The `db-migrate` component
# reads the same document to find the database it migrates.

output "wiring" {
  description = "Wiring document for downstream deploy-time binding resolution (pushed to orun secrets)"
  value = jsonencode({
    d1_database_id   = cloudflare_d1_database.platform.id
    d1_database_name = cloudflare_d1_database.platform.name
  })
}

# --- Outputs (non-secret) ---

output "d1_database_id" {
  description = "Cloudflare D1 database ID (the Workers binding's database_id)"
  value       = cloudflare_d1_database.platform.id
}

output "d1_database_name" {
  description = "Cloudflare D1 database name (human-readable identifier)"
  value       = cloudflare_d1_database.platform.name
}
