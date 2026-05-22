#!/bin/bash
set -e

cd "$(dirname "$0")/../terraform"

# Temporarily disable S3 backend for local-only bootstrap
cp provider.tf provider.tf.bak
sed -i '/backend "s3" {/,/}/c\  # backend disabled for bootstrap' provider.tf

echo "Bootstrapping Terraform state bucket (one-time)..."
terraform init -backend=false
terraform plan -target=oci_objectstorage_bucket.tf_state -out=bootstrap.plan
terraform apply bootstrap.plan
rm -f bootstrap.plan

# Restore original provider.tf with S3 backend
mv provider.tf.bak provider.tf

echo "Bucket created. Now run:"
echo "  ./scripts/tf-init.sh"
echo "to switch to remote state."
