#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# JSLMind Demo — Stop Script
# Usage:
#   bash stop.sh            # stop all containers, keep volumes
#   bash stop.sh --clean    # stop + remove volumes (full reset)
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

CLEAN=0
while [[ $# -gt 0 ]]; do
  case $1 in
    --clean) CLEAN=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          JSLMind Demo Platform — Stopping            ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

if [[ $CLEAN -eq 1 ]]; then
  echo "==> Stopping all services and removing volumes..."
  docker compose down -v
  echo ""
  echo "All services stopped and volumes removed."
  echo "Next start will re-initialise all databases and storage."
else
  echo "==> Stopping all services (volumes preserved)..."
  docker compose stop
  echo ""
  echo "All services stopped. Data volumes are intact."
  echo "Resume with: bash start.sh"
fi
echo ""
