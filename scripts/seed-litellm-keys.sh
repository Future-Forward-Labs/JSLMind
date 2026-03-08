#!/usr/bin/env bash
# Reads platform/llm-keys/*.yaml and generates LiteLLM virtual keys per team.
# Keys are saved to platform/llm-keys/.generated/<team>.key (gitignored).
# Usage: bash scripts/seed-litellm-keys.sh

set -euo pipefail

LITELLM_BASE_URL="${LITELLM_BASE_URL:-http://localhost:4000}"
LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-sk-jsl-master}"
LLM_KEYS_DIR="$(dirname "$0")/../platform/llm-keys"
GENERATED_DIR="$LLM_KEYS_DIR/.generated"
INR_TO_USD_RATE=84  # 1 USD ≈ 84 INR

mkdir -p "$GENERATED_DIR"

echo "==> Seeding LiteLLM virtual keys"
echo ""

for yaml_file in "$LLM_KEYS_DIR"/*.yaml; do
  [[ -f "$yaml_file" ]] || continue

  team_id=$(python3 -c "import yaml; d=yaml.safe_load(open('$yaml_file')); print(d['team_id'])")
  budget_inr=$(python3 -c "import yaml; d=yaml.safe_load(open('$yaml_file')); print(d['monthly_budget_inr'])")
  models_json=$(python3 -c "import yaml,json; d=yaml.safe_load(open('$yaml_file')); print(json.dumps(d.get('allowed_models', [])))")

  budget_usd=$(python3 -c "print(round($budget_inr / $INR_TO_USD_RATE, 2))")

  echo "--- Generating key for team: $team_id (budget: ₹$budget_inr / \$${budget_usd})"

  response=$(curl -sf -X POST "$LITELLM_BASE_URL/key/generate" \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    -H "Content-Type: application/json" \
    -d "{
      \"team_id\": \"$team_id\",
      \"max_budget\": $budget_usd,
      \"budget_duration\": \"1mo\",
      \"models\": $models_json,
      \"metadata\": {\"team\": \"$team_id\", \"provisioned_by\": \"seed-litellm-keys.sh\"}
    }")

  key=$(echo "$response" | python3 -c "import sys,json; print(json.load(sys.stdin)['key'])" 2>/dev/null || echo "")

  if [[ -n "$key" ]]; then
    echo "$key" > "$GENERATED_DIR/$team_id.key"
    echo "  [OK] Key saved to platform/llm-keys/.generated/$team_id.key"
  else
    echo "  [WARN] Could not extract key from response: $response"
  fi
done

echo ""
echo "[OK] Virtual key seeding complete"
echo "     Keys stored in platform/llm-keys/.generated/ (gitignored)"
