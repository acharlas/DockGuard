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
  sensitive   = true
}

variable "oci_private_key" {
  description = "OCI API private key content (PEM format)"
  type        = string
  sensitive   = true
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

variable "oci_availability_domain" {
  description = "Availability domain name (e.g. kIdk:EU-PARIS-1-AD-1). Find via: oci iam availability-domain list"
  type        = string
}

variable "oci_instance_image_ocid" {
  description = "OCI image OCID for Ubuntu Server 22.04/24.04 LTS (x86_64). Find at https://docs.oracle.com/iaas/images/"
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
  description = "CIDR block allowed to SSH into the VM. Default 0.0.0.0/0 enables GitHub Actions CI runners (dynamic IPs). Restrict for local-only access if desired."
  type        = string
  default     = "0.0.0.0/0"
}

variable "cloudflare_ssh_service_token_id" {
  description = "Cloudflare Access Service Token ID for CI SSH (create manually in dashboard)"
  type        = string
}

# --- Tags ---

variable "project_tags" {
  description = "Freeform tags applied to all resources"
  type        = map(string)
  default = {
    project     = "dockguard"
    environment = "production"
    managed_by  = "terraform"
  }
}
