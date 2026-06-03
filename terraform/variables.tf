variable "oci_tenancy_ocid" { type = string }
variable "oci_user_ocid" { type = string }

variable "oci_fingerprint" {
  type      = string
  sensitive = true
}

variable "oci_private_key" {
  type      = string
  sensitive = true
}

variable "oci_region" {
  type    = string
  default = "eu-paris-1"
}

variable "oci_compartment_id" { type = string }
variable "oci_availability_domain" { type = string }
variable "oci_instance_image_ocid" { type = string }

variable "cloudflare_api_token" {
  type      = string
  sensitive = true
}

variable "cloudflare_account_id" { type = string }
variable "cloudflare_zone_id" { type = string }

variable "domain" {
  type    = string
  default = "acharlas.dev"
}

variable "ssh_public_key" { type = string }

variable "ssh_allowed_cidr" {
  type    = string
  default = "0.0.0.0/0"
}
