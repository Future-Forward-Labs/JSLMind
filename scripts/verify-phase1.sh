#!/usr/bin/env bash
# Verification script for Phase 1 — Platform Foundation
# Usage: bash scripts/verify-phase1.sh
# Prereqs: .env sourced (or env vars exported), Phase 1 services running

set -euo pipefail

PASS=0
FAIL=0

check() {
  local label="$1"
  local result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "[OK]  $label"
    ((PASS++))
  else
    echo "[FAIL] $label — $result"
    ((FAIL++))
  fi
}

echo "==> Phase 1 Verification"
echo ""

# TEST 1 — Postgres
pg_result=$(PGPASSWORD="${POSTGRES_PASSWORD}" \
  psql -h localhost -U postgres -c "SELECT 1" -t -A 2>&1 | head -1 || echo "error")
[[ "$pg_result" == "1" ]] && check "Postgres :5432" "ok" || check "Postgres :5432" "$pg_result"

# TEST 2 — Redis
redis_result=$(redis-cli -h localhost -a "${REDIS_PASSWORD}" ping 2>/dev/null || echo "error")
[[ "$redis_result" == "PONG" ]] && check "Redis :6379" "ok" || check "Redis :6379" "$redis_result"

# TEST 3 — Keycloak realm
kc_result=$(curl -sf http://localhost:8080/realms/jslmind/.well-known/openid-configuration \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if 'issuer' in d else 'no-issuer')" \
  2>/dev/null || echo "error")
check "Keycloak realm jslmind" "$kc_result"

# TEST 4 — Demo user exists
if [[ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
  token=$(curl -sf -X POST "http://localhost:8080/realms/master/protocol/openid-connect/token" \
    -d "client_id=admin-cli&username=admin&password=${KEYCLOAK_ADMIN_PASSWORD}&grant_type=password" \
    | python3 -c "import sys,json; print(json.load(sys.stdin).get('access_token',''))" 2>/dev/null || echo "")

  if [[ -n "$token" ]]; then
    users=$(curl -sf "http://localhost:8080/admin/realms/jslmind/users" \
      -H "Authorization: Bearer $token" \
      | python3 -c "import sys,json; emails=[u['email'] for u in json.load(sys.stdin)]; print('ok' if 'demo@jsl.com' in emails else 'user-not-found')" \
      2>/dev/null || echo "error")
    check "Keycloak demo@jsl.com user" "$users"
  else
    check "Keycloak demo@jsl.com user" "could-not-get-admin-token"
  fi
else
  echo "[SKIP] Keycloak demo user — KEYCLOAK_ADMIN_PASSWORD not set"
fi

# TEST 5 — Grafana
grafana_result=$(curl -sf http://localhost:3001/api/health \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('database')=='ok' else 'db-not-ok')" \
  2>/dev/null || echo "error")
check "Grafana dashboard accessible" "$grafana_result"

# TEST 6 — Prometheus targets
prom_count=$(curl -sf http://localhost:9090/api/v1/targets \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(len(d['data']['activeTargets']))" \
  2>/dev/null || echo "0")
[[ "$prom_count" -ge 2 ]] && check "Prometheus scraping ≥2 targets (found $prom_count)" "ok" \
  || check "Prometheus targets" "only $prom_count active"

echo ""
echo "─────────────────────────────────────────"
echo "Phase 1: $PASS passed, $FAIL failed"
if [[ "$FAIL" -eq 0 ]]; then
  echo "READY TO PROCEED to Phase 2"
else
  echo "BLOCKED — fix failures before proceeding"
  exit 1
fi
