# --- Oracle Cloud ---

variable "oci_tenancy_ocid" {
  description = "OCI tenancy OCID"
  type        = string
}

variable "oci_user_ocid" {
  description = "OCI user OCID"
  type        = string
}

variable "oci_fingerprint" {
  description = "OCI API key fingerprint"
  type        = string
}

variable "oci_private_key_path" {
  description = "Path to OCI API private key"
  type        = string
}

variable "oci_region" {
  description = "OCI region"
  type        = string
  default     = "eu-paris-1"
}

variable "oci_compartment_id" {
  description = "OCI compartment OCID (use tenancy OCID for root compartment)"
  type        = string
}

# --- Cloudflare ---

variable "cloudflare_api_token" {
  description = "Cloudflare API token with DNS and Tunnel permissions"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID for acharlas.dev"
  type        = string
}

variable "domain" {
  description = "Base domain name"
  type        = string
  default     = "acharlas.dev"
}

# --- SSH ---

variable "ssh_public_key" {
  description = "SSH public key for VM access"
  type        = string
}

variable "ssh_allowed_cidr" {
  description = "CIDR block allowed to SSH into the VM"
  type        = string
}

# --- App ---

variable "ghcr_image_backend" {
  description = "Full GHCR image reference for backend (e.g. ghcr.io/acharlas/dockguard-backend:latest)"
  type        = string
}

variable "ghcr_image_frontend" {
  description = "Full GHCR image reference for frontend (e.g. ghcr.io/acharlas/dockguard-frontend:latest)"
  type        = string
}

variable "db_password" {
  description = "PostgreSQL password for the dockguard user"
  type        = string
  sensitive   = true
}
