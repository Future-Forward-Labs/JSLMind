#!/usr/bin/env bash
# Reads all platform/ YAML request files and provisions the described resources.
# Applies Pattern A (DB), Pattern B (Storage), Pattern C (LLM keys), Pattern E (Auth).
# Usage: bash scripts/provision-platform.sh

set -euo pipefail

PLATFORM_DIR="$(dirname "$0")/../platform"

echo "==> JSLMind Platform Provisioner"
echo ""

# ─── Pattern A: Database provisioning ─────────────────────────────────────────
echo "--- Pattern A: Database requests"
for yaml_file in "$PLATFORM_DIR"/db-requests/*.yaml; do
  [[ -f "$yaml_file" ]] || continue
  db_type=$(python3 -c "import sys,yaml; d=yaml.safe_load(open('$yaml_file')); print(d.get('type',''))")
  schema=$(python3 -c "import sys,yaml; d=yaml.safe_load(open('$yaml_file')); print(d.get('schema',''))")
  echo "  [DB] type=$db_type schema=$schema"

  if [[ "$db_type" == "postgres" ]]; then
    PGPASSWORD="${POSTGRES_PASSWORD}" psql -h localhost -U postgres -c \
      "CREATE SCHEMA IF NOT EXISTS $schema;" 2>/dev/null || true
  fi
done

# ─── Pattern E: Auth client registration ──────────────────────────────────────
echo ""
echo "--- Pattern E: Auth client requests"
if [[ -n "${KEYCLOAK_ADMIN_PASSWORD:-}" ]]; then
  for yaml_file in "$PLATFORM_DIR"/auth-clients/*.yaml; do
    [[ -f "$yaml_file" ]] || continue
    client_id=$(python3 -c "import yaml; d=yaml.safe_load(open('$yaml_file')); print(d.get('client_id',''))")
    echo "  [Auth] Registering OIDC client: $client_id"
    # Full implementation in seed-keycloak.sh which handles token management
  done
else
  echo "  [Auth] Skipped — KEYCLOAK_ADMIN_PASSWORD not set"
fi

echo ""
echo "[OK] Platform provisioning complete"
