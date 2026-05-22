#!/bin/bash
set -e

cd "$(dirname "$0")/../terraform"

echo "Bootstrapping Terraform state bucket (one-time)..."
terraform init -backend=false
terraform plan -target=oci_objectstorage_bucket.tf_state -out=bootstrap.plan
terraform apply bootstrap.plan
rm -f bootstrap.plan

echo "Bucket created. Now run:"
echo "  terraform init -reconfigure -backend-config=..."
echo "to switch to remote state."
