# Demo Shell — Design Document

**Date:** 2026-03-09
**Status:** Approved

---

## Goal

A lightweight React single-page app that acts as a single pane of glass for the JSLMind client demo. Replaces juggling 7+ browser tabs during the 45-minute walkthrough. Grows incrementally as each phase is completed.

---

## Architecture

```
Browser
  └── http://localhost:3000
        └── nginx:alpine (serves Vite build output)
              └── fetch() → existing service APIs (no backend)

Services called directly from browser:
  LiteLLM      http://localhost:4000
  Backstage     http://localhost:7007
  Qdrant        http://localhost:6333
  Langfuse      http://localhost:3002
  RAG Service   http://localhost:8001
  Camel         http://localhost:8090
  Kong          http://localhost:8000
```

No new backend. All live data via direct fetch() calls. No auth (consistent with all demo services).

---

## Layout

```
┌─────────────────────────────────────────────────────────────┐
│  JSLMind  [●Live]   Ops ₹18,400 | Fin ₹6,200 | Qual ₹3,100 │
├──────────┬──────────────────────────────────────────────────┤
│ Overview │                                                   │
│ RAG      │         Main Content Area                        │
│ Catalog  │                                                   │
│ Observe  │                                                   │
│ ──────── │                                                   │
│ Pipeline↓│                                                   │
│ OT/CBM ↓ │                                                   │
│ Agents ↓ │                                                   │
└──────────┴──────────────────────────────────────────────────┘
```

- **Top bar**: JSLMind logo, live system pulse dot, dept token budgets
- **Sidebar**: 4 active pillar links + 3 greyed "Coming Soon" entries for Phases 4, 5, 7
- **Main area**: pillar page with live widgets and service launch buttons

---

## Pages

### Overview (/)
- Service health grid — one card per service (green/amber/red dot, name, port, response time)
- Quick stats: vectors indexed, agents in catalog, LLM calls today
- Services: RAG, Qdrant, Camel, Backstage, LiteLLM, Langfuse, Grafana

### Hybrid RAG (/rag)
Active — Phase 6 complete.
- Live query input → POST /query → renders answer + source citations
- Stats bar: vectors indexed, documents in corpus
- Last indexed file (from Camel) + timestamp
- Launch buttons: Qdrant Dashboard, Langfuse Traces, RAG Swagger UI

### Agent Catalog (/catalog)
Active — Phase 3 complete.
- Card grid of catalog entities from Backstage API (name, kind, type, owner)
- Clicking a card shows entity metadata in a side drawer
- Launch button: Backstage full UI

### Observability (/observe)
Active — Phases 1+2 complete.
- Token budget progress bars per dept from LiteLLM spend API
- Last 5 LLM traces from Langfuse (model, latency, tokens, status)
- Launch buttons: Grafana, Langfuse, Prometheus, LiteLLM UI

---

## Coming Soon Pages (future phases)

| Sidebar Entry | Phase | Additions when unlocked |
|---|---|---|
| Medallion Pipeline | Phase 4 | MinIO bucket sizes, Airflow DAG status, Marquez lineage link |
| OT / CBM Streaming | Phase 5 | Live sensor chart (WebSocket), anomaly injection button, Temporal workflow link |
| Agent Builder | Phase 7 | Dify agent list, n8n workflow status, LangGraph MCP health |

Each future phase update: add page file, flip sidebar entry from "coming soon" to active.

---

## Tech Stack

| Concern | Choice | Reason |
|---|---|---|
| Framework | React 18 + Vite | Fast HMR, minimal config |
| Styling | Tailwind CSS | Utility classes, no CSS files to manage |
| Serving | nginx:alpine | Single container, serves static dist/ |
| State | React useState/useEffect | No Redux needed — each widget fetches independently |
| Charts | recharts | Lightweight, React-native, needed for Phase 5 sensor chart |

---

## File Structure

```
frontend/
├── index.html
├── vite.config.js
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── Dockerfile              ← multi-stage: node build → nginx serve
├── nginx.conf              ← SPA fallback (try_files → index.html)
└── src/
    ├── main.jsx
    ├── App.jsx             ← router + layout shell
    ├── components/
    │   ├── TopBar.jsx      ← logo, health pulse, token budgets
    │   ├── Sidebar.jsx     ← pillar nav + coming-soon badges
    │   ├── ServiceCard.jsx ← reusable health card
    │   └── LaunchButton.jsx
    └── pages/
        ├── Overview.jsx
        ├── HybridRAG.jsx
        ├── AgentCatalog.jsx
        └── Observability.jsx
```

---

## Docker Compose Integration

Add `frontend` service to `docker-compose.yml`:
```yaml
  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3000:80"
    networks: [jslmind]
    restart: unless-stopped
```

---

## Live Data API Calls

| Widget | Endpoint | Refresh |
|---|---|---|
| Service health | GET /health on each service | 30s |
| Token budgets | GET http://localhost:4000/spend/logs | 60s |
| Vector count | GET http://localhost:6333/collections/jsl_docs | 30s |
| Catalog entities | GET http://localhost:7007/api/catalog/entities | on mount |
| Recent traces | GET http://localhost:3002/api/public/traces | 60s |
| RAG query | POST http://localhost:8001/query | on demand |
| Camel health | GET http://localhost:8090/actuator/health | 30s |

---

## Phase Update Protocol

When a new phase is completed, update the demo shell by:
1. Create `src/pages/<PhaseName>.jsx` with live widgets for that phase
2. In `Sidebar.jsx`: flip the entry from `coming-soon` to active
3. Add API calls for that phase's services to the live data table above
4. Rebuild: `docker compose up -d --build frontend`

---

## Non-Goals

- No auth / login screen (all services are open in demo mode)
- No multi-collection RAG selector (noted for future phases)
- No real-time WebSocket until Phase 5 (OT/CBM)
- Not a replacement for Backstage, Langfuse, or Grafana — launch buttons only
