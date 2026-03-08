# Phase 3 — Backstage Agent Catalog Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Stand up Backstage with 7 pre-seeded catalog entities (1 Domain, 1 System, 3 agent Components, 2 integration Components) and a passing verify-phase3.sh.

**Architecture:** Option A — root `catalog/catalog-info.yaml` (Location kind) references 6 individual entity files via relative `file:` paths. `infra/backstage/app-config.yaml` (mounted as `app-config.production.yaml`) provides catalog config; DB connection is already covered by `APP_CONFIG_*` env vars in docker-compose. Verify script checks health + all 7 entities via Backstage Catalog API.

**Tech Stack:** Backstage `roadiehq/community-backstage:latest`, Backstage Catalog REST API, bash.

**Design doc:** `docs/plans/2026-03-08-phase3-backstage-catalog-design.md`

---

### Task 1: Write verify-phase3.sh (TDD — write the test first)

**Files:**
- Create: `scripts/verify-phase3.sh`

**Step 1: Create the verify script**

```bash
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

# TEST 1 — Backstage liveness
health=$(curl -sf --max-time 10 "$BACKSTAGE_BASE_URL/healthcheck" 2>/dev/null || echo "error")
if echo "$health" | python3 -c "import sys,json; d=json.load(sys.stdin); sys.exit(0 if d.get('status')=='ok' else 1)" 2>/dev/null; then
  check "Backstage health" "ok"
else
  check "Backstage health" "$health"
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
```

**Step 2: Make it executable**

```bash
chmod +x scripts/verify-phase3.sh
```

**Step 3: Run it — confirm it fails (Backstage not yet started)**

```bash
bash scripts/verify-phase3.sh
```

Expected: `[FAIL] Backstage health` — confirms the test is live and failing as intended.

**Step 4: Commit**

```bash
git add scripts/verify-phase3.sh
git commit -m "test: add verify-phase3 script for Backstage catalog"
```

---

### Task 2: Backstage app-config.yaml

**Files:**
- Create: `infra/backstage/app-config.yaml`

**Step 1: Create the directory and config**

```bash
mkdir -p infra/backstage
```

```yaml
# infra/backstage/app-config.yaml
# Mounted as /app/app-config.production.yaml in the backstage container.
# DB connection comes from APP_CONFIG_* env vars in docker-compose — no need to repeat here.

app:
  baseUrl: http://localhost:7007

backend:
  baseUrl: http://localhost:7007
  cors:
    origin: http://localhost:7007

catalog:
  rules:
    - allow: [Domain, System, Component, Location]
  locations:
    - type: file
      target: /catalog/catalog-info.yaml
```

**Step 2: Commit**

```bash
git add infra/backstage/app-config.yaml
git commit -m "config: add Backstage app-config for Phase 3"
```

---

### Task 3: Root catalog Location entity

**Files:**
- Create: `catalog/catalog-info.yaml`

**Step 1: Create the catalog root directory and Location file**

```bash
mkdir -p catalog/domain catalog/system catalog/agents catalog/integrations
```

```yaml
# catalog/catalog-info.yaml
# Root Location — Backstage discovers all entities from here.
# Phase 7: append a new file: entry for each dynamically registered agent.
apiVersion: backstage.io/v1alpha1
kind: Location
metadata:
  name: jslmind-catalog-root
  description: Root catalog location for JSLMind demo platform
spec:
  targets:
    - ./domain/manufacturing.yaml
    - ./system/jslmind-platform.yaml
    - ./agents/inventory-agent.yaml
    - ./agents/cbm-agent.yaml
    - ./agents/quality-agent.yaml
    - ./integrations/sap-mm-connector.yaml
    - ./integrations/kepware-opc-connector.yaml
```

**Step 2: Commit**

```bash
git add catalog/catalog-info.yaml
git commit -m "catalog: add root Location entity"
```

---

### Task 4: Domain and System entities

**Files:**
- Create: `catalog/domain/manufacturing.yaml`
- Create: `catalog/system/jslmind-platform.yaml`

**Step 1: Create the Domain entity**

```yaml
# catalog/domain/manufacturing.yaml
apiVersion: backstage.io/v1alpha1
kind: Domain
metadata:
  name: manufacturing
  description: JSL manufacturing operations domain — stainless steel production, quality, and maintenance
spec:
  owner: operations-team
```

**Step 2: Create the System entity**

```yaml
# catalog/system/jslmind-platform.yaml
apiVersion: backstage.io/v1alpha1
kind: System
metadata:
  name: jslmind-platform
  description: On-premise enterprise AI platform for Jindal Stainless Limited
  links:
    - url: http://localhost:3001
      title: Grafana (Platform Metrics)
      icon: dashboard
    - url: http://localhost:3002
      title: Langfuse (LLM Traces)
      icon: search
    - url: http://localhost:7007
      title: Backstage (Agent Catalog)
      icon: catalog
spec:
  owner: operations-team
  domain: manufacturing
```

**Step 3: Commit**

```bash
git add catalog/domain/manufacturing.yaml catalog/system/jslmind-platform.yaml
git commit -m "catalog: add manufacturing Domain and jslmind-platform System entities"
```

---

### Task 5: Agent Component entities

**Files:**
- Create: `catalog/agents/inventory-agent.yaml`
- Create: `catalog/agents/cbm-agent.yaml`
- Create: `catalog/agents/quality-agent.yaml`

**Step 1: Create inventory-agent**

```yaml
# catalog/agents/inventory-agent.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: inventory-agent
  description: Monitors SAP MM stock levels and raises reorder alerts via Temporal workflow
  annotations:
    litellm/model: jsl-quality
    temporal/task-queue: inventory-agent
    demo/ui: "Inventory Agent — tracks SAP MM stock levels and flags reorder alerts"
spec:
  type: ai-agent
  lifecycle: production
  owner: operations-team
  system: jslmind-platform
```

**Step 2: Create cbm-agent**

```yaml
# catalog/agents/cbm-agent.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: cbm-agent
  description: Condition-Based Maintenance agent — detects OT sensor anomalies and triggers SAP PM notifications
  annotations:
    litellm/model: jsl-quality
    temporal/task-queue: cbm-agent
    demo/ui: "CBM Agent — monitors OT sensor anomalies and triggers maintenance workflows"
spec:
  type: ai-agent
  lifecycle: production
  owner: operations-team
  system: jslmind-platform
```

**Step 3: Create quality-agent**

```yaml
# catalog/agents/quality-agent.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: quality-agent
  description: Surface defect detection agent for Grade 316L production runs using Isolation Forest + LlamaIndex RAG
  annotations:
    litellm/model: jsl-quality
    temporal/task-queue: quality-agent
    demo/ui: "Quality Agent — detects surface defects on 316L grade production runs"
spec:
  type: ai-agent
  lifecycle: production
  owner: quality-team
  system: jslmind-platform
```

**Step 4: Commit**

```bash
git add catalog/agents/
git commit -m "catalog: add inventory-agent, cbm-agent, quality-agent Component entities"
```

---

### Task 6: Integration Component entities

**Files:**
- Create: `catalog/integrations/sap-mm-connector.yaml`
- Create: `catalog/integrations/kepware-opc-connector.yaml`

**Step 1: Create sap-mm-connector**

```yaml
# catalog/integrations/sap-mm-connector.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: sap-mm-connector
  description: Apache Camel route that polls SAP MM (MARA/EKPO/AUFK) every 60s and lands data in MinIO Bronze bucket
  annotations:
    camel/route-id: sap-to-bronze
    source/system: SAP
spec:
  type: integration
  lifecycle: production
  owner: operations-team
  system: jslmind-platform
```

**Step 2: Create kepware-opc-connector**

```yaml
# catalog/integrations/kepware-opc-connector.yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: kepware-opc-connector
  description: Apache Camel MQTT bridge that streams Kepware OPC-UA sensor tags to RedPanda in real time
  annotations:
    camel/route-id: kepware-to-kafka
    source/system: Kepware
spec:
  type: integration
  lifecycle: production
  owner: operations-team
  system: jslmind-platform
```

**Step 3: Commit**

```bash
git add catalog/integrations/
git commit -m "catalog: add sap-mm-connector and kepware-opc-connector integration entities"
```

---

### Task 7: Start Backstage and run verify

**Step 1: Start Backstage**

```bash
docker compose up -d backstage
```

**Step 2: Wait for it to be ready (Backstage takes ~60s on first start to run DB migrations)**

```bash
docker compose logs -f backstage
```

Wait until you see: `Listening on :7007`

**Step 3: Run verify script**

```bash
bash scripts/verify-phase3.sh
```

Expected output:
```
==> Phase 3 Verification — Backstage Agent Catalog

[OK]   Backstage health
[OK]   Domain: manufacturing
[OK]   System: jslmind-platform
[OK]   Agent: inventory-agent
[OK]   Agent: cbm-agent
[OK]   Agent: quality-agent
[OK]   Integration: sap-mm-connector
[OK]   Integration: kepware-opc-connector

─────────────────────────────────────────
Phase 3: 8 passed, 0 failed
READY TO PROCEED to Phase 4
```

**Step 4: If any entity is `not-found` — Backstage may still be ingesting**

Backstage processes catalog locations asynchronously after startup. If entities are missing, wait 30s and re-run:

```bash
sleep 30 && bash scripts/verify-phase3.sh
```

**Step 5: Open Backstage and confirm visually**

Open http://localhost:7007/catalog and confirm all 7 entities are visible under their respective kinds (Domain, System, Component).

**Step 6: Final commit**

```bash
git add .
git commit -m "feat: Phase 3 complete — Backstage catalog with 7 pre-seeded entities"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Backstage health` FAIL | Container still starting — wait 60s then retry |
| Entity `not-found` after health passes | Catalog ingestion is async — wait 30s and re-run |
| `backstage` DB error in logs | `docker compose exec postgres psql -U postgres -c "CREATE DATABASE backstage;"` then `docker compose restart backstage` |
| Config not picked up | Confirm `infra/backstage/app-config.yaml` is mounted at `/app/app-config.production.yaml` — check `docker compose config backstage` |
