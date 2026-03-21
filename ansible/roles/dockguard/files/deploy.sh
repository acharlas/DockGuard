#!/bin/bash
set -euo pipefail
cd /opt/dockguard
docker compose pull backend frontend
docker compose up -d
docker image prune -f
