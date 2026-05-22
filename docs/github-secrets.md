# GitHub Secrets

## Repository Secrets

| Secret | Description |
|--------|-------------|
| OCI_TENANCY_OCID | OCI tenancy OCID |
| OCI_USER_OCID | OCI user OCID |
| OCI_FINGERPRINT | OCI API key fingerprint |
| OCI_PRIVATE_KEY | Full PEM content of OCI API key |
| OCI_REGION | e.g. eu-paris-1 |
| OCI_COMPARTMENT_ID | OCI compartment OCID |
| OCI_AVAILABILITY_DOMAIN | e.g. kIdk:EU-PARIS-1-AD-1 |
| OCI_INSTANCE_IMAGE_OCID | Ubuntu Server x86_64 image OCID |
| OCI_S3_ACCESS_KEY | OCI Customer Secret Key access key |
| OCI_S3_SECRET_KEY | OCI Customer Secret Key secret |
| CLOUDFLARE_API_TOKEN | Zone:Edit + Tunnel:Edit permissions |
| CLOUDFLARE_ACCOUNT_ID | Cloudflare account ID |
| CLOUDFLARE_ZONE_ID | Cloudflare zone ID |
| SSH_PUBLIC_KEY | Public SSH key for VM access |
| SSH_ALLOWED_CIDR | CIDR allowed for SSH (e.g. 203.0.113.1/32) |

## Repository Variables

| Variable | Description |
|----------|-------------|
| OCI_NAMESPACE | OCI Object Storage namespace |

## Environment Secrets (production)

| Secret | Description |
|--------|-------------|
| DB_PASSWORD | PostgreSQL password |
| GRAFANA_ADMIN_PASSWORD | Grafana admin password |
| VM_SSH_PRIVATE_KEY | Private SSH key (matches SSH_PUBLIC_KEY) |
| CF_ACCESS_CLIENT_ID | Cloudflare Access Service Auth client ID |
| CF_ACCESS_CLIENT_SECRET | Cloudflare Access Service Auth secret |
