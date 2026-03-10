#!/usr/bin/env bash
# verify-phase5.sh — health checks for Phase 5: OT/CBM Streaming
set -euo pipefail

PASS=0; FAIL=0
check() {
  local label="$1"; local cmd="$2"
  if eval "$cmd" >/dev/null 2>&1; then
    echo "  PASS  $label"; ((PASS++)) || true
  else
    echo "  FAIL  $label"; ((FAIL++)) || true
  fi
}

echo ""
echo "=== Phase 5 — OT/CBM Streaming ==="
echo ""

# Infrastructure
check "Mosquitto MQTT broker"    "docker compose exec -T mosquitto mosquitto_pub -h localhost -t test -m ping -q 0"
check "RedPanda health"          "curl -sf http://localhost:9644/v1/cluster/health/overview"
check "TimescaleDB ready"        "docker compose exec -T timescaledb pg_isready -U postgres -d sensors -q"
check "TimescaleDB schema"       "docker compose exec -T timescaledb psql -U postgres -d sensors -c \"SELECT 1 FROM sensor_readings LIMIT 1\" -q"
check "MQTT Simulator running"   "docker compose ps mqtt-simulator | grep -q Up"
check "Temporal server"          "curl -sf http://localhost:7233/api/v1/system-info"
check "Temporal UI"              "curl -sf http://localhost:8088"
check "CBM Worker registered"    "docker compose logs cbm-worker --tail=5 | grep -q 'Listening on cbm-task-queue'"

# Data flowing
check "Sensor readings exist"    "docker compose exec -T timescaledb psql -U postgres -d sensors -tAc \"SELECT COUNT(*) FROM sensor_readings\" | grep -qvE '^0$'"
check "plant.sensors topic"      "docker compose exec -T redpanda rpk topic list 2>/dev/null | grep -q plant.sensors"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ] && echo "Phase 5 READY" || echo "Phase 5 NOT READY — fix failures above"
echo ""
echo "Quick anomaly demo:"
echo "  curl -X POST 'http://localhost:8099/inject-anomaly?equipment=CRM-1'"
echo "  # Then watch: docker compose logs camel-integration --follow | grep ANOMALY"
echo "  # Grafana:     http://localhost:3001/d/jsl-ot-sensors"
echo "  # Temporal UI: http://localhost:8088"
echo ""
