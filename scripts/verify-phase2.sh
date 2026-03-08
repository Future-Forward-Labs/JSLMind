#!/usr/bin/env bash
# Verification script for Phase 2 — LLM Gateway
# Usage: bash scripts/verify-phase2.sh

set -euo pipefail

LITELLM_BASE_URL="${LITELLM_BASE_URL:-http://localhost:4000}"
LANGFUSE_BASE_URL="${LANGFUSE_BASE_URL:-http://localhost:3002}"
LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-sk-jsl-master}"

PASS=0
FAIL=0
SKIP=0

check() {
  local label="$1" result="$2"
  if [[ "$result" == "ok" ]]; then
    echo "[OK]   $label"; ((PASS++)) || true
  elif [[ "$result" == "skip" ]]; then
    echo "[SKIP] $label"; ((SKIP++)) || true
  else
    echo "[FAIL] $label — $result"; ((FAIL++)) || true
  fi
}

llm_query() {
  # Usage: llm_query <model> <prompt> <expect_substr>
  local model="$1" prompt="$2" expect="$3"
  local resp
  resp=$(curl -sf --max-time 25 -X POST "$LITELLM_BASE_URL/chat/completions" \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    -H "Content-Type: application/json" \
    -d "{\"model\":\"$model\",\"messages\":[{\"role\":\"user\",\"content\":\"$prompt\"}]}" \
    2>/dev/null || echo "CURL_ERR")
  if [[ "$resp" == "CURL_ERR" ]]; then echo "error"; return; fi
  local content
  content=$(echo "$resp" | python3 -c \
    "import sys,json; d=json.load(sys.stdin); print(d.get('choices',[{}])[0].get('message',{}).get('content','ERR') or d.get('error',{}).get('message','ERR')[:80])" \
    2>/dev/null || echo "parse-error")
  if [[ "$content" == *"$expect"* ]]; then echo "ok"; else echo "wrong: ${content:0:80}"; fi
}

echo "==> Phase 2 Verification — LLM Gateway"
echo ""

# TEST 1 — LiteLLM liveness (fast, no model pings)
health=$(curl -sf --max-time 5 "$LITELLM_BASE_URL/health/liveliness" \
  -H "Authorization: Bearer $LITELLM_MASTER_KEY" 2>/dev/null || echo "error")
if [[ "$health" == *"alive"* ]]; then
  check "LiteLLM health" "ok"
else
  check "LiteLLM health" "$health"
fi

# Detect Ollama before attempting Ollama-backed model tests
ollama_up=$(curl -sf --max-time 4 http://localhost:11434/api/tags 2>/dev/null | python3 -c "import sys,json; json.load(sys.stdin); print('yes')" 2>/dev/null || echo "no")
echo "     (Ollama: $ollama_up)"
echo ""

# TEST 2 — jsl-fast (Ollama llama3.2:3b → cloud fallback)
if [[ "$ollama_up" == "yes" ]]; then
  check "jsl-fast model responds" "$(llm_query jsl-fast 'Reply exactly: JSLMIND_OK' 'JSLMIND_OK')"
else
  check "jsl-fast (Ollama not running — skipped)" "skip"
fi

# TEST 3 — jsl-quality (Ollama mistral:7b → cloud fallback)
if [[ "$ollama_up" == "yes" ]]; then
  check "jsl-quality model responds" "$(llm_query jsl-quality 'Reply exactly: QUALITY_OK' 'QUALITY_OK')"
else
  check "jsl-quality (Ollama not running — skipped)" "skip"
fi

# TEST 4 — jsl-embed (bge-m3 — embeddings, dim=1024)
if [[ "$ollama_up" == "yes" ]]; then
  embed_result=$(curl -sf --max-time 25 -X POST "$LITELLM_BASE_URL/embeddings" \
    -H "Authorization: Bearer $LITELLM_MASTER_KEY" \
    -H "Content-Type: application/json" \
    -d '{"model":"jsl-embed","input":"stainless steel grade 316L"}' \
    | python3 -c "import sys,json; d=json.load(sys.stdin); emb=d.get('data',[{}])[0].get('embedding',[]); print('ok' if len(emb)==1024 else f'wrong-dim:{len(emb)}')" \
    2>/dev/null || echo "error")
  check "jsl-embed produces 1024-dim embeddings" "$embed_result"
else
  check "jsl-embed (Ollama not running — skipped)" "skip"
fi

# TEST 5 — jsl-cloud (Claude API direct — always available if ANTHROPIC_API_KEY set)
check "jsl-cloud (Claude API) responds" "$(llm_query jsl-cloud 'Reply exactly: CLOUD_OK' 'CLOUD_OK')"

# TEST 6 — Langfuse reachable
langfuse_result=$(curl -sf --max-time 10 "$LANGFUSE_BASE_URL/api/public/health" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('ok' if d.get('status')=='OK' else 'unhealthy')" \
  2>/dev/null || echo "error")
check "Langfuse health" "$langfuse_result"

echo ""
echo "─────────────────────────────────────────"
echo "Phase 2: $PASS passed, $SKIP skipped, $FAIL failed"
if [[ "$FAIL" -eq 0 ]]; then
  echo "READY TO PROCEED to Phase 3"
  if [[ "$SKIP" -gt 0 ]]; then
    echo "NOTE: $SKIP test(s) skipped — start Ollama + pull models to test local LLMs"
  fi
else
  echo "BLOCKED — fix failures before proceeding"
  exit 1
fi
