# DockGuard Production Refactor: Oracle Cloud + Cloudflare

**Date:** 2026-03-16
**Status:** Draft
**Scope:** Full infrastructure migration (AWS → Oracle Cloud Always Free), Cloudflare Tunnel integration, GitHub Actions CD, backend hardening for 50 concurrent users.

---

## Context

DockGuard is deployed on AWS (EC2 + RDS) via manually applied Terraform. The infrastructure needs to move to Oracle Cloud Always Free tier with Cloudflare Tunnel for ingress, and the CI/CD pipeline needs to deploy infrastructure automatically via GitHub Actions. The backend also needs production hardening.

AWS resources will be manually torn down. Terraform starts fresh for Oracle (no state migration).

## Architecture Overview

```
User → Cloudflare Edge (SSL/DDoS) → Cloudflare Tunnel → Oracle ARM VM
                                                            |
                                              Docker Compose stack:
                                              - Next.js frontend (:3000)
                                              - FastAPI backend (:8000)
                                              - PostgreSQL 16 (:5432)
                                              - Redis 7 (:6379)
                                              - Prometheus (:9090)
                                              - Grafana (:3001)
                                              - cloudflared (tunnel daemon)
```

**DNS:**
- `dockguard.acharlas.dev` → frontend (:3000)
- `grafana.acharlas.dev` → Grafana (:3001)

**No direct API access** — frontend proxies all backend calls.

## Sub-Project Ordering

1. **Sub-project 1 (Backend hardening)** — no infra dependencies, can proceed first.
2. **Sub-project 2 (Terraform rewrite)** — depends on CI building ARM images (see CI changes in this sub-project).
3. **Sub-project 3 (GitHub Actions CD)** — depends on sub-project 2 (needs Terraform files to plan/apply).
4. **Sub-project 4 (Integration)** — depends on all of the above.

## Sub-Project 1: Backend Hardening

### CORS Lockdown
**File:** `backend/app/main.py`

Restrict CORS `allow_methods` and `allow_headers` from wildcards to explicit values (the `allow_origins` setting is already environment-driven and stays as-is):
- `allow_methods`: `["GET", "POST"]`
- `allow_headers`: `["Content-Type"]`

### DB Connection Pool
**File:** `backend/app/db/session.py`

Add explicit pool configuration to `create_async_engine`:
```python
pool_size=10,
max_overflow=20,
pool_pre_ping=True,
pool_recycle=3600,
```

Rationale: 50 concurrent users need more than the default 5 connections. 10 + 20 overflow = 30 max, well within PostgreSQL's 100 connection limit.

### Structured Logging
**File:** `backend/app/main.py` (lifespan setup)

Use Python stdlib `logging.config.dictConfig` with JSON formatter (no extra dependency). Configure:
- JSON-structured output for all loggers
- Uvicorn access logs also JSON-formatted
- Scan ID correlation in scanner/subprocess logs
- Log stderr truncation warnings in `subprocesses.py`

### Graceful Shutdown
**File:** `backend/app/main.py` (lifespan shutdown)

Mechanism: module-level `asyncio.Event` named `_shutdown_event`. The `POST /scans` endpoint checks this event and returns 503 if set.

On shutdown:
1. Set `_shutdown_event` (stops accepting new scans)
2. Wait up to 10s for active scans to finish (poll `_background_tasks`)
3. Kill remaining subprocesses
4. Dispose DB engine

### Health Check Expansion
**File:** `backend/app/api/routes/health.py`

Check all critical dependencies:
- Database: `SELECT 1`
- Redis: ping (report "unavailable" if not configured, not "unhealthy")
- Trivy CLI: `trivy --version`

Return per-component status. HTTP 200 if DB + Trivy healthy, 503 otherwise. Redis "unavailable" does not degrade overall status (cache is optional).

### Database Indexes
**New Alembic migration**

Existing index: `idx_image_status` on `(image_name, scan_status)` — keep as-is.

Add new indexes:
- `idx_scan_status` on `(scan_status)` — used by stats queries filtering by status alone
- `idx_status_created` on `(scan_status, created_at DESC)` — covers list endpoint pagination and stats recent-scan query

Note: standalone `idx_created_at` is NOT needed — the composite `idx_status_created` covers the created_at ordering when filtered by status, and unfiltered ordering is rare.

### Lint/Format
- Run `ruff check . --fix` and `ruff format .`
- Run `npm run lint -- --fix`
- Fix any remaining issues manually

### Explicitly NOT included (YAGNI)
- No authentication/API keys — personal tool, not public SaaS
- No per-IP rate limiting — Cloudflare handles L7 DDoS
- No stats endpoint caching — 100 scan aggregation is fast enough

## Sub-Project 2: Terraform Rewrite (Oracle Cloud + Cloudflare)

### ARM Architecture: CI Changes Required

The Oracle VM is ARM (aarch64). This impacts:

**Docker image builds (ci.yml update):**
- Add `--platform linux/arm64` to all `docker buildx build` commands
- Or use multi-arch build (`linux/amd64,linux/arm64`) if local dev on x86 is needed
- Recommendation: build `linux/arm64` only for the GHCR push (CI runners support cross-platform buildx). Keep local dev on native arch.

**Cloud-init:**
- Docker CE: install via `dnf`/`apt` package manager (handles arch automatically)
- Docker Compose: install as Docker plugin via package manager (not standalone binary download)
- cloudflared: use the `arm64` .deb/.rpm package from Cloudflare's repo

### Oracle Cloud Resources (Always Free)

**Networking:**
- VCN (10.0.0.0/16) with 1 public subnet (10.0.1.0/24)
- Internet Gateway for egress
- Security list: all egress allowed, inbound SSH from `ssh_allowed_cidr` only, no HTTP inbound (Cloudflare Tunnel handles ingress)

**Compute:**
- VM.Standard.A1.Flex (4 OCPU, 24GB RAM, ARM/aarch64)
- Boot volume: 47GB (default free)
- Oracle Linux 9 (ARM) or Ubuntu 22.04 Minimal (ARM) — both free, both support Docker
- Cloud-init script bootstraps the full stack

**Cloud-init steps:**
1. Install Docker CE + Docker Compose plugin via package manager
2. Install cloudflared ARM package from Cloudflare apt/yum repo
3. Configure cloudflared tunnel using token: `cloudflared service install <TUNNEL_TOKEN>`
4. Enable cloudflared systemd service
5. Create `/opt/dockguard/docker-compose.yml` from Terraform template
6. Pull images from GHCR
7. Start stack: `docker compose up -d`

### Cloudflare Resources

**Managed by Terraform (Cloudflare provider):**
- Tunnel: `dockguard-tunnel` — Terraform creates the tunnel and outputs a token
- Tunnel config: routes `dockguard.acharlas.dev` → `http://localhost:3000`, `grafana.acharlas.dev` → `http://localhost:3001`
- CNAME records: `dockguard` and `grafana` pointing to tunnel UUID

**Tunnel token delivery:** Terraform creates the tunnel via `cloudflare_tunnel` resource, retrieves the token, and injects it into cloud-init via `templatefile()`. No interactive login needed.

**Grafana access:** Configure Grafana for anonymous read-only access (`GF_AUTH_ANONYMOUS_ENABLED=true`, `GF_AUTH_ANONYMOUS_ORG_ROLE=Viewer`). This is appropriate for a portfolio demo — visitors can view dashboards but not edit.

### Docker Compose Production Config

Production compose config lives in the cloud-init template (not a separate file in the repo). It differs from dev:
- No Docker socket mount (build analysis disabled)
- `ENABLE_BUILD_ANALYSIS=false`
- `CORS_ORIGINS=["https://dockguard.acharlas.dev"]`
- PostgreSQL: `shared_buffers=256MB`, `max_connections=100`
- All services: `restart: unless-stopped`
- No exposed ports except internal Docker network (Cloudflare Tunnel reaches services via localhost)

### Terraform State
Remote backend using Terraform Cloud free tier (simplest option, no Oracle Object Storage setup needed). 1 workspace, unlimited runs.

### Variables
```hcl
# Oracle Cloud
variable "oci_tenancy_ocid" {}
variable "oci_user_ocid" {}
variable "oci_fingerprint" {}
variable "oci_private_key_path" {}
variable "oci_region" { default = "eu-paris-1" }

# Cloudflare
variable "cloudflare_api_token" { sensitive = true }
variable "cloudflare_zone_id" {}
variable "domain" { default = "acharlas.dev" }

# SSH
variable "ssh_public_key" {}
variable "ssh_allowed_cidr" {}

# App
variable "ghcr_image_backend" {}
variable "ghcr_image_frontend" {}
variable "db_password" { sensitive = true }
```

### Deleted Files
- All AWS-specific Terraform (provider.tf references AWS, main.tf has VPC/EC2/RDS/SGs)
- `user_data.sh.tftpl` replaced with Oracle cloud-init equivalent

## Sub-Project 3: GitHub Actions CD

### New Workflow: `deploy.yml`

**On PR to main (when `terraform/` files change):**
1. `terraform init` (remote backend via Terraform Cloud)
2. `terraform plan`
3. Post plan diff as PR comment

**On push to main (after merge):**

Two paths depending on what changed:

**Path A — Terraform files changed:**
1. `terraform init`
2. `terraform apply -auto-approve`

**Path B — Application code changed (images pushed to GHCR):**
1. SSH into VM via the VM's public IP (SSH is open from GitHub Actions runner IP range, or use a fixed `ssh_allowed_cidr` that includes a self-hosted runner)
2. Run: `docker compose pull && docker compose up -d`

**Chosen SSH approach for Path B:** Add the GitHub Actions runner IP to `ssh_allowed_cidr` is unreliable (dynamic IPs). Instead: **use OCI CLI `instance-action` to run a custom cloud-init script** that does `docker compose pull && docker compose up -d`. This avoids SSH entirely — the GitHub Action authenticates via OCI API key (already available as secrets) and triggers a remote-exec. Alternative: a simple webhook endpoint on the VM that the CI calls after pushing images.

**Simplest approach (recommended for portfolio):** Store a deploy script on the VM at `/opt/dockguard/deploy.sh` that does `cd /opt/dockguard && docker compose pull && docker compose up -d`. The GitHub Action SSHs in using `cloudflared access ssh` with a service token. This requires:
- A Cloudflare Access application for SSH (free tier)
- A short-lived service token for CI
- `cloudflared` installed in the GitHub Actions runner (one `apt install` step)

**Both paths can trigger on the same merge.**

### Pin Terraform Version
Use `hashicorp/setup-terraform@v3` with `terraform_version: "1.7.x"` to avoid drift between CI runs.

### GitHub Secrets Required
- `OCI_TENANCY_OCID`, `OCI_USER_OCID`, `OCI_FINGERPRINT`, `OCI_PRIVATE_KEY`
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_SSH_SERVICE_TOKEN` (for deploy path B via cloudflared access)
- `TF_API_TOKEN` (Terraform Cloud)

### Existing CI Unchanged
The current `ci.yml` (lint → test → build → security scan → push GHCR) stays as-is, except for adding `--platform linux/arm64` to image builds. `deploy.yml` is a separate workflow that triggers after CI completes.

## Sub-Project 4: Final Integration

### DNS Setup (manual, one-time)
- Ensure `acharlas.dev` nameservers point to Cloudflare (if not already)
- Terraform creates CNAME records automatically

### Smoke Test Checklist
- [ ] Health endpoint returns healthy (DB + Redis + Trivy)
- [ ] Frontend loads at `https://dockguard.acharlas.dev`
- [ ] Grafana loads at `https://grafana.acharlas.dev` (anonymous read-only)
- [ ] Trigger a scan, verify it completes end-to-end
- [ ] Prometheus scraping works, Grafana dashboard shows data

### Documentation Updates
- CLAUDE.md: update architecture, deploy commands, env vars
- README.md: update architecture diagram, deploy instructions

### Database Backups
Out of scope for MVP. PostgreSQL data lives in a Docker named volume on the VM. Acceptable for a portfolio project with no real user data.

## Concurrency Analysis (50 Users)

| Component | Capacity | Bottleneck? |
|-----------|----------|-------------|
| ARM VM (4 OCPU, 24GB) | Overkill for this load | No |
| DB pool (10 + 20 overflow) | 30 connections max | No (50 users don't hold 30 connections simultaneously) |
| PostgreSQL (max_connections=100) | 100 connections | No |
| Scan semaphore (3) | 3 concurrent Trivy scans | By design. Users get 202 immediately, scans queue. |
| Pending scan queue (25) | 25 queued scans | Fine. 429 if exceeded. |
| Next.js standalone | Single-threaded, event-loop | Handles 50 page loads fine |
| Redis | Trivial at this scale | No |
| Cloudflare Tunnel | Handles thousands of req/s | No |

**No architecture changes needed for 50 concurrent users.** The pool size increase (5 → 10) in sub-project 1 is the only tuning required.
