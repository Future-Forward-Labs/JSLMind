#!/usr/bin/env bash
# Creates the jslmind realm, department groups, and demo user in Keycloak.
# Usage: bash scripts/seed-keycloak.sh
# Prereqs: Keycloak running at KC_BASE_URL (default http://localhost:8080)

set -euo pipefail

KC_BASE_URL="${KC_BASE_URL:-http://localhost:8080}"
KC_ADMIN="${KC_ADMIN:-admin}"
KC_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-}"
DEMO_USER_PASSWORD="${DEMO_USER_PASSWORD:-Demo123!}"

if [[ -z "$KC_ADMIN_PASSWORD" ]]; then
  echo "ERROR: KEYCLOAK_ADMIN_PASSWORD is not set. Export it or source .env first." >&2
  exit 1
fi

echo "==> Obtaining admin token from $KC_BASE_URL"
ADMIN_TOKEN=$(curl -sf -X POST \
  "$KC_BASE_URL/realms/master/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "client_id=admin-cli" \
  -d "username=$KC_ADMIN" \
  -d "password=$KC_ADMIN_PASSWORD" \
  -d "grant_type=password" \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

auth_header() { echo "Authorization: Bearer $ADMIN_TOKEN"; }

echo "==> Creating jslmind realm"
curl -sf -X POST "$KC_BASE_URL/admin/realms" \
  -H "$(auth_header)" \
  -H "Content-Type: application/json" \
  -d '{
    "realm": "jslmind",
    "enabled": true,
    "displayName": "JSLMind",
    "sslRequired": "none",
    "registrationAllowed": false,
    "loginWithEmailAllowed": true,
    "duplicateEmailsAllowed": false,
    "resetPasswordAllowed": true,
    "editUsernameAllowed": false
  }' || echo "  (realm may already exist — continuing)"

echo "==> Creating department groups"
for group in operations-team finance-team quality-team; do
  curl -sf -X POST "$KC_BASE_URL/admin/realms/jslmind/groups" \
    -H "$(auth_header)" \
    -H "Content-Type: application/json" \
    -d "{\"name\": \"$group\"}" || echo "  (group $group may already exist)"
done

echo "==> Creating demo user: demo@jsl.com"
USER_PAYLOAD='{
  "username": "demo@jsl.com",
  "email": "demo@jsl.com",
  "firstName": "Demo",
  "lastName": "User",
  "enabled": true,
  "emailVerified": true,
  "credentials": [{"type": "password", "value": "'"$DEMO_USER_PASSWORD"'", "temporary": false}]
}'
curl -sf -X POST "$KC_BASE_URL/admin/realms/jslmind/users" \
  -H "$(auth_header)" \
  -H "Content-Type: application/json" \
  -d "$USER_PAYLOAD" || echo "  (user may already exist)"

echo ""
echo "[OK] Keycloak seeded:"
echo "     Realm:  jslmind"
echo "     Groups: operations-team, finance-team, quality-team"
echo "     User:   demo@jsl.com / $DEMO_USER_PASSWORD"
echo "     Admin:  $KC_BASE_URL/admin"
