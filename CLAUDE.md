# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DockGuard is a Docker image security scanning dashboard with a complete DevSecOps pipeline. The infrastructure itself is the portfolio artifact — each layer demonstrates a specific DevOps/DevSecOps competency.

The full specification is in `README.md` (French). Development is organized as a 5-day MVP roadmap.

## Development Commands

### Full stack (once implemented)
```bash
docker compose up --build          # Start all services
docker compose -f docker-compose.dev.yml up  # Dev mode with hot reload
```

### Backend (FastAPI / Python 3.12)
```bash
cd backend
pip install -e ".[dev]"            # Install with dev dependencies
pytest                             # Run all tests
pytest tests/path/to/test.py      # Run a single test file
pytest -k "test_name"             # Run a single test by name
pytest --cov --cov-report=term    # Run with coverage (target: >70%)
ruff check .                      # Lint
ruff format .                     # Format
alembic upgrade head              # Apply DB migrations
alembic revision --autogenerate -m "description"  # Generate migration
```

### Frontend (Next.js 14 / TypeScript)
```bash
cd frontend
npm install
npm run dev                        # Dev server
npm run build                      # Production build
npm run lint                       # ESLint
npm test                           # Jest + React Testing Library
```

### Infrastructure (Terraform)
```bash
cd terraform
terraform init                     # Initialize S3 backend
terraform validate                 # Check syntax
terraform plan                     # Preview changes
terraform apply                    # Apply changes
```

### Configuration (Ansible)
```bash
cd ansible
ansible-playbook playbook.yml                        # Full provision
ansible-playbook playbook.yml --tags deploy           # App deploy only (pull + restart)
ansible-playbook playbook.yml --tags cloudflared      # Cloudflared only
ansible-playbook playbook.yml --syntax-check          # Validate syntax
ansible-playbook playbook.yml --check                 # Dry run
```

## Architecture

```
User → Cloudflare Edge (SSL/DDoS) → Cloudflare Tunnel → Oracle ARM VM (Always Free)
                                                            ↓
                                              Docker Compose stack:
                                              ├── Next.js Frontend (:3000)
                                              ├── FastAPI Backend (:8000)
                                              ├── PostgreSQL 16 (:5432)
                                              ├── Redis 7 (:6379)
                                              ├── Prometheus (:9090)
                                              ├── Grafana (:3001)
                                              └── cloudflared (tunnel daemon)
```

**CI/CD pipeline (GitHub Actions):**
- `ci.yml`: lint → test → build (ARM64) → Trivy security scan → push to GHCR → deploy app via Ansible (`--tags deploy`)
- `deploy.yml`: terraform plan on PR → terraform apply on merge → Ansible full provision (path-filtered to `terraform/` and `ansible/`)

**Infrastructure:**
- Oracle Cloud Always Free: ARM VM (4 OCPU, 24GB RAM), VCN, subnet
- Cloudflare: DNS, SSL, DDoS protection, Tunnel (zero-trust ingress)
- OCI Object Storage: remote state (S3-compatible)
- Ansible: VM configuration management (cloudflared, Docker Compose stack)
- No public HTTP ports — all ingress via Cloudflare Tunnel

### Backend structure (`backend/app/`)
- `main.py` — FastAPI app setup, CORS, middleware
- `config.py` — Settings from environment variables
- `models/scan.py` — SQLAlchemy model: `ScanResult` (single model, vulnerabilities stored in `raw_report` JSON)
- `schemas/scan.py` — Pydantic schemas for request/response validation
- `api/routes/scans.py` — Scan endpoints (POST/GET)
- `api/routes/health.py` — Health check (DB, Redis, Trivy)
- `services/scanner.py` — `ScannerService`: wraps `trivy image --format json` via `asyncio.create_subprocess_exec` (never `shell=True`)
- `db/session.py` — SQLAlchemy session/engine setup

### Key design decisions
- **No `Vulnerability` table** — Trivy JSON stored in `raw_report`, queried via PostgreSQL JSON operators. Denormalize only if proven slow.
- **No Redis for rate limiting** — `asyncio.Semaphore(3)` (one line vs one service for zero users). Redis added Day 5 for caching only.
- **Flat Terraform** — split by concern (provider, network, compute, cloudflare), no modules.
- **Tests written alongside code** — not in a separate "test day".

### Key API endpoints
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/scans` | Initiate scan (async, returns 202) |
| GET | `/api/v1/scans` | Paginated scan history (filters: status, date) |
| GET | `/api/v1/scans/{id}` | Scan detail + vulnerabilities extracted from `raw_report` |
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/stats` | Global stats (totals, severity breakdown, top CVEs) |
| GET | `/metrics` | Prometheus metrics |

### Async scan flow
`POST /scans` → creates `ScanResult` with status `pending` → returns 202 → background task runs Trivy → status transitions: `pending` → `running` → `completed`/`failed`

### Custom Prometheus metrics
- `dockguard_scans_total` (counter, label: status)
- `dockguard_scan_duration_seconds` (histogram)
- `dockguard_vulnerabilities_found` (counter, label: severity)
- `dockguard_active_scans` (gauge)

## Working with Claude

At the start of each session, specify:
1. The current day in the roadmap (e.g. "Day 3")
2. What has already been completed
3. Any blockers

## Environment Variables

### Backend (set in Ansible docker-compose template)
- `DATABASE_URL` — PostgreSQL connection string
- `CORS_ORIGINS` — JSON array of allowed origins (production: `["https://dockguard.acharlas.dev"]`)
- `REDIS_URL` — Redis connection string
- `ENABLE_BUILD_ANALYSIS` — `false` in production (no Docker socket)
- `MAX_PENDING_SCANS` — Max queued scans (default: 25)

### Terraform Variables
Passed via `TF_VAR_*` environment variables in GitHub Actions. See `terraform/variables.tf` for the full list.

### GitHub Secrets (repository-level)
- `OCI_*` — Oracle Cloud credentials and config (tenancy, user, fingerprint, private key, region, compartment, AD, image OCID)
- `OCI_S3_ACCESS_KEY` / `OCI_S3_SECRET_KEY` — Terraform state backend auth
- `CLOUDFLARE_*` — Cloudflare API token, account ID, zone ID
- `SSH_PUBLIC_KEY` / `SSH_ALLOWED_CIDR` — VM SSH access

### GitHub Secrets (`production` environment)
- `DB_PASSWORD` — PostgreSQL password (passed to Ansible)
- `GRAFANA_ADMIN_PASSWORD` — Grafana admin password (passed to Ansible)
- `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET` — Cloudflare Access service token (Ansible SSH proxy)
- `VM_SSH_PRIVATE_KEY` — SSH key for Ansible

## Security Notes

- Image name input must be sanitized via regex whitelist to prevent command injection (handled Day 1, not deferred)
- Trivy executed via `asyncio.create_subprocess_exec` — never `shell=True`
- Trivy scan timeout: max 5 minutes
- Concurrency limit: `asyncio.Semaphore(3)`
- CI security gate: pipeline fails if CRITICAL vulnerabilities found in built images
