#!/bin/bash
set -e

cd "$(dirname "$0")/../terraform"

if [ -z "$OCI_NAMESPACE" ] || [ -z "$OCI_REGION" ] || [ -z "$OCI_S3_ACCESS_KEY" ] || [ -z "$OCI_S3_SECRET_KEY" ]; then
  echo "Error: Set OCI_NAMESPACE, OCI_REGION, OCI_S3_ACCESS_KEY, OCI_S3_SECRET_KEY"
  exit 1
fi

cat > /tmp/backend.hcl <<EOF
endpoints = { s3 = "https://${OCI_NAMESPACE}.compat.objectstorage.${OCI_REGION}.oraclecloud.com" }
access_key = "${OCI_S3_ACCESS_KEY}"
secret_key = "${OCI_S3_SECRET_KEY}"
skip_s3_checksum = true
use_path_style = true
EOF

terraform init -reconfigure -backend-config=/tmp/backend.hcl
rm -f /tmp/backend.hcl

echo "Terraform initialized with OCI S3 backend."
echo "You can now run: terraform plan / terraform apply"
