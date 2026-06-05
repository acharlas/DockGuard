# DockGuard

[![CI/CD](https://github.com/acharlas/DockGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/acharlas/DockGuard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**DockGuard** is a local-first container image analysis dashboard with two lenses: **Security** via [Trivy](https://trivy.dev) and **Build** via [Dive](https://github.com/wagoodman/dive). Paste any Docker image reference, open one scan workspace, and inspect package risk from a single `docker compose up --build`; the Build lens is available only when the backend is explicitly granted Docker socket access in local/dev.

---

## Architecture

```mermaid
graph TD
    Browser["Browser"] -->|Open dashboard| Frontend["Next.js frontend :3000"]
    Frontend -->|Proxy /api/v1| Backend["FastAPI backend :8000"]
    Backend --> DB[(PostgreSQL 16)]
    Backend --> Redis[(Redis 7 cache)]
    Backend --> Trivy["Trivy CLI security scan"]
    Backend --> Dive["Dive CLI build scan (local/dev only)"]
    Prometheus["Prometheus :9090"] -->|Scrape /metrics| Backend
    Grafana["Grafana :3001"] -->|Query metrics| Prometheus
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12), SQLAlchemy async, Alembic |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS, Recharts |
| Scanner | Trivy CLI + optional Dive CLI (Build analysis only when Docker socket access is explicitly enabled) |
| Database | PostgreSQL 16 (vulnerabilities stored as JSON in `raw_report`) |
| Cache | Redis 7 (10-min TTL for digest-pinned image reuse, graceful degradation) |
| Monitoring | Prometheus + Grafana (5 custom metrics) |
| IaC | Terraform — Oracle Cloud Always Free + Cloudflare Tunnel, Terraform Cloud remote state |
| CI/CD | GitHub Actions — lint → test → build (ARM64) → security scan → push GHCR → deploy via SSH |

---

## Quick Start

```bash
git clone https://github.com/acharlas/DockGuard.git
cd DockGuard
export DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"
docker compose up --build
```

| Service | URL |
|---------|-----|
| Dashboard | http://localhost:3000 |
| Grafana | http://localhost:3001 (admin / admin) |
| Prometheus | http://localhost:9090 |

> **Notes:** Browser API calls go through a Next.js route-handler proxy at `/api/v1/*`. Swagger at `http://localhost:8000/docs`. Set `DOCKER_GID="$(stat -c '%g' /var/run/docker.sock)"` before starting for Build analysis (Dive). Grafana at `http://localhost:3001` is baked into the Compose frontend — override via `NEXT_PUBLIC_GRAFANA_URL` for other environments. A one-shot `trivy-cache-init` service fixes cache volume ownership on startup.

### Populate demo data

```bash
./scripts/seed.sh
```

Launches scans for `nginx:latest`, `node:18-alpine`, `python:3.12-slim`, `postgres:16-alpine`, and `node:10` (deliberately vulnerable), then polls until all complete. Grafana dashboards and the scan history page will be populated with realistic data.

---

## Screenshots

> Run `./scripts/seed.sh` first to populate data.

| Dashboard Security | Dashboard Build | History |
|--------------------|-----------------|---------|
| ![Dashboard Security](docs/screenshots/dashboard-security.png) | ![Dashboard Build](docs/screenshots/dashboard-build.png) | ![History](docs/screenshots/history.png) |

---

## DevSecOps Pipeline

```
push → GitHub Actions (ci.yml)
  ├─ lint        ruff (Python) + ESLint (TypeScript)
  ├─ test        pytest --cov-fail-under=70 + npm test
  ├─ build       docker buildx (ARM64) backend + frontend
  ├─ security    trivy image --severity CRITICAL --exit-code 1 → SARIF → GitHub Security tab
  ├─ push        ghcr.io/acharlas/dockguard-{backend,frontend}:latest (main only)
  └─ deploy      SSH via Cloudflare Tunnel → docker compose pull && up -d (main only)

push (terraform/) → GitHub Actions (deploy.yml)
  ├─ plan   (on PR, posted to PR comment)
  └─ apply  (on merge to main)
```

The security gate (`--exit-code 1` on CRITICAL) means broken images never reach the registry. SARIF output makes vulnerabilities visible directly in the GitHub Security tab without any external tooling.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/scans` | Initiate analysis (`202` for new/in-flight work, `200` for digest-cached completed result, may return `429` when the queue is full) |
| `GET` | `/api/v1/scans` | Paginated scan history (filters: `status`, `date_from`, `date_to`) |
| `GET` | `/api/v1/scans/{id}` | Scan detail with Security and Build sections |
| `GET` | `/api/v1/stats` | Totals, severity breakdown, build metrics, top 10 CVEs across completed scans, top 5 images |
| `GET` | `/api/v1/health` | Health check (DB, Redis, Trivy) |
| `GET` | `/metrics` | Prometheus metrics |

Direct backend docs at `http://localhost:8000/docs` and `http://localhost:8000/redoc`. The sample Terraform deployment restricts dashboard access to your SSH CIDR and disables the Build lens (`ENABLE_BUILD_ANALYSIS=false`). On restart, `pending`/`running` scans reconcile to `failed` — no durable job faking.

### Async scan flow

```
POST /scans
  ├─ existing pending/running scan returned (dedup)
  ├─ 202 → background task (pending → running → Trivy → Dive → completed/failed/cancelled)
  └─ 200 → digest cache hit (Redis, 10-min TTL)
```

---

## Custom Prometheus Metrics

| Metric | Type | Labels |
|--------|------|--------|
| `dockguard_scans_total` | Counter | `status` |
| `dockguard_scan_duration_seconds` | Histogram | — |
| `dockguard_vulnerabilities_found` | Counter | `severity` |
| `dockguard_build_analyses_total` | Counter | `status` |
| `dockguard_active_scans` | Gauge | — |

---

## Development

```bash
# Dev stack with hot reload
docker compose up

# Backend tests + coverage
docker compose exec backend pytest --cov --cov-report=term

# Frontend tests
docker compose exec frontend npm test

# Lint
docker compose exec backend ruff check app/ tests/
docker compose exec frontend npm run lint

# Terraform validate
cd terraform && terraform init -backend=false && terraform fmt -check && terraform validate
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No `Vulnerability` table | Trivy JSON stored in `raw_report`, queried via PostgreSQL JSON operators. Denormalise only when slowness is proven, not assumed. |
| One scan row stores both lenses | Security and Build are part of the same user action. A second table would be ceremony for this MVP. |
| `asyncio.Semaphore(3)` not a queue service | One line limits concurrency to 3 concurrent scan processes — zero extra infrastructure for a single-worker backend. |
| Redis added at Day 5 | Not Day 1. Added when the use case was real (reuse digest-pinned scans safely), not speculatively. |
| Flat Terraform (split by concern) | Files split by responsibility (provider, network, compute, cloudflare) without modules. Modules add abstraction cost for a single-VM deployment. |
| `templatefile()` for cloud-init | Separates HCL interpolation from YAML/bash, avoiding nested heredoc parsing issues and making the bootstrap script testable independently. |
| Build lens gated by config | `ENABLE_BUILD_ANALYSIS` keeps Docker-socket access out of demo deployments while preserving the full Build lens in local/dev Compose. |

## Deployment

Production runs on **Oracle Cloud Always Free** (ARM VM, 4 OCPU, 24GB RAM) with **Cloudflare Tunnel** for zero-trust ingress. No public HTTP ports on the VM.

| URL | Service |
|-----|---------|
| https://dockguard.acharlas.dev | Dashboard |
| https://grafana.acharlas.dev | Grafana |

### Deploy from scratch

1. Configure Terraform Cloud workspace with OCI credentials
2. Configure Cloudflare API token and zone
3. Copy `terraform/terraform.tfvars.example` to `terraform/terraform.tfvars` and fill in values
4. Push to `main` — GitHub Actions handles:
   - Image build (ARM64) → security scan → push to GHCR
   - Terraform apply (if `terraform/` changed)
   - App deploy via SSH (after images pushed)

### Notes

- SSH access restricted to `ssh_allowed_cidr` in Terraform vars
- The Build lens is disabled in production (`ENABLE_BUILD_ANALYSIS=false`). Use local/dev Compose for Docker-socket-backed Build analysis
- Grafana has anonymous read-only access enabled

---

## License

[MIT](LICENSE)
