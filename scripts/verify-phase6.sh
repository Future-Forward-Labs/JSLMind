#!/usr/bin/env bash
# verify-phase6.sh — Phase 4: Hybrid RAG smoke tests
# Usage: ./scripts/verify-phase6.sh
# Prerequisite: docker compose up rag-service qdrant camel-integration litellm-proxy

set -euo pipefail

GREEN='\033[0;32m'; RED='\033[0;31m'; NC='\033[0m'
PASS=0; FAIL=0
TMPFILE=$(mktemp)
trap "rm -f $TMPFILE" EXIT

check() {
  local name="$1"; local cmd="$2"
  if eval "$cmd" &>/dev/null; then
    echo -e "${GREEN}✓${NC} $name"; PASS=$((PASS+1))
  else
    echo -e "${RED}✗${NC} $name"; FAIL=$((FAIL+1))
  fi
}

qdrant_points() {
  curl -s http://localhost:6333/collections/jsl_docs \
    | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['result'].get('points_count', 0))"
}

echo "=== Phase 4: Hybrid RAG Verification ==="
echo ""

# 1. RAG service health
check "rag-service /health returns ok" \
  "curl -sf http://localhost:8001/health | grep -q 'ok'"

# 2. Qdrant collection exists (use /collections list endpoint)
check "Qdrant collection jsl_docs exists" \
  "curl -sf http://localhost:6333/collections | grep -q 'jsl_docs'"

# 3. Qdrant has vectors (corpus was seeded — 20 docs → ~60-80 chunks)
check "Qdrant jsl_docs has >10 vectors" \
  "[ \$(qdrant_points) -gt 10 ]"

# 4. BM25 index exists
check "BM25 index file exists in rag-service container" \
  "docker compose exec rag-service test -f /docs/bm25_index.pkl"

# 5. /query returns answer and sources (write to tmpfile to handle binary chars in chunks)
curl -sf -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "What is the max carbon content for Grade 316L?", "top_k": 3}' \
  > "$TMPFILE" 2>/dev/null || echo '{}' > "$TMPFILE"
check "/query returns answer field" \
  "python3 -c \"import json; d=json.load(open('$TMPFILE')); assert 'answer' in d\""
check "/query returns at least 1 source citation" \
  "python3 -c \"import json; d=json.load(open('$TMPFILE')); assert len(d.get('sources',[])) > 0\""

# 6. /query with grade filter
check "/query with grade filter succeeds" \
  "curl -sf -X POST http://localhost:8001/query \
    -H 'Content-Type: application/json' \
    -d '{\"query\": \"surface finish\", \"filters\": {\"grade\": \"304\"}, \"top_k\": 2}' | grep -q 'answer'"

# 7. Kong routes /rag/query
check "Kong /rag/query returns 200" \
  "curl -sf -X POST http://localhost:8000/rag/query \
    -H 'Content-Type: application/json' \
    -d '{\"query\": \"carbon content Grade 304\"}' | grep -q 'answer'"

# 8. Camel route health
check "Camel FileToQdrantRoute is UP" \
  "curl -sf http://localhost:8090/actuator/health | grep -q 'UP'"

# 9. Backstage catalog entity
check "Backstage catalog shows rag-pipeline entity" \
  "curl -sf 'http://localhost:7007/api/catalog/entities?filter=metadata.name=rag-pipeline' | grep -q 'rag-pipeline'"

# 10. Live ingest test
echo ""
echo "--- Live ingest test: dropping test file ---"
BEFORE=$(qdrant_points)
TEST_FILE="rag/docs/incoming/live_test_$(date +%s).txt"
echo "JSL Live Test: Maximum carbon content for Grade 316L is 0.03 percent." > "$TEST_FILE"
sleep 12  # wait for Camel poll (5s) + ingest
AFTER=$(qdrant_points)
rm -f "$TEST_FILE"
check "Live-dropped file was ingested (vector count increased from $BEFORE)" \
  "[ $AFTER -gt $BEFORE ]"

echo ""
echo "Results: ${PASS} passed, ${FAIL} failed"
[ "$FAIL" -eq 0 ] && echo -e "${GREEN}Phase 4 verification PASSED${NC}" || echo -e "${RED}Phase 4 verification FAILED${NC}"
exit "$FAIL"
