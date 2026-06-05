# DockGuard — Agent Instructions

## Development

```bash
docker compose up --build          # start everything (hot reload, exposed ports)
docker compose exec backend pytest --cov --cov-report=term
docker compose exec frontend npm test
docker compose exec backend ruff check app/ tests/
docker compose exec frontend npm run lint
```

No local Python/Node required — everything runs in Docker. The backend runs with `--reload` and the frontend with `next dev`.

## Branch Conventions

Branch names follow the form `{tag}/{name}` with a short kebab-case description:

- `feat/` — new features or significant functionality
- `fix/` — bug fixes
- `chore/` — maintenance, dependency bumps, version updates
- `docs/` — documentation changes
- `refactor/` — code restructuring without behavior changes

If a requested change is out of scope for the current branch, create a new branch off the parent using the appropriate tag.

```bash
git checkout -b {tag}/{name} {parent-branch}
```

## Architecture

- **Backend**: FastAPI 0.115+ (Python 3.12), SQLAlchemy async, single uvicorn worker — all in-process state (semaphore, subprocess registry) assumes one worker.
- **Frontend**: Next.js 14 App Router, proxies `/api/v1/*` → backend via `route.ts` handler. Direct backend access at `:8000/docs`.
- **Database**: PostgreSQL 16. Migrations run at startup via `alembic upgrade head` in the container entrypoint.
- **Cache**: Redis 7, 10-min TTL digest-based scan reuse. Entirely optional — app degrades gracefully if unreachable.
- **Scanners**: Trivy CLI (security) and Dive CLI (build, requires Docker socket). Both called as subprocesses via `asyncio.create_subprocess_exec`.

## Testing

- Backend tests use **SQLite** (`aiosqlite`), not PostgreSQL. JSONB operators and GIN indexes are PostgreSQL-only — tests won't catch dialect mismatches.
- `conftest.py` patches `create_background_task` to discard tasks (no real subprocesses during tests).
- Frontend tests use Jest + jsdom with `global.fetch` mocks. Polling tests use fake timers and deferred promises for race-condition coverage.

## Config

- `backend/app/config.py` — pydantic-settings reads defaults from class attributes, overrides from `.env` file.
- `REDIS_URL` absent → cache disabled, no errors. `ENABLE_BUILD_ANALYSIS=false` → Dive skipped.
- `frontend/next.config.mjs` sets `output: "standalone"` — required for the Docker runtime image to work.

## Database Migrations

```bash
docker compose exec backend sh -c "cd /app && alembic revision --autogenerate -m 'description'"
```
Migrations run at container startup, not during build. The `alembic/versions/` directory is excluded from ruff in `pyproject.toml`.

## Single-Worker Assumptions

Several subsystems depend on single-process semantics. Do not add `--workers N` without redesigning these:
- `app/services/subprocesses.py` — `running_processes` dict (in-process, no cross-worker visibility)
- `app/api/routes/scans.py` — `_scan_admission_lock` (asyncio.Lock)
- `app/tasks.py` — `_background_tasks` set (in-process GC guard)

## Infrastructure (planned)

The IaC layer (`terraform/`, `ansible/`, GitHub Actions deploy pipeline) was stripped to barebones for restart. Read the `plans/` directory for the target architecture:

- **Target platform**: Oracle Cloud Always Free (ARM VM, 4 OCPU, 24 GB RAM) + Cloudflare Tunnel for zero-trust ingress.
- **Terraform**: OCI provider (`oracle/oci ~> 6.0`), Cloudflare provider (`cloudflare/cloudflare ~> 4.0`). Previous stack provisioned VCN, public subnet, compute instance, Cloudflare tunnel + DNS records + Access policy for SSH. State was stored in OCI S3-compatible bucket.
- **Ansible**: Provisions the VM with Docker, cloudflared, and the docker-compose stack. Previous role deployed via SSH over Cloudflare Tunnel.
- **CI/CD pipeline** (removed from `ci.yml`, planned for re-implementation): `lint → test → build ARM64 → Trivy image scan → push GHCR → terraform apply → SSH deploy via CF Tunnel → health check`. The security gate (`trivy image --severity CRITICAL --exit-code 1`) blocks broken images from reaching the registry.
- **`ci.yml`**: current CI — lint + test for backend and frontend, runs on main pushes and PRs.
- **`cd.yml`**: deploy pipeline — `terraform init` (OCI S3 backend via `-backend-config`) + `terraform apply` → output domain → `ansible-playbook` via Cloudflare Tunnel SSH. Runs on main push. Requires GitHub environment `production` with secrets.
- **Key variables** (OCI): `oci_tenancy_ocid`, `oci_user_ocid`, `oci_fingerprint`, `oci_private_key`, `oci_region`, `oci_compartment_id`, `oci_availability_domain`, `oci_instance_image_ocid`.
- **Key variables** (Cloudflare): `cloudflare_api_token`, `cloudflare_account_id`, `cloudflare_zone_id`, `cloudflare_ssh_service_token_id`, `domain` (default `acharlas.dev`).
- **Build lens restricted in production**: `DOCKER_HOST=tcp://dockersocket:2375` — Docker API proxied through `tecnativa/docker-socket-proxy` with only image inspection and pull allowed.
- **Terraform was flat** (split by concern, no modules): `provider.tf`, `network.tf`, `compute.tf`, `cloudflare.tf`, `outputs.tf`, `variables.tf`, `state.tf`, `cloud-init.yaml`.

<!-- lean-ctx-compression -->
OUTPUT STYLE: dense
- Each statement = one atomic fact line
- Use abbreviations: fn, cfg, impl, deps, req, res, ctx, err, ret
- Diff lines only (+/-/~), never repeat unchanged code
- Symbols: → (causes), + (adds), − (removes), ~ (modifies), ∴ (therefore)
- No narration, no filler, no hedging
- BUDGET: ≤200 tokens per response unless code block required
<!-- /lean-ctx-compression -->
