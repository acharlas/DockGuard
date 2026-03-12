# DockGuard

[![CI/CD](https://github.com/acharlas/DockGuard/actions/workflows/ci.yml/badge.svg)](https://github.com/acharlas/DockGuard/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

**DockGuard** is a full-stack container image analysis dashboard with two lenses: **Security** via [Trivy](https://trivy.dev) and **Build** via [Dive](https://github.com/wagoodman/dive). Paste any Docker image reference, open one scan workspace, and inspect both package risk and layer efficiency from a single `docker compose up --build`.

---

## Architecture

```mermaid
graph TD
    Browser["Browser\n:3000"] -->|HTTP| Frontend["Next.js 14\nFrontend"]
    Frontend -->|route handler proxy| Backend["FastAPI\nBackend :8000"]
    Backend -->|asyncpg| DB[(PostgreSQL 16)]
    Backend -->|subprocess| Trivy["Trivy CLI\nSecurity analysis"]
    Backend -->|subprocess + docker.sock| Dive["Dive CLI\nBuild analysis"]
    Backend -->|SETEX 10min| Redis[(Redis 7)]
    Backend -->|/metrics| Prometheus["Prometheus\n:9090"]
    Prometheus --> Grafana["Grafana\n:3001"]

    subgraph CI/CD ["GitHub Actions CI/CD"]
        Lint["lint"] --> Test["test"] --> Build["build"] --> Sec["trivy scan\nSARIF → GitHub Security"] --> Push["push GHCR\n(main only)"]
    end

    subgraph IaC ["Terraform (AWS)"]
        EC2["EC2 + RDS\nuser_data → docker compose up"]
    end
```

---

## Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.12), SQLAlchemy async, Alembic |
| Frontend | Next.js 14 App Router, TypeScript, Tailwind CSS, Recharts |
| Scanner | Trivy CLI + Dive CLI (best-effort Build analysis through Docker socket access) |
| Database | PostgreSQL 16 (vulnerabilities stored as JSON in `raw_report`) |
| Cache | Redis 7 (10-min TTL for digest-pinned image reuse, graceful degradation) |
| Monitoring | Prometheus + Grafana (5 custom metrics) |
| IaC | Terraform — flat `main.tf`, EC2 + RDS, `templatefile()` user_data |
| CI/CD | GitHub Actions — lint → test → build → security scan → push GHCR |

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

> **First run:** The backend pre-warms the Trivy vulnerability database on startup (~50 MB download, ~1 min). Subsequent starts use the cached DB volume and are instant.
>
> **Cache permissions:** The Compose stack now runs a one-shot `trivy-cache-init` service that fixes ownership on the named Trivy cache volume before the backend starts. Rebuild the backend image after pulling these changes.
>
> **API access:** The default stack exposes only the frontend. Browser API calls go through the Next.js route-handler proxy. Use `docker compose -f docker-compose.dev.yml up` if you want direct access to Swagger at `http://localhost:8000/docs`.
>
> **Build analysis:** The backend mounts `/var/run/docker.sock` so Dive can inspect real images. Set `DOCKER_GID` to the socket group on your host before starting the stack.

### Populate demo data

```bash
./scripts/seed.sh
```

Launches scans for `nginx:latest`, `node:18-alpine`, `python:3.12-slim`, `postgres:16-alpine`, and `node:10` (deliberately vulnerable), then polls until all complete. Grafana dashboards and the scan history page will be populated with realistic data.

---

## Screenshots

> Run `./scripts/seed.sh` first to populate data.

| Dashboard | Scan Detail | Grafana |
|-----------|------------|---------|
| ![Dashboard](docs/screenshots/dashboard.png) | ![Scan Detail](docs/screenshots/scan-detail.png) | ![Grafana](docs/screenshots/grafana.png) |

---

## DevSecOps Pipeline

```
push → GitHub Actions
         │
         ├─ lint     ruff (Python) + ESLint (TypeScript) in parallel
         │
         ├─ test     pytest --cov-fail-under=70 + npm test in parallel
         │
         ├─ build    docker build backend + frontend, tag with commit SHA
         │
         ├─ security-scan
         │           trivy image --severity CRITICAL --exit-code 1
         │           Upload SARIF → GitHub Security tab
         │           Pipeline fails on any CRITICAL vulnerability
         │
         └─ push-registry  (main branch only)
                     docker push ghcr.io/acharlas/dockguard-backend:latest
                     docker push ghcr.io/acharlas/dockguard-frontend:latest
```

The security gate (`--exit-code 1` on CRITICAL) means broken images never reach the registry. SARIF output makes vulnerabilities visible directly in the GitHub Security tab without any external tooling.

---

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/scans` | Initiate analysis (`202` for new/in-flight work, `200` for digest-cached completed result, may return `429` when the queue is full) |
| `GET` | `/api/v1/scans` | Paginated scan history (filters: `status`, `date_from`, `date_to`) |
| `GET` | `/api/v1/scans/{id}` | Scan detail with Security and Build sections |
| `GET` | `/api/v1/stats` | Totals, severity breakdown, build metrics, top 10 CVEs, top 5 images |
| `GET` | `/api/v1/health` | Health check (DB ping) |
| `GET` | `/metrics` | Prometheus metrics |

Direct backend docs are available in the dev stack at `http://localhost:8000/docs` and `http://localhost:8000/redoc`.

The frontend proxies browser API calls through a Next.js route handler. For this MVP, abuse control is intentionally simple: duplicate suppression, queue caps, and bounded scan concurrency. There is no per-client rate limiting because the app does not have a trustworthy client-identity boundary.

If the backend restarts, any `pending` or `running` scans are reconciled to `failed` with `failure_reason = "worker_restarted"`. The app does not try to fake durable in-process jobs.

### Async scan flow

```
POST /scans → existing pending/running scan returned when duplicate work is already in flight
          ↓
          202 (scan_status: "pending")  |  200 (completed digest cache hit)
                    ↓ asyncio background task
              scan_status: "running"
                    ↓
              Trivy security analysis
                    ↓
              Dive build analysis (best effort)
                    ↓
              scan_status: "completed" | "failed" | "cancelled"
                    ↓
              completed scans persist Security + Build output on the same row
                    ↓
              Redis cache set for immutable digest → digest-pinned requests can reuse a recent completed result
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
docker compose -f docker-compose.dev.yml up

# Backend tests + coverage
docker compose -f docker-compose.dev.yml exec backend pytest --cov --cov-report=term

# Frontend tests
docker compose -f docker-compose.dev.yml exec frontend npm test

# Lint
docker compose -f docker-compose.dev.yml exec backend ruff check app/ tests/
docker compose -f docker-compose.dev.yml exec frontend npm run lint

# Terraform validate
cd terraform && terraform init && terraform validate
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No `Vulnerability` table | Trivy JSON stored in `raw_report`, queried via PostgreSQL JSON operators. Denormalise only when slowness is proven, not assumed. |
| One scan row stores both lenses | Security and Build are part of the same user action. A second table would be ceremony for this MVP. |
| `asyncio.Semaphore(3)` not a queue service | One line limits concurrency to 3 concurrent scan processes — zero extra infrastructure for a single-worker backend. |
| Redis added at Day 5 | Not Day 1. Added when the use case was real (reuse digest-pinned scans safely), not speculatively. |
| Flat Terraform (`main.tf`) | Modules add abstraction cost. For one VPC + one EC2 + one RDS, a flat file with clear comments is easier to read and review. |
| `templatefile()` for `user_data` | Separates HCL interpolation from bash, avoiding nested heredoc parsing issues and making the bootstrap script testable independently. |
| Per-scan Trivy cache dir | Concurrent scans get isolated `fanal` (image layer) cache dirs with a symlink to the shared pre-warmed DB — eliminates file lock contention without sacrificing DB caching. |

## Deployment Notes

- The sample Terraform deployment is HTTP-only on port `80`. It does not terminate TLS.
- Restrict `ssh_allowed_cidr` explicitly in `terraform.tfvars`; there is no world-open SSH default anymore.
- The Build lens requires Docker socket access on the backend host. Terraform user-data exports `DOCKER_GID` automatically before `docker compose up`.

---

## License

[MIT](LICENSE)
