terraform {
  required_version = ">= 1.7"

  backend "s3" {
    bucket                      = "dockguard-tfstate"
    key                         = "prod/terraform.tfstate"
    region                      = "eu-paris-1"
    endpoints = {
      s3 = "https://<namespace>.compat.objectstorage.eu-paris-1.oraclecloud.com"
    }
    skip_region_validation      = true
    skip_credentials_validation = true
    skip_metadata_api_check     = true
    skip_requesting_account_id  = true
    use_path_style              = true
  }

  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
    }
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 4.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
  }
}

provider "oci" {
  tenancy_ocid = var.oci_tenancy_ocid
  user_ocid    = var.oci_user_ocid
  fingerprint  = var.oci_fingerprint
  private_key  = var.oci_private_key
  region       = var.oci_region
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
}
