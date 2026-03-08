#!/usr/bin/env bash
# Verification script for Phase 3 — Backstage Agent Catalog
# Usage: bash scripts/verify-phase3.sh

set -euo pipefail

BACKSTAGE_BASE_URL="${BACKSTAGE_BASE_URL:-http://localhost:7007}"

PASS=0
FAIL=0

check() {
  local label="$1" result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "[OK]   $label"; ((PASS++)) || true
  else
    echo "[FAIL] $label — $result"; ((FAIL++)) || true
  fi
}

echo "==> Phase 3 Verification — Backstage Agent Catalog"
echo ""

# TEST 1 — Backstage liveness (200 from catalog API = backend is up)
health_code=$(curl -so /dev/null -w "%{http_code}" --max-time 10 \
  "$BACKSTAGE_BASE_URL/api/catalog/entities?limit=1" 2>/dev/null || echo "000")
if [[ "$health_code" == "200" ]]; then
  check "Backstage health" "ok"
else
  check "Backstage health" "http-$health_code"
fi

# TEST 2–8 — All 7 catalog entities present
catalog_entity() {
  local name="$1"
  local count
  count=$(curl -sf --max-time 10 \
    "$BACKSTAGE_BASE_URL/api/catalog/entities?filter=metadata.name=$name" \
    2>/dev/null \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if len(d)>0 else 'not-found')" \
    2>/dev/null || echo "error")
  echo "$count"
}

check "Domain: manufacturing"              "$(catalog_entity manufacturing)"
check "System: jslmind-platform"           "$(catalog_entity jslmind-platform)"
check "Agent: inventory-agent"             "$(catalog_entity inventory-agent)"
check "Agent: cbm-agent"                   "$(catalog_entity cbm-agent)"
check "Agent: quality-agent"               "$(catalog_entity quality-agent)"
check "Integration: sap-mm-connector"      "$(catalog_entity sap-mm-connector)"
check "Integration: kepware-opc-connector" "$(catalog_entity kepware-opc-connector)"

echo ""
echo "─────────────────────────────────────────"
echo "Phase 3: $PASS passed, $FAIL failed"
if [[ "$FAIL" -eq 0 ]]; then
  echo "READY TO PROCEED to Phase 4"
else
  echo "BLOCKED — fix failures before proceeding"
  exit 1
fi
