# JSLMind Demo Blueprint — v3
**Mindsprint × Jindal Stainless Limited | 7-Day Sprint | Local + AWS**

> **What changed in v3:** Replaced custom Agent Builder UI with **Dify** (self-serve, no-code layer) + **n8n** (automation trigger layer). Added layered agent architecture: Dify for business users → LangGraph/Temporal for platform engineering. Blueprint format changed to Markdown for Claude Code compatibility.

---

## Table of Contents

1. [Demo Philosophy](#1-demo-philosophy)
2. [Full Architecture](#2-full-architecture)
3. [WSO2 Capability → OSS Replacement Map](#3-wso2-capability--oss-replacement-map)
4. [Pillar 1 — Real-Time OT + CBM](#4-pillar-1--real-time-ot--cbm)
5. [Pillar 2 — Medallion Data Pipeline](#5-pillar-2--medallion-data-pipeline)
6. [Pillar 3 — Self-Serve Agent Builder (Dify)](#6-pillar-3--self-serve-agent-builder-dify)
7. [Pillar 4 — Hybrid RAG on JSL Docs](#7-pillar-4--hybrid-rag-on-jsl-docs)
8. [Integration Layer](#8-integration-layer)
9. [Agent Architecture — Layered Design](#9-agent-architecture--layered-design)
10. [Token Management & Gateway](#10-token-management--gateway)
11. [Infrastructure — Docker Compose + AWS](#11-infrastructure--docker-compose--aws)
12. [7-Day Timeline](#12-7-day-timeline)
13. [Team Composition](#13-team-composition)
14. [Risks & Mitigations](#14-risks--mitigations)
15. [Demo-Day Checklist](#15-demo-day-checklist)
16. [Production Migration Story](#16-production-migration-story)
17. [Claude Code Usage Guide](#17-claude-code-usage-guide)

---

## 1. Demo Philosophy

**Core principle:** Don't build a toy — build a scaled-down production system. Every component maps 1:1 to the production stack so JSL sees a real architecture, not a mockup.

- Synthetic data mirrors real JSL schemas (SAP table names: MARA, EKPO, AUFK)
- Same Docker containers deploy to AWS in ≤15 minutes — directly proving JSL's DevOps SLA
- Swap story for every demo component: "This runs locally today; same containers deploy to your on-prem K8s"
- All tools are OSS, self-hostable, on-premise sovereign — no cloud LLM dependency required

**Demo duration target:** 45 minutes total
- Catalog walkthrough: 5 min
- OT/CBM: 10 min
- Medallion pipeline: 8 min
- Agent builder (Dify): 10 min
- Hybrid RAG: 7 min
- Q&A buffer: 5 min

---

## 2. Full Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      JSL USERS / APPS                                │
│         Plant Managers · Finance · Operations · R&D                 │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│              BACKSTAGE PORTAL (Agent & Service Catalog)              │
│   Agent registry · Integration catalog · Data product discovery     │
│   Production: OpenChoreo on K8s (auto-registers everything)         │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                  KONG AI GATEWAY                                      │
│   Token budgets per dept · MCP exposure · RBAC · Audit trail        │
│                  LiteLLM Proxy                                       │
│   Model routing · Cost tracking · On-prem / cloud fallback          │
└──────────┬──────────────────────────────────┬───────────────────────┘
           │                                  │
┌──────────▼──────────────┐      ┌────────────▼──────────────────────┐
│  BUSINESS USER LAYER    │      │  PLATFORM ENGINEERING LAYER       │
│                         │      │                                   │
│  Dify (self-hosted)     │      │  LangGraph + Temporal             │
│  • No-code agent builder│      │  • Complex multi-step agents      │
│  • RAG on SOPs/specs    │ MCP  │  • Durable stateful workflows     │
│  • RBAC in OSS edition  │ ───▶ │  • Custom hybrid RAG              │
│  • Publishes as chat app│      │  • CBM, forecasting, R&D agents   │
│                         │      │                                   │
│  n8n (trigger layer)    │      │  Agents exposed as MCP tools      │
│  • SAP event → agent    │      │  consumable by Dify               │
│  • Schedule triggers    │      │                                   │
└─────────────────────────┘      └───────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                    OSS LLM ENGINE                                     │
│         vLLM / Ollama · Llama 3.1 70B · Qwen2.5 · Mistral 7B SLM  │
└──────────────────────────┬──────────────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────────────┐
│                ONEDATA PLATFORM (Medallion)                          │
│         Bronze → Silver → Gold → Platinum (Apache Iceberg)          │
│         Airflow · dbt · DuckDB · Great Expectations · Marquez       │
└──────────┬──────────────────────────────────┬───────────────────────┘
           │                                  │
┌──────────▼──────────────┐      ┌────────────▼──────────────────────┐
│  REAL-TIME INGESTION    │      │  BATCH INGESTION                  │
│  Apache Camel           │      │  Apache Camel                     │
│  MQTT → RedPanda        │      │  SAP RFC/OData → Bronze           │
│  (Kepware/Ignition OT)  │      │  SharePoint → Qdrant              │
│  PyFlink anomaly scoring│      │  Airflow-scheduled DAGs           │
└─────────────────────────┘      └───────────────────────────────────┘
```

---

## 3. WSO2 Capability → OSS Replacement Map

| WSO2 Capability | WSO2 Tool | Demo Stack | Production Stack | Fit |
|---|---|---|---|---|
| Agent & API Catalog | MCP Hub + Dev Portal | Backstage standalone | OpenChoreo on K8s | ✅ Full |
| No-code agent builder | WSO2 AI Agent Studio | **Dify (self-hosted)** | Dify cluster | ✅ Full |
| Automation trigger layer | WSO2 Integrator flows | **n8n (self-hosted)** | n8n cluster | ✅ Full |
| Stateful workflow orchestration | WSO2 BPMN | **Temporal OSS** | Temporal cluster | ✅ Full |
| Integration / EIP routing | WSO2 Micro Integrator | **Apache Camel** | Camel K on K8s | ✅ Full |
| Event routing & streaming | WSO2 Message Broker | **RedPanda** | Confluent / MSK | ✅ Full |
| API Gateway + token mgmt | WSO2 API Manager | **Kong AI Gateway** | Kong Enterprise | ✅ Full |
| LLM routing & cost control | WSO2 AI Gateway | **LiteLLM Proxy** | LiteLLM + Kong | ✅ Full |
| Identity / Agent IAM | WSO2 Identity Server | **Keycloak** | Keycloak cluster | ✅ Full |
| Observability | WSO2 Analytics | **Langfuse + Grafana** | Langfuse + Prometheus | ✅ Full |

---

## 4. Pillar 1 — Real-Time OT + CBM

**Tagline:** Sensor streams → Camel integration → anomaly detection → Temporal workflow → SAP PM notification

**Effort:** 3 days | **WOW moment:** Live anomaly injection + Temporal execution graph showing multi-step workflow

### Tech Stack

| Layer | Tool | Note |
|---|---|---|
| Data Source | Python MQTT publisher (simulated PLC/Kepware) | Mimics Ignition OPC-UA tag output |
| Integration | Apache Camel (MQTT → RedPanda route) | Protocol mediation — production-identical to real Kepware |
| Streaming | RedPanda (single binary, zero config) | Kafka-compatible, saves 1 day vs full Kafka setup |
| Stream Processing | PyFlink consumer + Isolation Forest | Real-time anomaly scoring on sensor windows |
| Workflow | Temporal — `CBMWorkflow` | Durable 5-step workflow (see below) |
| ML Model | Isolation Forest + LSTM (scikit-learn + PyTorch) | Pretrained on synthetic steel plant data |
| Alerting | FastAPI WebSocket → demo UI | Real-time alert feed with Temporal trace link |
| Storage | TimescaleDB (Bronze landing) | Time-series optimised; Iceberg for historical |

### CBMWorkflow (Temporal)

```
DetectAnomaly → ScoreConfidence → CreateSAPNotification → WaitForApproval → ScheduleMaintenance
     ↑                                      ↑
  Kafka event                         Camel RFC stub
  (PyFlink)                           (simulated SAP PM)
```

- **Trigger:** Kafka anomaly event from PyFlink
- **Durability:** Survives system restart — resumes from last successful step
- **Human-in-loop:** WaitForApproval step pauses until maintenance manager approves

### Demo Script

1. Simulate 5 PLC tags live: temperature, vibration, current, pressure, RPM
2. Show Apache Camel route: `MQTT → transform → RedPanda topic: plant.sensors`
3. **Inject anomaly spike** via "Simulate Failure" button in demo UI
4. PyFlink scores anomaly: bearing #3 — 94% confidence
5. Temporal `CBMWorkflow` kicks off — open Temporal UI, show execution graph
6. Workflow step: SAP PM notification auto-created (Camel RFC stub fires)
7. Alert appears: "Roll bearing #3 — predicted failure in 48hrs"

---

## 5. Pillar 2 — Medallion Data Pipeline

**Tagline:** Camel extracts SAP data → Airflow orchestrates → Bronze → Silver → Gold → Platinum

**Effort:** 2 days | **WOW moment:** Live lineage graph click-through Gold → raw SAP source

### Tech Stack

| Layer | Tool | Note |
|---|---|---|
| Source Simulation | CSV/JSON mimicking SAP MM/SD | Field names match real SAP: MARA, EKPO, AUFK |
| Integration | Apache Camel (SAP → MinIO route) | Simulates real SAP OData/RFC extraction pattern |
| Orchestration | Apache Airflow (Astro CLI) | 3 DAGs: ingest, transform, curate |
| Storage | MinIO + Apache Iceberg | 4 medallion layers as Iceberg tables |
| Transform | dbt Core (runs inside Airflow) | Bronze→Silver→Gold SQL with built-in lineage |
| Query Engine | DuckDB (in-process) | Sub-second ad-hoc SQL on Iceberg files |
| Data Quality | Great Expectations + dbt tests | Pass/fail per layer in demo UI |
| Lineage UI | OpenLineage + Marquez | Click from `costing_gold` back to SAP source |

### Medallion Layer Design

```
Bronze          Silver              Gold                Platinum
────────────    ────────────────    ─────────────────   ──────────────────
Raw SAP CSV  →  Dedup + typecast →  Aggregated by    →  AI-ready features
Raw sensor       Null handling       grade + date        for ML models
Raw docs         Schema mapping      Cost variance       Embeddings
                 DQ validated        KPIs computed       Vector indexed
```

### Camel Route — SAP → Bronze

```java
from("timer:sap-poll?period=60000")
  .to("direct:fetch-sap-materials")
  .unmarshal().json(MaterialList.class)
  .process(sapSchemaMapper)        // field name normalisation
  .marshal().json()
  .to("minio://bronze-sap-mm?autoCreateBucket=true");
```

### Demo Script

1. Camel route extracts "SAP MM data" → lands in Bronze MinIO bucket
2. Airflow DAG auto-triggers on file arrival event
3. dbt Silver: dedup, type cast, null handling — show transformation SQL
4. dbt Gold: daily production cost aggregated by stainless grade
5. Data quality dashboard: 98.7% pass, 2 warnings flagged
6. **Click Marquez lineage graph:** trace `costing_gold` → Bronze → SAP source
7. DuckDB query: `SELECT grade, avg_cost FROM gold.production_cost` — instant result

---

## 6. Pillar 3 — Self-Serve Agent Builder (Dify)

**Tagline:** Business user builds a production AI agent in <5 minutes — no code — registered in catalog automatically

**Effort:** 2 days | **WOW moment:** Plant manager builds Grade 316L quality agent in 4 minutes, agent appears in Backstage catalog immediately

### Why Dify (not custom UI)

| Requirement | Dify OSS | Custom Build |
|---|---|---|
| No-code visual builder | ✅ Built-in | ❌ 2-3 weeks to build |
| RBAC + audit logs | ✅ In OSS edition | ❌ Custom dev required |
| RAG integration | ✅ Native | ❌ Wire yourself |
| Self-hosted, on-prem | ✅ Docker/K8s | ✅ |
| MCP tool calling | ✅ Supported | ❌ Custom dev required |
| Exposes agents as APIs | ✅ One-click publish | ❌ Custom dev required |
| Backstage auto-registration | ⚠️ Custom webhook needed | ⚠️ Custom webhook needed |

**Dify covers the no-code business user layer. LangGraph/Temporal covers the complex engineering layer. They connect via MCP.**

### Agent Layer Design

```
Business User (JSL plant manager)
        │
        ▼
  Dify Agent Builder
  "Grade 316L Quality Monitor"
  • Data source: Gold.production_quality (DuckDB)
  • RAG: Grade spec SOPs (Qdrant)
  • Tool: check_surface_defect_rate (MCP)
        │
        │ calls via MCP
        ▼
  LangGraph Agent (Mindsprint-built)
  SurfaceInspectionAgent
  • Custom hybrid RAG retriever (RRF)
  • Isolation Forest model
  • Temporal workflow for alerts
        │
        ▼
  Backstage Catalog
  Auto-registered: "grade-316l-quality-agent"
  Owner: quality-team | Status: deployed
```

### n8n — Automation Trigger Layer

n8n is **not** the agent builder — it's the **trigger and automation layer** that connects business events to agents:

```
SAP stock level drops below threshold
        │ (SAP webhook / polling)
        ▼
   n8n Workflow
   "Inventory Alert Trigger"
        │
        ├── Call Dify InventoryAgent API
        ├── Post result to Teams channel
        └── Log to audit trail
```

**n8n use cases in JSLMind:**
- SAP event → trigger Dify agent
- Schedule: daily 6am → run CostingAnalytics agent  
- File drop in SharePoint → trigger RAG ingestion pipeline
- Temporal workflow completion → send Teams notification

### Pre-built Dify Templates for Demo

| Template | Data Source | Goal | Department |
|---|---|---|---|
| Inventory Optimization | Gold.inventory (DuckDB) | Alert when stock < 30-day forecast | Operations |
| Grade Quality Monitor | Gold.quality + Qdrant (specs) | Flag surface defect rate anomalies | Quality |
| Cost Variance Analyst | Gold.production_cost | Explain cost variance vs standard | Finance |

### Demo Script

1. Open Backstage portal — show 3 pre-built agents in catalog
2. Click "New Agent" in Dify → Agent Studio opens
3. Select template: "Inventory Optimization"
4. Connect data source: `gold.production_inventory` (auto-discovered from catalog)
5. Define goal in plain English: "Alert when stock < 30-day demand forecast"
6. Deploy — **agent auto-registers in Backstage catalog** (webhook to catalog-info.yaml)
7. Show n8n: SAP stock event triggers the agent on schedule
8. Agent output: "Cold-rolled coil Grade 304 — reorder in 6 days"

---

## 7. Pillar 4 — Hybrid RAG on JSL Docs

**Tagline:** Ask questions across SOPs, quality specs, and plant manuals — with full source provenance

**Effort:** 1.5 days | **WOW moment:** Camel auto-ingests live doc drop + cross-document citation heatmap

### Tech Stack

| Layer | Tool | Note |
|---|---|---|
| Document Corpus | 20-30 synthetic JSL docs (PDF, Word, Excel) | SOPs, grade specs (304/316L/430), maintenance manuals |
| Integration | Apache Camel (file watcher → Qdrant pipeline) | Polls for new docs, triggers ingestion — production DMS pattern |
| Document Parsing | Unstructured.io OSS + PyMuPDF | PDF with tables, images, mixed content |
| Embedding Model | BGE-M3 (local via Ollama) | Multilingual, no external API — on-prem sovereign |
| Vector Store | Qdrant (Docker, single node) | Lightweight, Rust-native, production-grade |
| Keyword Search | BM25 via rank_bm25 | Hybrid retrieval — dense + sparse |
| RAG Orchestration | LlamaIndex with RRF fusion retriever | Semantic + keyword + metadata filter |
| LLM + Citations | Claude API / Mistral 7B | Every answer cites doc name, section, page |

### Hybrid Retrieval Architecture

```
User Query: "Max carbon content for Grade 316L?"
        │
        ├── Dense retrieval (Qdrant/BGE-M3) → top-k semantic chunks
        ├── Sparse retrieval (BM25) → top-k keyword chunks  
        └── Metadata filter (grade=316L, doc_type=spec)
                │
                ▼
        RRF Fusion (Reciprocal Rank Fusion)
                │
                ▼
        Re-ranked unified chunk list
                │
                ▼
        LLM generates answer with citations:
        "Max carbon: 0.03% (Source: Grade_316L_Spec.pdf, Section 3.2, Page 4)"
```

### Demo Script

1. Camel file watcher: drop "Grade 316L Specification" PDF → auto-ingests into Qdrant
2. Ask: "What is the max carbon content for Grade 316L?"
3. Show hybrid retrieval: semantic hits (Qdrant) + keyword hits (BM25) fused
4. Answer with citation: "Source: Grade_316L_Spec.pdf, Section 3.2, Page 4"
5. Cross-doc query: "Compare surface finish requirements for 304 vs 316L"
6. Show **retrieval heatmap** — chunk contribution scores visualised
7. Drop a new maintenance SOP live — immediately queryable, no reindex wait

---

## 8. Integration Layer

### Apache Camel — EIP Integration Routes

Apache Camel replaces WSO2 Micro Integrator. Same code runs in production on Camel K (Kubernetes operator).

| Route Name | From | Transform | To | Pillar |
|---|---|---|---|---|
| `sap-to-bronze` | SAP RFC/OData (simulated) | JSON flatten + schema mapping | MinIO Bronze bucket | Medallion |
| `kepware-to-kafka` | MQTT (OPC-UA simulation) | Tag normalization + timestamp | RedPanda: plant.sensors | OT/CBM |
| `sharepoint-to-qdrant` | File watch / OneDrive poll | File type detection + metadata | Qdrant ingestion queue | RAG |
| `temporal-to-sap-pm` | Temporal activity signal | Work order payload mapping | SAP PM RFC stub | OT/CBM |

**Production story:** Swap simulated endpoints for real SAP RFC, Kepware OPC-UA, SharePoint Graph API connectors. Zero code change — config only. Mindsprint's existing SAP integration work is directly reusable here.

### Temporal — Workflow Orchestration

Temporal replaces WSO2 BPMN. Key differentiator: AI workflows where steps can take seconds to hours, with full durability.

**`CBMWorkflow`**
```
DetectAnomaly → ScoreConfidence → CreateSAPNotification → WaitForApproval → ScheduleMaintenance
Trigger: Kafka anomaly event | SLA: Durable — survives system restart
```

**`InventoryAgentWorkflow`**
```
FetchGoldData → RunForecast → CompareStockLevels → GenerateAlert → LogDecision
Trigger: Daily schedule (n8n) | SLA: Resumable — retries on LLM timeout
```

**`CostingAnalyticsWorkflow`**
```
ExtractSAPCO → RunVarianceAnalysis → LLMNarrative → HumanReview → SendReport
Trigger: Month-end SAP event | SLA: Human-in-loop — CFO approval step
```

### Backstage — Agent & Service Catalog

Pre-seeded entities for demo:

| Type | Name | Owner | Status |
|---|---|---|---|
| Agent | `inventory-optimization-agent` | operations-team | deployed |
| Agent | `cbm-anomaly-agent` | maintenance-team | deployed |
| Agent | `grade-316l-quality-agent` | quality-team | deployed |
| Agent | `costing-analytics-agent` | finance-team | staging |
| Integration | `sap-mm-connector` | platform-team | deployed |
| Integration | `kepware-opc-connector` | platform-team | deployed |
| DataProduct | `gold-production-cost` | data-team | deployed |

**Production story:** Replace Backstage standalone with OpenChoreo. All agents auto-register via CRDs on deploy. Same MCP Hub experience as WSO2 — fully OSS.

---

## 9. Agent Architecture — Layered Design

### The Core Decision: Who Builds Agents?

```
PERSONA                    TOOL              USE CASE
─────────────────────────────────────────────────────────
JSL plant manager    →    Dify             Simple RAG agent on grade specs
JSL ops analyst      →    Dify + n8n       Scheduled inventory report agent
Mindsprint engineer  →    LangGraph        Complex CBM multi-step agent
Platform team        →    Temporal         Durable orchestration wrapper
```

### Build vs Buy Decision

| Component | Decision | Rationale |
|---|---|---|
| Agent execution engine | **Build** (LangGraph + Temporal) | Need custom RAG, full control, production durability |
| Business user agent builder | **Buy** (Dify) | RBAC, audit, RAG, MCP all in OSS — 3 weeks of build saved |
| Automation trigger layer | **Buy** (n8n) | 400+ connectors, visual triggers, self-hosted |
| Agent catalog & discovery | **Buy** (Backstage/OpenChoreo) | Standard platform capability, not differentiating |
| Custom RAG retriever | **Build** (RRF hybrid) | JSL's hybrid retrieval needs custom tuning |
| Agent Studio config UI | **Thin build** (React wrapper) | Config UI only — data source picker + goal → generates LangGraph scaffold |

### Dify → LangGraph MCP Bridge

```python
# In Dify: register LangGraph agent as an MCP tool
tool_config = {
    "name": "surface_inspection_agent",
    "description": "Runs real-time surface defect analysis on production line data",
    "endpoint": "http://langgraph-service:8000/mcp/tools/surface_inspection",
    "auth": "bearer",
    "schema": {
        "grade": "string",
        "line_id": "string", 
        "time_window_minutes": "integer"
    }
}
# Business user in Dify calls this tool with no-code config
# LangGraph executes the complex multi-step logic underneath
```

---

## 10. Token Management & Gateway

### Architecture: Kong AI Gateway + LiteLLM Proxy

These are **layered**, not competing:

```
JSL Departments (Operations, Finance, Quality, Sales)
        │
        ▼
Kong AI Gateway (enterprise perimeter)
• Azure AD / Keycloak SSO
• Department-level API keys
• Token budget enforcement per dept
• MCP server governance
• Audit trail (all LLM calls logged)
        │
        ▼
LiteLLM Proxy (LLM-aware layer)
• Model routing: on-prem Llama → fallback Claude API
• Per-model cost attribution
• Semantic caching (Redis)
• Langfuse integration for traces
        │
        ▼
vLLM / Ollama (on-prem)     Claude API (optional fallback)
Llama 3.1 70B / Mistral 7B  
```

### LiteLLM Config (Demo-Ready)

```yaml
# litellm_config.yaml
model_list:
  - model_name: jsl-primary
    litellm_params:
      model: ollama/mistral
      api_base: http://ollama:11434

  - model_name: jsl-fallback
    litellm_params:
      model: claude-sonnet-4-20250514
      api_key: os.environ/ANTHROPIC_API_KEY

router_settings:
  routing_strategy: least-busy
  fallbacks: [{"jsl-primary": ["jsl-fallback"]}]

litellm_settings:
  success_callback: ["langfuse"]

general_settings:
  master_key: sk-jsl-master
  database_url: postgresql://postgres:5432/litellm

# Virtual keys per department
# POST /key/generate {"team_id": "operations", "max_budget": 50.0, "budget_duration": "30d"}
# POST /key/generate {"team_id": "finance", "max_budget": 30.0, "budget_duration": "30d"}
```

**Demo talking point:** Show the LiteLLM dashboard — "Operations team has consumed ₹18,400 of inference this month. Finance team is at ₹6,200. We can set hard cutoffs per team so no department goes rogue."

---

## 11. Infrastructure — Docker Compose + AWS

### Docker Compose Stack (Full v3)

```yaml
services:
  # Event streaming
  redpanda:          # Kafka-compatible, zero Zookeeper — single binary
  
  # Object storage (Medallion layers)
  minio:             # S3-compatible — Bronze/Silver/Gold/Platinum as Iceberg tables
  
  # Pipeline orchestration
  airflow-webserver:
  airflow-scheduler: # dbt runs inside Airflow DAGs
  
  # Workflow orchestration
  temporal:          # temporal server start-dev — running in 2 minutes
  temporal-ui:       # Visual execution graph
  
  # Databases
  postgres:          # Airflow + Temporal + Dify + Backstage metadata
  timescaledb:       # OT time-series (PLC sensor tags)
  redis:             # LiteLLM semantic cache + n8n queue
  
  # AI / RAG
  qdrant:            # Vector store for RAG
  ollama:            # Local LLM: Mistral 7B / Llama 3.1 8B
  litellm-proxy:     # Model routing + token budgets + Langfuse
  
  # Agent building
  dify:              # Self-serve no-code agent builder (business users)
  n8n:               # Automation trigger layer (event → agent)
  
  # Integration
  camel-integration: # SpringBoot app: 4 routes (SAP, MQTT, SharePoint, SAP PM)
  
  # Catalog & discovery
  backstage:         # Agent & service catalog portal
  
  # Observability
  marquez:           # OpenLineage — data lineage UI
  langfuse:          # LLM observability — traces, evals, costs
  
  # API & frontend
  kong:              # AI Gateway (token mgmt, RBAC, MCP)
  fastapi-backend:   # Agent tools + RAG API + WebSocket endpoints
  react-frontend:    # Unified demo UI
```

### AWS Deployment

| Service | Purpose | Est. Cost |
|---|---|---|
| EC2 g4dn.xlarge | Ollama + Mistral 7B (on-prem LLM story) | ~$0.526/hr |
| ECS Fargate | All service containers (Camel, Dify, n8n, FastAPI, React) | ~$0.04/vCPU-hr |
| MSK Serverless | RedPanda replacement (or keep RedPanda on EC2) | ~$0.10/hr |
| RDS PostgreSQL t3.medium | Airflow + Temporal + Dify + Backstage state | ~$0.068/hr |
| S3 | MinIO replacement for Iceberg storage | ~$0.023/GB |
| ElastiCache Redis t3.micro | LiteLLM cache + n8n queue | ~$0.017/hr |
| EC2 t3.large | Backstage + Temporal UI + Marquez + Langfuse | ~$0.083/hr |

---

## 12. 7-Day Timeline

### Day 1 — Infra + Catalog + Integration Skeleton
- [ ] Docker Compose: all services up (RedPanda, MinIO, Airflow, Temporal, Qdrant, Dify, n8n, Postgres, Redis)
- [ ] Backstage: standalone deploy + seed 7 catalog entities (`catalog-info.yaml` per entity)
- [ ] Apache Camel: project init + 4 route skeletons (SAP, MQTT, SharePoint, SAP PM stub)
- [ ] Temporal: `temporal server start-dev` verified, `CBMWorkflow` skeleton defined

### Day 2 — Medallion Pipeline
- [ ] Camel SAP extraction route: CSV → Bronze MinIO bucket, end-to-end tested
- [ ] Airflow DAGs: ingest (Camel-triggered), transform (dbt), curate (quality checks)
- [ ] dbt models: Bronze → Silver → Gold (`production_cost`, `inventory`, `quality` tables)
- [ ] Marquez lineage: OpenLineage wired into Airflow + dbt, lineage visible in UI
- [ ] Great Expectations: 3 DQ checks per layer (nulls, schema, range)

### Day 3 — OT/CBM Streaming + Temporal
- [ ] MQTT publisher: 5 synthetic PLC tags publishing at 1Hz
- [ ] Camel MQTT → RedPanda route: live, verified with `rpk topic consume`
- [ ] PyFlink consumer: Isolation Forest anomaly scoring on 30-second windows
- [ ] Temporal `CBMWorkflow`: all 5 steps implemented, Camel SAP PM stub activity working
- [ ] Anomaly injection button: fires test event, Temporal workflow visible in UI

### Day 4 — RAG Pipeline
- [ ] Camel file watcher: drop PDF → triggers Unstructured parsing → BGE-M3 embeddings → Qdrant
- [ ] Hybrid retrieval: Qdrant dense + BM25 sparse + RRF fusion — tested with 5 sample queries
- [ ] Synthetic document corpus: 20 JSL-like docs (grade specs 304/316L/430, SOPs, manuals)
- [ ] LlamaIndex RAG endpoint: FastAPI `/rag/query` with citations in response

### Day 5 — Dify + n8n + Agent Layer
- [ ] Dify: 3 agent templates created (Inventory, Quality Monitor, Cost Analyst)
- [ ] Dify: Gold layer DuckDB tables connected as data sources
- [ ] Dify → Backstage webhook: agent deploy triggers catalog-info.yaml registration
- [ ] n8n: 2 trigger workflows (SAP stock event → Dify agent, daily schedule → Costing agent)
- [ ] LangGraph `InventoryAgent`: wraps as Temporal `InventoryAgentWorkflow`, MCP endpoint exposed

### Day 6 — Unified UI + Token Management + Polish
- [ ] LiteLLM proxy: Ollama + Claude fallback, virtual keys per 3 demo departments
- [ ] Kong: wired in front of LiteLLM, token budget policies per dept key
- [ ] Unified React demo UI: 4-pillar navigation, Backstage embed, Temporal UI link, Langfuse link
- [ ] WebSocket: live sensor feed + anomaly alert panel in demo UI
- [ ] End-to-end walkthrough rehearsal — time each section

### Day 7 — AWS Deployment + Rehearsal
- [ ] AWS: EC2 g4dn.xlarge (Ollama) + ECS (all services) + S3 (MinIO replacement)
- [ ] Full walkthrough × 2 — fix any rough edges from rehearsal
- [ ] Demo-day checklist complete (see Section 15)
- [ ] Backup URL ready (AWS) in case local Docker issues

---

## 13. Team Composition

| Role | Focus | Days |
|---|---|---|
| Integration Engineer | Apache Camel routes (SAP, MQTT, SharePoint) + Temporal workflows + n8n triggers | 5 |
| Data Engineer | Medallion pipeline (Airflow + dbt + MinIO + Iceberg + Marquez + DQ) | 5 |
| ML/AI Engineer | RAG pipeline + LangGraph agents + anomaly detection + LiteLLM/Kong | 5 |
| Full-Stack / Platform | React demo UI + Backstage catalog + Dify setup + Docker Compose + AWS | 5 |

**Total:** 4 engineers × 5 days = 20 person-days

**Note:** Integration Engineer and Data Engineer can share Camel work on Day 1. ML/AI Engineer sets up Dify on Day 5 while Full-Stack builds the Backstage webhook integration simultaneously.

---

## 14. Risks & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| Temporal adds Day 1 infra complexity | Low | `temporal server start-dev` — zero config, runs in 2 min |
| Dify setup (first-time config) | Medium | Use official Docker Compose from Dify docs, pre-test on Day 1. Allocate 2hrs for initial setup |
| Backstage agent auto-registration | Medium | Use simple webhook: agent deploy calls FastAPI endpoint that writes `catalog-info.yaml` and commits to Git. Backstage auto-refreshes |
| Camel routes need SAP test data | Low | Mock SAP RFC responses with WireMock container. Camel route identical — only backend differs |
| LLM latency on local Mistral 7B | Medium | Use Claude API for demo responses. LiteLLM makes swap transparent. Frame as "production uses on-prem Llama 3.1" |
| n8n overclaiming as agent builder | Low | In demo script, clearly position n8n as trigger layer, Dify as agent builder. Never call n8n an "agent" |
| Too many UI windows in demo | Medium | Single React app with embedded iframes/links to Backstage, Temporal UI, Dify, Langfuse. One screen, one narrative |
| JSL asks for real SAP data | Medium | Synthetic data mirrors SAP MM schema exactly: MARA, EKPO, AUFK table/field names match |
| 5-min agent SLA claim | Low | Demo Dify template (pre-configured, 1-click) — genuinely takes 3-4 minutes. Note custom agents need 15-20 min |

---

## 15. Demo-Day Checklist

### T-1 Day
- [ ] Full rehearsal × 2 — time each section, target ≤45 min total
- [ ] AWS backup deployment live, URL noted
- [ ] All synthetic data pre-loaded (don't rely on live generation during demo)
- [ ] Dify 3 templates pre-configured and tested end-to-end
- [ ] n8n 2 trigger workflows active and tested

### T-1 Hour
- [ ] Temporal dev server running — seed all 3 workflows with sample execution history
- [ ] Backstage catalog shows all 7 entities with correct status
- [ ] Camel routes healthy: check `http://camel:8080/actuator/health`
- [ ] RedPanda consumer running — sensor data flowing on `plant.sensors` topic
- [ ] LLM pre-warm: run 1 dummy query through LiteLLM proxy (first inference is slow)
- [ ] RAG pre-tested: "What is the max carbon content for Grade 316L?" returns correct answer
- [ ] Anomaly injection button tested × 3 in rehearsal
- [ ] Marquez lineage graph zoomed to correct level before screen share
- [ ] Langfuse dashboard loaded, showing recent traces

### During Demo
- [ ] Open Backstage first — set the catalog context before showing any pipeline
- [ ] Fire anomaly injection exactly when JSL's technical lead is watching the Temporal UI
- [ ] For RAG, use JSL-specific grade names (304, 316L, 430) in queries — not generic examples
- [ ] Show LiteLLM token budget dashboard: "Operations team at ₹18,400 this month"
- [ ] Close with OpenChoreo / WSO2 production path slide — anchor the full vision

---

## 16. Production Migration Story

Every demo component has a clear production upgrade path. Use this table when JSL asks "what does production look like?"

| Demo Component | Production Upgrade | Effort |
|---|---|---|
| RedPanda (Docker) | Confluent Platform / MSK | Config change only |
| MinIO (Docker) | ADLS-Gen2 / S3 | Config change only |
| Ollama (single node) | vLLM cluster on GPU servers | Infra change, same API |
| Backstage standalone | OpenChoreo on K8s | Auto-registers everything via CRDs |
| Temporal dev server | Temporal cluster (3 nodes) | Helm chart deployment |
| Apache Camel (SpringBoot) | Camel K on Kubernetes | Same routes, K8s operator |
| Dify (single Docker) | Dify cluster (HA) | Docker Compose → K8s Helm |
| n8n (single Docker) | n8n cluster with queue mode | Config change + Redis queue |
| Kong OSS | Kong Enterprise / WSO2 APIM | License + config migration |
| DuckDB (in-process) | Trino cluster (federated SQL) | Query syntax compatible |

**Core message:** "Everything you see is containerised. We replace the Docker Compose file with Kubernetes manifests. OpenChoreo wraps the whole thing and gives you GitOps, catalog, and governance automatically. Zero rewrite of application code."

---

## 17. Claude Code Usage Guide

This section explains how to use this blueprint effectively with Claude Code for building the JSLMind demo.

### Sharing This Blueprint with Claude Code

**Option 1 — Direct file reference (recommended)**

Place this file in your project root and reference it in CLAUDE.md:

```markdown
# CLAUDE.md

## Project Context
This project builds the JSLMind demo for Jindal Stainless Limited.
Read JSLMind_Demo_Blueprint.md before starting any task.

## Architecture
- See Section 2 for full architecture
- See Section 8 for integration layer (Camel routes, Temporal workflows, Backstage)
- See Section 9 for agent architecture decisions (Dify vs LangGraph)

## Key Decisions Already Made
- Agent builder: Dify (not custom UI) — see Section 6
- Trigger layer: n8n (not Temporal) — see Section 9
- Integration: Apache Camel (not custom connectors) — see Section 8
- Token management: LiteLLM + Kong layered — see Section 10
```

**Option 2 — Project knowledge base**

In Claude Code, use `/add` to add this file to the project context:
```
/add JSLMind_Demo_Blueprint.md
```

Claude Code will reference it for all subsequent tasks in the project.

**Option 3 — Task-specific context injection**

For specific tasks, reference sections directly:
```
Implement the Apache Camel SAP-to-Bronze route described in 
Section 8 of JSLMind_Demo_Blueprint.md. Use the Java DSL 
example as the starting pattern. Target: MinIO Bronze bucket.
```

### Effective Prompts for Each Pillar

**Scaffold the full project:**
```
Using JSLMind_Demo_Blueprint.md as the spec, create the project 
directory structure and Docker Compose file for the full demo stack. 
Include all services from Section 11.
```

**Implement Camel routes:**
```
Implement all 4 Apache Camel integration routes from Section 8 
of the blueprint. Use SpringBoot + camel-spring-boot-starter. 
Create a separate RouteBuilder class per route.
```

**Build Temporal workflows:**
```
Implement CBMWorkflow, InventoryAgentWorkflow, and 
CostingAnalyticsWorkflow from Section 8 using the Temporal 
Java SDK. Include activity stubs for external calls.
```

**Set up Dify templates:**
```
Create Dify DSL YAML definitions for the 3 agent templates 
in Section 6: Inventory Optimization, Grade Quality Monitor, 
and Cost Variance Analyst. Include tool definitions for 
DuckDB Gold layer queries and Qdrant RAG.
```

**Build the RAG pipeline:**
```
Implement the hybrid RAG pipeline from Section 7. Use LlamaIndex 
with a custom RRF fusion retriever combining Qdrant (dense) and 
BM25 (sparse). Expose as FastAPI endpoint /rag/query with 
citation metadata in response.
```

**Wire LiteLLM + Kong:**
```
Create litellm_config.yaml from Section 10 with Ollama as 
primary and Claude API as fallback. Add virtual key generation 
script for 3 departments (operations, finance, quality) with 
monthly budget limits.
```

### Claude Code Workflow Tips

1. **Start with the Docker Compose** — get all services running before building application code
2. **Use the blueprint sections as task boundaries** — one PR per pillar keeps scope clear
3. **Reference specific line items in tasks** — "implement the 5-step CBMWorkflow from Section 8" is better than "build the CBM workflow"
4. **Keep CLAUDE.md updated** — as decisions evolve during build, update the blueprint and CLAUDE.md so Claude Code stays in sync
5. **Tag production vs demo differences** — use `# DEMO:` comments in code where production would differ (e.g., mock SAP endpoints)
