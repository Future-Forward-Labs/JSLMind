# Phase 3 — Backstage Agent Catalog: Design

**Date:** 2026-03-08
**Phase:** 3 of 8
**Service:** Backstage (`docker compose up -d backstage`, port 7007)

---

## Scope

Stand up the Backstage agent catalog with 7 pre-seeded entities so the JSLMind demo has a
working catalog from Phase 3 onward. The Backstage webhook for dynamic agent auto-registration
(Dify → Backstage) is Phase 7's concern and is explicitly out of scope here.

---

## Approach

Option A — Root Location + individual entity files.

`catalog/catalog-info.yaml` is a Backstage `Location` kind that references all entity files via
relative `file:` paths. `app-config.yaml` points to this single root file. Phase 7 adds new
agent YAMLs and appends one line to the root Location.

---

## File Structure

```
catalog/
├── catalog-info.yaml                   ← Location kind (root)
├── domain/
│   └── manufacturing.yaml              ← Domain: manufacturing
├── system/
│   └── jslmind-platform.yaml           ← System: jslmind-platform
├── agents/
│   ├── inventory-agent.yaml            ← Component (ai-agent): inventory-agent
│   ├── cbm-agent.yaml                  ← Component (ai-agent): cbm-agent
│   └── quality-agent.yaml              ← Component (ai-agent): quality-agent
└── integrations/
    ├── sap-mm-connector.yaml           ← Component (integration): sap-mm-connector
    └── kepware-opc-connector.yaml      ← Component (integration): kepware-opc-connector

infra/backstage/
└── app-config.yaml                     ← Minimal Backstage config (DB + one location)

scripts/
└── verify-phase3.sh                    ← Health check + all 7 entities via Catalog API
```

---

## Entity Design

### Domain — `manufacturing`
- Top-level grouping for all JSL entities.

### System — `jslmind-platform`
- `spec.domain: manufacturing`
- `metadata.links`: Grafana, Langfuse, Backstage URLs

### Agent Components (×3)
- `kind: Component`
- `spec.type: ai-agent`
- `spec.system: jslmind-platform`
- `spec.owner`: maps to Keycloak group (`operations-team`, `finance-team`, `quality-team`)
- `metadata.annotations`:
  - `litellm/model` — model alias used by the agent
  - `temporal/task-queue` — Temporal task queue name
  - `demo/ui` — label surfaced in the JSLMind demo UI

### Integration Components (×2)
- `kind: Component`
- `spec.type: integration`
- `spec.system: jslmind-platform`
- `spec.owner: operations-team`
- `metadata.annotations`:
  - `camel/route-id` — Apache Camel route ID
  - `source/system` — upstream system (`SAP` or `Kepware`)

---

## Backstage app-config.yaml (minimal)

```yaml
app:
  baseUrl: http://localhost:7007

backend:
  baseUrl: http://localhost:7007
  database:
    client: pg
    connection:
      host: postgres
      port: 5432
      user: postgres
      password: ${POSTGRES_PASSWORD}
      database: backstage

catalog:
  rules:
    - allow: [Domain, System, Component, Location]
  locations:
    - type: file
      target: /catalog/catalog-info.yaml
```

---

## Verification (verify-phase3.sh)

Two checks:
1. Backstage HTTP health — `GET /healthcheck` returns 200.
2. All 7 entities confirmed — for each entity name, `GET /api/catalog/entities?filter=metadata.name=<name>` returns a non-empty array.

Entity names to check: `manufacturing`, `jslmind-platform`, `inventory-agent`, `cbm-agent`,
`quality-agent`, `sap-mm-connector`, `kepware-opc-connector`.

---

## Out of Scope (Phase 7)

- Backstage webhook endpoint for Dify agent auto-registration
- TechDocs, Scaffolder, or any plugins beyond the base catalog
