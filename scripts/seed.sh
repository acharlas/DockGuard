#!/usr/bin/env bash
# seed.sh — Launch demo scans so Grafana and frontend are populated with data.
# Usage: ./scripts/seed.sh [API_BASE_URL]
# Default URL: http://localhost:8000/api/v1

set -euo pipefail

API="${1:-http://localhost:8000/api/v1}"
POLL_INTERVAL=5
POLL_TIMEOUT=660  # 11 minutes per scan (DB download + scan)

IMAGES=(
  "nginx:latest"
  "node:18-alpine"
  "python:3.12-slim"
  "postgres:16-alpine"
  "node:10"
)

# ─── helpers ────────────────────────────────────────────────────────────────

green()  { printf '\033[0;32m%s\033[0m\n' "$*"; }
yellow() { printf '\033[0;33m%s\033[0m\n' "$*"; }
red()    { printf '\033[0;31m%s\033[0m\n' "$*"; }
bold()   { printf '\033[1m%s\033[0m\n' "$*"; }

require_cmd() {
  command -v "$1" &>/dev/null || { red "Error: '$1' is required but not found."; exit 1; }
}

require_cmd curl
require_cmd jq

# ─── wait for API to be ready ────────────────────────────────────────────────

bold "Waiting for API at ${API} ..."
for i in $(seq 1 12); do
  if curl -sf "${API}/health" >/dev/null 2>&1; then
    green "API is up."
    break
  fi
  if [[ $i -eq 12 ]]; then
    red "API did not become ready in time. Is the stack running?"
    exit 1
  fi
  sleep 5
done

# ─── pre-warm Trivy DB ───────────────────────────────────────────────────────
# On first run the DB download can take 2-3 minutes. Do it once upfront so
# all scans share the cached DB and don't race to download it simultaneously.

bold "\nPre-warming Trivy vulnerability database (first run may take ~2 min)..."
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.dev.yml}"
if docker compose -f "$COMPOSE_FILE" exec -T backend trivy image --download-db-only --quiet 2>/dev/null; then
  green "Trivy DB ready."
else
  yellow "Could not pre-warm Trivy DB via docker compose exec — scans will download it on demand."
fi

# ─── launch scans ────────────────────────────────────────────────────────────

declare -A SCAN_IDS

bold "\nLaunching ${#IMAGES[@]} scans..."
for image in "${IMAGES[@]}"; do
  response=$(curl -sf -X POST "${API}/scans" \
    -H "Content-Type: application/json" \
    -d "{\"image\": \"${image}\"}")
  id=$(echo "$response" | jq -r '.id')
  status=$(echo "$response" | jq -r '.scan_status')
  SCAN_IDS["$image"]="$id"
  yellow "  → ${image} (scan #${id}, status: ${status})"
done

# ─── poll until all complete ─────────────────────────────────────────────────

bold "\nPolling for completion (timeout ${POLL_TIMEOUT}s per scan)..."

declare -A RESULTS
for image in "${IMAGES[@]}"; do
  id="${SCAN_IDS[$image]}"
  elapsed=0
  printf "  Scan #%-4s %-30s " "${id}" "${image}"

  while true; do
    response=$(curl -sf "${API}/scans/${id}" || echo '{"scan_status":"error"}')
    status=$(echo "$response" | jq -r '.scan_status')

    case "$status" in
      completed)
        summary=$(echo "$response" | jq -r '.summary // {} | "C:\(.critical // 0) H:\(.high // 0) M:\(.medium // 0) L:\(.low // 0)"')
        green "completed  ${summary}"
        RESULTS["$image"]="completed"
        break
        ;;
      failed)
        red "failed"
        RESULTS["$image"]="failed"
        break
        ;;
      cancelled)
        yellow "cancelled"
        RESULTS["$image"]="cancelled"
        break
        ;;
      pending|running)
        printf "."
        ;;
      *)
        red " unknown status: ${status}"
        RESULTS["$image"]="unknown"
        break
        ;;
    esac

    elapsed=$((elapsed + POLL_INTERVAL))
    if [[ $elapsed -ge $POLL_TIMEOUT ]]; then
      yellow " timed out (still ${status})"
      RESULTS["$image"]="timeout"
      break
    fi
    sleep "$POLL_INTERVAL"
  done
done

# ─── summary ─────────────────────────────────────────────────────────────────

bold "\n════════════════ Seed Summary ════════════════"
completed=0
failed=0
for image in "${IMAGES[@]}"; do
  result="${RESULTS[$image]}"
  if [[ "$result" == "completed" ]]; then
    green "  ✓ ${image}"
    completed=$((completed + 1))
  else
    red "  ✗ ${image} (${result})"
    failed=$((failed + 1))
  fi
done

printf "\n"
bold "  Total: ${#IMAGES[@]}  Completed: ${completed}  Failed/Other: ${failed}"

if [[ $failed -gt 0 ]]; then
  yellow "\nNote: failures are normal for old images (node:10) if Trivy can't pull them."
  yellow "Check Grafana at http://localhost:3001 and the frontend at http://localhost:3000"
  exit 0
fi

green "\nAll scans completed. Open http://localhost:3000 to explore the dashboard."
green "Grafana dashboards: http://localhost:3001"
