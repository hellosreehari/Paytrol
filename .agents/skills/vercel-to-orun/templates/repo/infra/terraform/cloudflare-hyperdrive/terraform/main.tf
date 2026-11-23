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

# --- Supabase origin (from orun secrets) ---
#
# The supabase component publishes SUPABASE_PROJECT_REF and
# SUPABASE_DB_PASSWORD; this component reads them as TF_VAR_supabase_project_ref
# and TF_VAR_supabase_db_password. Host, port, db and user derive from the ref.

variable "supabase_project_ref" {
  type        = string
  description = "Supabase project reference (from SUPABASE_PROJECT_REF secret)"
}

variable "supabase_db_password" {
  type        = string
  sensitive   = true
  description = "Supabase database password (from SUPABASE_DB_PASSWORD secret)"
}

locals {
  database_host = "db.${var.supabase_project_ref}.supabase.co"
  database_port = 5432
  database_name = "postgres"
  database_user = "postgres"

  hyperdrive_name = "${var.namespacePrefix}${var.repo}-${var.environment}"
}

# --- Create Hyperdrive resource ---

resource "cloudflare_hyperdrive_config" "postgres" {
  account_id = var.cloudflare_account_id
  name       = local.hyperdrive_name

  origin = {
    scheme   = "postgres"
    host     = local.database_host
    port     = local.database_port
    database = local.database_name
    user     = local.database_user
    password = var.supabase_db_password
  }

  caching = {
    disabled = false
  }
}

# --- Wiring manifest (via orun secrets) ---
#
# The consumable outputs of this component are published by the composition's
# wire-secrets step as the WIRING_CLOUDFLARE_HYPERDRIVE secret on the
# project/{{env}} rung; worker deploys read it back as
# WIRING_CLOUDFLARE_HYPERDRIVE_<ENV> secretEnv and render committed
# @@wiring(...)@@ tokens from it.

output "wiring" {
  description = "Wiring document for downstream deploy-time binding resolution (pushed to orun secrets)"
  value = jsonencode({
    hyperdrive_id   = cloudflare_hyperdrive_config.postgres.id
    hyperdrive_name = cloudflare_hyperdrive_config.postgres.name
  })
}

# --- Outputs (non-secret) ---

output "hyperdrive_id" {
  description = "Cloudflare Hyperdrive config ID"
  value       = cloudflare_hyperdrive_config.postgres.id
}

output "hyperdrive_name" {
  description = "Cloudflare Hyperdrive config name"
  value       = cloudflare_hyperdrive_config.postgres.name
}

output "hyperdrive_connection_string" {
  description = "Hyperdrive-formatted connection string for Workers (to be used in bindings)"
  # Note: actual connection string is built at binding time; this is the resource ID
  value = "hyperdrive://${cloudflare_hyperdrive_config.postgres.id}"
}
