# CLAUDE.md — JSLMind Demo Project

## Read First
Before starting any task, read `JSLMind_Demo_Blueprint.md` in this repo for full architecture,
component decisions, Camel routes, Temporal workflows, demo scripts, and the 7-day timeline.

---

## Project Overview

**Client:** Jindal Stainless Limited (JSL) — India's largest stainless steel manufacturer
**Deliverable:** On-premise enterprise AI platform demo — JSLMind
**Sprint:** 7 days, 4 engineers, local Docker Compose + AWS backup
**Goal:** Win fixed-bid RFP with IP transfer. Demo runs as a 45-minute live walkthrough.

---

## Architecture Decisions (Do Not Re-litigate)

| Decision | Choice | Reason |
|---|---|---|
| No-code agent builder | **Dify (self-hosted)** | RBAC + audit in OSS edition, RAG native, MCP tool calling, saves 3 weeks of custom build |
| Automation trigger layer | **n8n (self-hosted)** | SAP events → agents, scheduling, 400+ connectors. NOT the agent builder |
| Complex agent execution | **LangGraph + Temporal** | Stateful multi-step, durable, custom hybrid RAG |
| Integration / EIP | **Apache Camel (SpringBoot)** | SAP RFC/OData, MQTT/OPC-UA, SharePoint — production-identical routes |
| Event streaming | **RedPanda** | Kafka-compatible, single binary, zero config for demo |
| Workflow orchestration | **Temporal OSS** | `temporal server start-dev` for demo, cluster for production |
| RAG retriever | **LlamaIndex RRF** | Qdrant dense + BM25 sparse, reciprocal rank fusion |
| Vector store | **Qdrant** | Docker single node for demo |
| Embeddings | **BGE-M3 via Ollama** | On-prem sovereign, no external API |
| LLM (demo) | **Claude API via LiteLLM** | Fast, reliable for demo. Frame as on-prem Llama 3.1 in production |
| LLM (production) | **vLLM + Llama 3.1 70B + Mistral 7B** | On-prem sovereign on JSL GPU servers |
| Token management | **LiteLLM + Kong layered** | LiteLLM: model routing + cost attribution. Kong: dept budgets + RBAC + audit |
| Agent catalog | **Backstage standalone** | Pre-seeded catalog-info.yaml entities. Production: OpenChoreo on K8s |
| Data platform | **Iceberg on MinIO + Airflow + dbt** | Medallion: Bronze→Silver→Gold→Platinum |
| Lineage | **OpenLineage + Marquez** | Wired into Airflow + dbt |
| Observability | **Langfuse + Grafana** | LLM traces + infra metrics |
| Identity | **Keycloak** | Azure AD bridge for JSL SSO |

---

## What n8n Is (and Is Not)

- **IS:** Automation trigger layer — SAP event fires → calls Dify agent API → posts to Teams
- **IS:** Scheduling layer — daily 6am → runs Costing Analytics agent
- **IS NOT:** An agent builder. Never describe n8n as building or running agents.

---

## What Dify Is (and Is Not)

- **IS:** The no-code agent builder for JSL business users (plant managers, ops analysts)
- **IS:** The self-serve layer — business user builds an agent in <5 minutes
- **IS NOT:** The execution engine for complex agents. Dify calls LangGraph agents as MCP tools.

---

## Layered Agent Architecture

```
JSL Business User
      │
      ▼
Dify (no-code agent builder)
• Connects to Gold layer DuckDB tables
• RAG on SOPs / grade specs (Qdrant)
• Calls LangGraph agents as MCP tools
      │ MCP
      ▼
LangGraph Agent (Mindsprint-built)
• Custom RRF hybrid RAG
• Temporal workflow wrapper (durable)
• Isolation Forest / LSTM models
      │
      ▼
Backstage Catalog (auto-registered on deploy)
```

---

## Demo Pillars

| Pillar | Core Tools | WOW Moment | Blueprint Section |
|---|---|---|---|
| 1 — Real-Time OT + CBM | MQTT → Camel → RedPanda → PyFlink → Temporal | Live anomaly injection + Temporal execution graph | Section 4 |
| 2 — Medallion Pipeline | Camel → MinIO → Airflow → dbt → Marquez | Click lineage Gold → raw SAP source | Section 5 |
| 3 — Self-Serve Agent Builder | Dify + n8n + Backstage | Plant manager builds agent in 4 min, appears in catalog | Section 6 |
| 4 — Hybrid RAG | Camel → Unstructured → BGE-M3 → Qdrant + BM25 → LlamaIndex | Live doc drop + cross-doc citations | Section 7 |

---

## Project Structure (Target)

```
jslmind-demo/
├── CLAUDE.md                          ← this file
├── JSLMind_Demo_Blueprint.md          ← full spec, read before every task
├── docker-compose.yml                 ← full stack (see Section 11)
├── .env.example                       ← all required env vars
│
├── integration/                       ← Apache Camel SpringBoot app
│   └── src/main/java/
│       ├── routes/
│       │   ├── SapToBronzeRoute.java
│       │   ├── KepwareToKafkaRoute.java
│       │   ├── SharepointToQdrantRoute.java
│       │   └── TemporalToSapPmRoute.java
│       └── JSLMindIntegrationApp.java
│
├── workflows/                         ← Temporal workflow definitions
│   └── src/main/java/
│       ├── CBMWorkflow.java + CBMWorkflowImpl.java
│       ├── InventoryAgentWorkflow.java
│       └── CostingAnalyticsWorkflow.java
│
├── data-platform/                     ← Airflow DAGs + dbt models
│   ├── dags/
│   │   ├── sap_ingest_dag.py
│   │   ├── medallion_transform_dag.py
│   │   └── data_quality_dag.py
│   └── dbt/
│       ├── models/silver/
│       └── models/gold/
│
├── rag/                               ← RAG pipeline + LlamaIndex
│   ├── ingestion/
│   │   ├── camel_watcher.py
│   │   └── embedding_pipeline.py
│   └── retrieval/
│       ├── hybrid_retriever.py        ← RRF fusion (Qdrant + BM25)
│       └── rag_api.py                 ← FastAPI /rag/query endpoint
│
├── agents/                            ← LangGraph agent definitions
│   ├── inventory_agent.py
│   ├── surface_inspection_agent.py
│   └── mcp_server.py                  ← exposes agents as MCP tools for Dify
│
├── gateway/
│   ├── litellm_config.yaml            ← model routing + dept budgets
│   └── kong/
│       └── kong.yaml                  ← declarative Kong config
│
├── catalog/                           ← Backstage catalog entities
│   ├── agents/
│   │   ├── inventory-agent.yaml
│   │   ├── cbm-agent.yaml
│   │   └── quality-agent.yaml
│   └── integrations/
│       ├── sap-mm-connector.yaml
│       └── kepware-opc-connector.yaml
│
├── frontend/                          ← React unified demo UI
│   └── src/
│
└── infra/
    └── aws/                           ← ECS task definitions, CloudFormation
```

---

## Key Synthetic Data Schemas

Use exact SAP field names in all synthetic data — JSL technical team will notice.

```python
# SAP MM — Material Master (MARA)
{"MATNR": "STL-304-CR-2MM", "MTART": "ROH", "MATKL": "SS-COLDROLLED",
 "MEINS": "MT", "BRGEW": 7.93, "NTGEW": 7.90}

# SAP MM — Purchase Order Item (EKPO)
{"EBELN": "4500012345", "EBELP": "00010", "MATNR": "STL-304-CR-2MM",
 "MENGE": 500.0, "MEINS": "MT", "NETPR": 142500.0, "WERKS": "JSL1"}

# SAP CO — Production Order (AUFK)
{"AUFNR": "000100012345", "AUART": "PP01", "WERKS": "JSL1",
 "MATNR": "STL-316L-HR-3MM", "GAMNG": 200.0, "ISDD": "20260301"}
```

---

## Camel Route Pattern (Standard)

All routes follow this pattern. Use SpringBoot DSL, not XML.

```java
@Component
public class SapToBronzeRoute extends RouteBuilder {
    @Override
    public void configure() {
        from("timer:sap-poll?period=60000")
            .routeId("sap-to-bronze")
            .to("direct:fetch-sap-data")
            .process(sapSchemaMapper)
            .marshal().json()
            .to("minio://bronze-sap-mm?autoCreateBucket=true");
    }
}
```

---

## Temporal Workflow Pattern (Standard)

```java
// Workflow interface
@WorkflowInterface
public interface CBMWorkflow {
    @WorkflowMethod
    void execute(AnomalyEvent event);
}

// Steps: DetectAnomaly → ScoreConfidence → CreateSAPNotification
//        → WaitForApproval → ScheduleMaintenance
```

---

## LiteLLM Config (Summary)

- Primary model: `ollama/mistral` on `http://ollama:11434`
- Fallback: `claude-sonnet-4-20250514` via Anthropic API key
- Routing: least-busy with automatic fallback
- Callbacks: Langfuse for all traces
- Virtual keys: one per dept (operations, finance, quality) with monthly budget

---

## Demo Talking Points to Always Land

1. **Sovereignty:** "Every model runs on-prem. No data leaves JSL's network."
2. **Token budgets:** "Operations team has consumed ₹18,400 of inference this month. We can hard-cap any department."
3. **5-minute agents:** "A plant manager builds this agent — no code, no IT ticket. It auto-registers in the catalog."
4. **Production parity:** "Same containers. We replace docker-compose.yml with Kubernetes manifests. Zero code rewrite."
5. **OSS-first:** "Every component is open source. You own the IP. No vendor lock-in."

---

## Environment Variables Required

```bash
# LLM
ANTHROPIC_API_KEY=          # Demo fallback LLM
OLLAMA_BASE_URL=http://ollama:11434

# Storage
MINIO_ROOT_USER=jslmind
MINIO_ROOT_PASSWORD=
AWS_ACCESS_KEY_ID=          # AWS deployment only
AWS_SECRET_ACCESS_KEY=

# Databases
POSTGRES_PASSWORD=
REDIS_PASSWORD=

# Observability
LANGFUSE_PUBLIC_KEY=
LANGFUSE_SECRET_KEY=

# Gateway
LITELLM_MASTER_KEY=sk-jsl-master
KONG_ADMIN_TOKEN=

# Dify
DIFY_SECRET_KEY=

# n8n
N8N_ENCRYPTION_KEY=
```

---

## Definition of Done (Per Pillar)

- [ ] End-to-end flow works without manual intervention
- [ ] WOW moment is repeatable and takes <30 seconds to trigger
- [ ] All synthetic data uses real JSL/SAP field names
- [ ] Component registers in Backstage catalog
- [ ] Langfuse shows traces for all LLM calls
- [ ] Works on local Docker Compose AND AWS deployment
