#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
TMP_DIR=$(mktemp -d)

cd "$TMP_DIR"

cat > main.tf <<'EOF'
terraform {
  required_providers {
    oci = {
      source  = "oracle/oci"
      version = "~> 6.0"
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

data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.oci_compartment_id
}

resource "oci_objectstorage_bucket" "tf_state" {
  compartment_id = var.oci_compartment_id
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "dockguard-tfstate"
  storage_tier   = "Standard"
  access_type    = "NoPublicAccess"
}

variable "oci_tenancy_ocid" {
  type = string
}

variable "oci_user_ocid" {
  type = string
}

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

variable "oci_compartment_id" {
  type = string
}
EOF

echo "Bootstrapping Terraform state bucket (one-time)..."
terraform init
terraform plan -out=bootstrap.plan
terraform apply bootstrap.plan
rm -f bootstrap.plan

cd "$SCRIPT_DIR"
rm -rf "$TMP_DIR"

echo "Bucket created. Now run:"
echo "  ./scripts/tf-init.sh"
echo "to switch to remote state."
