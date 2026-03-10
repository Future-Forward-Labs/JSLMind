#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# JSLMind Demo — One-Shot Startup Script
# Brings the full platform up in dependency order with readiness checks.
# Usage: bash start.sh [--phase <1-5>] [--skip-build]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

PHASE=5         # default: bring up through Phase 5
SKIP_BUILD=0
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --phase)    PHASE="$2"; shift 2 ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

cd "$SCRIPT_DIR"

# ── Preflight ─────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║          JSLMind Demo Platform — Startup             ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

if [[ ! -f .env ]]; then
  echo "ERROR: .env file not found."
  echo "  cp .env.example .env && fill in required values"
  exit 1
fi
source .env

# ── Helper: wait for a URL to respond ────────────────────────────────────────
wait_for() {
  local label="$1" url="$2" retries="${3:-30}"
  printf "  Waiting for %-30s" "$label..."
  for i in $(seq 1 "$retries"); do
    if curl -sf "$url" >/dev/null 2>&1; then
      echo " ready"
      return 0
    fi
    sleep 2
  done
  echo " TIMEOUT"
  return 1
}

BUILD_FLAG=""
[[ $SKIP_BUILD -eq 0 ]] && BUILD_FLAG="--build"

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 1 — Platform Foundation
# ─────────────────────────────────────────────────────────────────────────────
echo "==> Phase 1: Platform Foundation"
docker compose up -d $BUILD_FLAG \
  postgres redis keycloak prometheus grafana

wait_for "Postgres"   "http://localhost:5432" 15 || true   # TCP check via pg_isready below
docker compose exec -T postgres pg_isready -U postgres -q && echo "  Waiting for Postgres       ... ready"
wait_for "Grafana"    "http://localhost:3001/api/health"
wait_for "Prometheus" "http://localhost:9090/-/ready"

# Run init scripts (idempotent)
bash scripts/seed-minio.sh       2>/dev/null || true

[[ $PHASE -le 1 ]] && { echo ""; echo "Platform Foundation ready. http://localhost:3001 (Grafana)"; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 2 — LLM Gateway
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "==> Phase 2: LLM Gateway"
docker compose up -d $BUILD_FLAG \
  ollama litellm-proxy langfuse-server langfuse-worker

wait_for "LiteLLM proxy" "http://localhost:4000/health"
wait_for "Langfuse"      "http://localhost:3002/api/public/health"

bash scripts/seed-litellm-keys.sh 2>/dev/null || true

[[ $PHASE -le 2 ]] && { echo ""; echo "LLM Gateway ready. http://localhost:4000 (LiteLLM)"; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 3 — Agent Catalog
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "==> Phase 3: Agent Catalog"
docker compose up -d $BUILD_FLAG backstage

wait_for "Backstage" "http://localhost:7007/healthcheck"

[[ $PHASE -le 3 ]] && { echo ""; echo "Agent Catalog ready. http://localhost:7007 (Backstage)"; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 4 — Medallion Data Pipeline
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "==> Phase 4: Medallion Pipeline"
docker compose up -d $BUILD_FLAG \
  minio airflow-init

# Wait for airflow init to complete before starting webserver
echo "  Waiting for Airflow init      ..."
docker compose wait airflow-init 2>/dev/null || true

docker compose up -d $BUILD_FLAG \
  airflow-webserver airflow-scheduler marquez marquez-web camel-integration

wait_for "MinIO"       "http://localhost:9000/minio/health/live"
wait_for "Airflow"     "http://localhost:8085/health"
wait_for "Marquez API" "http://localhost:5000/api/v1/namespaces"
wait_for "Marquez UI"  "http://localhost:3004"

# Create Airflow admin user if it doesn't exist yet
docker compose exec -T airflow-webserver \
  airflow users create --username admin --password admin \
  --firstname Admin --lastname JSL --role Admin --email admin@jsl.com 2>/dev/null || true

# Unpause and trigger DAGs
AUTH="Basic $(echo -n 'admin:admin' | base64)"
for dag in sap_ingest medallion_transform data_quality; do
  curl -sf -X PATCH "http://localhost:8085/api/v1/dags/${dag}" \
    -H "Authorization: $AUTH" -H "Content-Type: application/json" \
    -d '{"is_paused": false}' >/dev/null || true
done

bash scripts/seed-sap-data.sh 2>/dev/null || true

[[ $PHASE -le 4 ]] && { echo ""; echo "Medallion Pipeline ready. http://localhost:8085 (Airflow)"; exit 0; }

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 5 — OT/CBM Streaming
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "==> Phase 5: OT/CBM Streaming"
docker compose up -d $BUILD_FLAG \
  redpanda timescaledb mosquitto

wait_for "RedPanda"    "http://localhost:9644/v1/cluster/health/overview"
echo "  Waiting for TimescaleDB       ..."
for i in $(seq 1 20); do
  docker compose exec -T timescaledb pg_isready -U postgres -d sensors -q 2>/dev/null && echo "  TimescaleDB                    ready" && break
  sleep 2
done

docker compose up -d $BUILD_FLAG \
  temporal temporal-ui mqtt-simulator cbm-worker

wait_for "Temporal UI"    "http://localhost:8088"
wait_for "MQTT Simulator" "http://localhost:8099"    # anomaly inject endpoint

echo "  Starting camel-integration (OT mode)..."
docker compose up -d $BUILD_FLAG camel-integration

[[ $PHASE -le 5 ]] && {
  echo ""
  echo "╔══════════════════════════════════════════════════════╗"
  echo "║            JSLMind Phase 1–5 Ready                   ║"
  echo "╠══════════════════════════════════════════════════════╣"
  echo "║  Demo Shell     http://localhost:3000                ║"
  echo "║  OT/CBM Page    http://localhost:3000/ot             ║"
  echo "║  Grafana OT     http://localhost:3001/d/jsl-ot-sensors║"
  echo "║  Temporal UI    http://localhost:8088                ║"
  echo "║  Airflow        http://localhost:8085  (admin/admin) ║"
  echo "║  Langfuse       http://localhost:3002                ║"
  echo "║  Backstage      http://localhost:7007                ║"
  echo "║  MinIO          http://localhost:9001                ║"
  echo "║  Marquez UI     http://localhost:3004                ║"
  echo "╠══════════════════════════════════════════════════════╣"
  echo "║  Inject anomaly: curl -X POST                        ║"
  echo "║    http://localhost:8099/inject-anomaly?equipment=   ║"
  echo "║    CRM-1  (bearing failure)                          ║"
  echo "║    APL-1  (furnace fault)                            ║"
  echo "║    CCM-1  (mold breakout risk)                       ║"
  echo "╚══════════════════════════════════════════════════════╝"
  echo ""
  bash scripts/verify-phase5.sh 2>/dev/null || true
  exit 0
}

# ─────────────────────────────────────────────────────────────────────────────
# PHASE 6 — Hybrid RAG
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "==> Phase 6: Hybrid RAG"
docker compose up -d $BUILD_FLAG qdrant rag-service

wait_for "Qdrant"       "http://localhost:6333/readyz"
wait_for "RAG service"  "http://localhost:8001/health"

bash scripts/pull-ollama-models.sh 2>/dev/null || true

# ─────────────────────────────────────────────────────────────────────────────
# Summary — All Phases
# ─────────────────────────────────────────────────────────────────────────────
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           JSLMind Full Platform Ready                 ║"
echo "╠══════════════════════════════════════════════════════╣"
echo "║  Demo Shell     http://localhost:3000                ║"
echo "║  OT/CBM Page    http://localhost:3000/ot             ║"
echo "║  Grafana OT     http://localhost:3001/d/jsl-ot-sensors║"
echo "║  Temporal UI    http://localhost:8088                ║"
echo "║  Airflow        http://localhost:8085  (admin/admin) ║"
echo "║  Langfuse       http://localhost:3002                ║"
echo "║  Backstage      http://localhost:7007                ║"
echo "║  MinIO          http://localhost:9001                ║"
echo "║  Qdrant         http://localhost:6333/dashboard      ║"
echo "║  Marquez UI     http://localhost:3004                ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
