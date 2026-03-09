#!/usr/bin/env bash
# verify-phase4.sh — health checks for Phase 4: Medallion Pipeline
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
echo "=== Phase 4 — Medallion Pipeline ==="
echo ""

# MinIO
check "MinIO health"         "curl -sf http://localhost:9000/minio/health/live"
check "MinIO bronze bucket"  "curl -sf -u \${MINIO_ROOT_USER:-jslmind}:\${MINIO_ROOT_PASSWORD:-jslmind_minio_2024} http://localhost:9000/bronze-sap-mm"

# Camel
check "Camel health"         "curl -sf http://localhost:8090/actuator/health | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['status']=='UP'\""
check "sap-to-bronze route"  "curl -sf http://localhost:8090/actuator/camelroutes | python3 -c \"import sys,json; routes=json.load(sys.stdin); assert any(r.get('id')=='sap-to-bronze' for r in routes)\""

# Airflow
check "Airflow webserver"    "curl -sf -u admin:admin http://localhost:8085/health | python3 -c \"import sys,json; d=json.load(sys.stdin); assert d['metadatabase']['status']=='healthy'\""
check "sap_ingest DAG"       "curl -sf -u admin:admin http://localhost:8085/api/v1/dags/sap_ingest | python3 -c \"import sys,json; d=json.load(sys.stdin); exit(0 if not d.get('is_paused',True) else 1)\""
check "medallion_transform"  "curl -sf -u admin:admin http://localhost:8085/api/v1/dags/medallion_transform | python3 -c \"import sys,json; d=json.load(sys.stdin); exit(0 if not d.get('is_paused',True) else 1)\""
check "data_quality DAG"     "curl -sf -u admin:admin http://localhost:8085/api/v1/dags/data_quality | python3 -c \"import sys,json; d=json.load(sys.stdin); exit(0 if not d.get('is_paused',True) else 1)\""

# Marquez
check "Marquez API"          "curl -sf http://localhost:5000/api/v1/namespaces"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "${FAIL}" -eq 0 ] && echo "Phase 4 READY" || echo "Phase 4 NOT READY — fix failures above"
echo ""
