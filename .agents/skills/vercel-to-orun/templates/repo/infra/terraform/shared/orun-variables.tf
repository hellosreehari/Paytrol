# The standard Orun parameters every Terraform root declares. stamp.py writes
# this file into each root as terraform/orun-variables.tf.

variable "cloudflare_account_id" {
  type        = string
  sensitive   = true
  default     = ""
  description = "Cloudflare account ID (from CLOUDFLARE_ACCOUNT_ID env var)"
}

variable "orgName" {
  type    = string
  default = "__OWNER__"
}

variable "owner" {
  type    = string
  default = "__OWNER__"
}

variable "repo" {
  type    = string
  default = "__PROJECT__"
}

variable "namespace" {
  type    = string
  default = "__OWNER__"
}

variable "namespacePrefix" {
  type    = string
  default = ""
}

variable "lane" {
  type    = string
  default = "verify"
}

variable "environment" {
  type    = string
  default = "stage"
}

variable "component" {
  type    = string
  default = "__ROOT__"
}

variable "stackName" {
  type    = string
  default = "__ROOT__"
}

variable "terraformDir" {
  type    = string
  default = "terraform"
}

variable "terraformVersion" {
  type    = string
  default = "1.15.3"
}
