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
| Model registry | **MLflow** | Unified registry for all model types (LLMs metadata, embeddings, custom ML artifacts). MinIO artifact store |
| ML model serving | **BentoML** | Decouples custom ML models from pipeline code. All 4 custom models served as versioned REST endpoints |
| Model/data drift | **Evidently AI** | Daily drift monitoring — alerts Grafana, triggers Airflow retraining DAG automatically |
| RAG eval | **RAGAS + Langfuse** | Weekly faithfulness/relevancy/recall eval against golden Q&A dataset |
| OT stream processing | **Kafka Streams (inside Camel SpringBoot)** | Z-score anomaly scoring on 30s windows. KafkaStreamsAnomalyProcessor. NOT PyFlink |
| Backstage entity kinds | **Custom kinds: Agent, AIModel, Integration, DataProduct** | Not generic Component. Each kind has specific spec fields. Requires catalog processor plugin |

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

## LangGraph Agent Pattern (Standard)

All agents live in `agents/`. Each agent is a compiled `StateGraph` with three fixed nodes: `retrieve → model_inference → llm`. Every LLM call is traced via Langfuse.

```python
# agents/<name>_agent.py
from langgraph.graph import StateGraph, END
from typing import TypedDict
import httpx, os
from langfuse import Langfuse

LITELLM_URL = os.getenv("LITELLM_BASE_URL", "http://litellm-proxy:4000")
LITELLM_KEY = os.getenv("LITELLM_API_KEY", "sk-jsl-master")
RAG_URL     = os.getenv("RAG_BASE_URL", "http://rag-service:8001")
BENTOML_URL = os.getenv("BENTOML_BASE_URL", "http://bentoml:3000")

langfuse = Langfuse()

class AgentState(TypedDict):
    input: dict            # caller payload
    retrieved_context: str # from RAG service
    model_result: dict     # from BentoML
    llm_response: str      # from LiteLLM
    output: dict           # final response

def retrieve_node(state: AgentState) -> AgentState:
    r = httpx.post(f"{RAG_URL}/rag/query", json={
        "query": state["input"]["query"],
        "filters": state["input"].get("filters", {}),
    }, timeout=30.0)
    state["retrieved_context"] = r.json()["answer"]
    return state

def model_inference_node(state: AgentState) -> AgentState:
    # Call the BentoML endpoint defined in catalog YAML spec.serving.endpoint
    r = httpx.post(f"{BENTOML_URL}/<endpoint>/predict",
                   json=state["input"].get("sensor_data", {}), timeout=10.0)
    state["model_result"] = r.json()
    return state

def llm_node(state: AgentState) -> AgentState:
    trace = langfuse.trace(name="<agent-name>")
    r = httpx.post(f"{LITELLM_URL}/v1/chat/completions", json={
        "model": "jsl-primary",
        "messages": [
            {"role": "system", "content": "<agent-specific system prompt>"},
            {"role": "user",   "content": (
                f"Context:\n{state['retrieved_context']}\n\n"
                f"Model output:\n{state['model_result']}\n\n"
                f"Query: {state['input']['query']}"
            )},
        ],
        "temperature": 0.1,
    }, headers={"Authorization": f"Bearer {LITELLM_KEY}"}, timeout=60.0)
    state["llm_response"] = r.json()["choices"][0]["message"]["content"]
    trace.update(output=state["llm_response"])
    return state

def build_graph():
    g = StateGraph(AgentState)
    g.add_node("retrieve",         retrieve_node)
    g.add_node("model_inference",  model_inference_node)
    g.add_node("llm",              llm_node)
    g.set_entry_point("retrieve")
    g.add_edge("retrieve",        "model_inference")
    g.add_edge("model_inference", "llm")
    g.add_edge("llm",             END)
    return g.compile()

agent = build_graph()

def run(payload: dict) -> dict:
    result = agent.invoke({"input": payload, "retrieved_context": "",
                           "model_result": {}, "llm_response": "", "output": {}})
    return {"response": result["llm_response"], "model_result": result["model_result"]}
```

**Agents to build:**
| File | BentoML endpoint | Temporal workflow | Dify tool name |
|---|---|---|---|
| `inventory_agent.py` | `/inventory/forecast` | `InventoryAgentWorkflow` | `inventory_agent` |
| `surface_inspection_agent.py` | `/surface-defect/predict` | none (sync) | `surface_inspection_agent` |
| `costing_agent.py` | `/costing/predict` | `CostingAnalyticsWorkflow` | `costing_agent` |

If the agent needs Temporal durability, wrap `run()` by submitting a Temporal workflow signal rather than calling the graph directly.

---

## BentoML Model Serving Pattern (Standard)

All custom ML models live in `models/` and are served via a single BentoML service. The input/output contract must exactly match the `spec.inputs` / `spec.output` fields in the corresponding `catalog/models/*.yaml`.

```python
# models/serve_<model_name>.py
import bentoml
import numpy as np
from pydantic import BaseModel

# Weights are registered in MLflow; BentoML loads from the MLflow model registry
runner = bentoml.mlflow.get("<mlflow-model-name>:latest").to_runner()
svc    = bentoml.Service("<model-name>-service", runners=[runner])

class PredictInput(BaseModel):
    # Field names must match spec.inputs in catalog/models/<model>.yaml
    temperature_C:   float
    vibration_mm_s:  float
    current_A:       float
    pressure_bar:    float
    rpm:             float

class PredictOutput(BaseModel):
    score:      float   # 0.0–1.0 (matches spec.output in catalog YAML)
    label:      str     # "normal" | "anomaly"
    confidence: float

@svc.api(input=bentoml.io.JSON(pydantic_model=PredictInput),
         output=bentoml.io.JSON(pydantic_model=PredictOutput))
async def predict(inp: PredictInput) -> PredictOutput:
    features = np.array([[inp.temperature_C, inp.vibration_mm_s,
                          inp.current_A, inp.pressure_bar, inp.rpm]])
    raw = await runner.async_run(features)
    score = float(raw[0])
    return PredictOutput(score=score,
                         label="anomaly" if score > 0.5 else "normal",
                         confidence=round(abs(score - 0.5) * 2, 3))
```

**Models to serve:**
| MLflow model name | BentoML endpoint | Input schema source |
|---|---|---|
| `cbm-isolation-forest` | `POST /cbm/predict` | `catalog/models/cbm-isolation-forest.yaml` |
| `surface-defect-cnn` | `POST /surface-defect/predict` | `catalog/models/surface-defect-cnn.yaml` |
| `inventory-xgboost` | `POST /inventory/forecast` | `catalog/models/inventory-xgboost.yaml` |
| `costing-variance-model` | `POST /costing/predict` | `catalog/models/costing-statsmodel.yaml` |

All four services are bundled in a single `models/` Docker image and registered in MLflow with `mlflow/model-name` annotation matching the catalog YAML.

---

## MCP Server Pattern (agents/mcp_server.py)

The MCP server is a FastAPI app that exposes all LangGraph agents as callable tools for Dify. Dify fetches `/mcp/tools` on startup and calls `/mcp/tools/{name}/call` at runtime.

```python
# agents/mcp_server.py
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import inventory_agent, surface_inspection_agent, costing_agent

app = FastAPI(title="JSLMind MCP Tool Server")

# Dify reads this manifest on startup to discover available tools
@app.get("/mcp/tools")
def list_tools():
    return {"tools": [
        {
            "name": "inventory_agent",
            "description": "Forecasts inventory depletion for a stainless steel grade. Returns days-to-stockout and reorder recommendation.",
            "parameters": {
                "grade":        {"type": "string",  "description": "SAP MATNR e.g. STL-304-CR-2MM"},
                "plant":        {"type": "string",  "description": "SAP plant code e.g. JSL1"},
                "horizon_days": {"type": "integer", "default": 30},
                "query":        {"type": "string",  "description": "Natural language question"},
            },
        },
        {
            "name": "surface_inspection_agent",
            "description": "Analyses surface defect rate on a production line. Returns defect score and recommends SOP action.",
            "parameters": {
                "grade":                {"type": "string"},
                "line_id":              {"type": "string"},
                "time_window_minutes":  {"type": "integer", "default": 60},
                "query":                {"type": "string"},
            },
        },
        {
            "name": "costing_agent",
            "description": "Explains production cost variance vs standard cost for a grade and period.",
            "parameters": {
                "grade":  {"type": "string"},
                "period": {"type": "string", "description": "e.g. 2026-02"},
                "query":  {"type": "string"},
            },
        },
    ]}

class ToolCallRequest(BaseModel):
    parameters: dict

@app.post("/mcp/tools/{tool_name}/call")
async def call_tool(tool_name: str, req: ToolCallRequest):
    dispatch = {
        "inventory_agent":          inventory_agent.run,
        "surface_inspection_agent": surface_inspection_agent.run,
        "costing_agent":            costing_agent.run,
    }
    if tool_name not in dispatch:
        raise HTTPException(status_code=404, detail=f"Unknown tool: {tool_name}")
    return dispatch[tool_name](req.parameters)

# Dify registration: add this endpoint in Dify → Settings → Tools → Custom
# URL: http://langgraph-service:8000/mcp/tools
# Auth: Bearer ${LITELLM_MASTER_KEY}
```

---

## n8n Trigger Workflow Pattern

n8n workflows are imported as JSON via the n8n API on container startup (`scripts/seed_n8n.py`). Do not build agents in n8n — only triggers and routing.

```json
{
  "name": "Daily Inventory Alert",
  "nodes": [
    {
      "name": "Schedule 6am",
      "type": "n8n-nodes-base.scheduleTrigger",
      "parameters": { "rule": { "interval": [{ "field": "hours", "hoursInterval": 24 }] } }
    },
    {
      "name": "Call Dify Inventory Agent",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "http://dify:5001/v1/chat-messages",
        "method": "POST",
        "headers": { "Authorization": "Bearer {{ $env.DIFY_INVENTORY_API_KEY }}" },
        "body": {
          "inputs": {},
          "query": "Check stock levels for all grades at JSL1 and flag any below 30-day forecast",
          "response_mode": "blocking",
          "user": "n8n-scheduler"
        }
      }
    },
    {
      "name": "Post to Teams",
      "type": "n8n-nodes-base.httpRequest",
      "parameters": {
        "url": "{{ $env.TEAMS_WEBHOOK_URL }}",
        "method": "POST",
        "body": { "text": "JSLMind Inventory Alert:\n{{ $json.answer }}" }
      }
    }
  ],
  "connections": {
    "Schedule 6am":                { "main": [[{ "node": "Call Dify Inventory Agent" }]] },
    "Call Dify Inventory Agent":   { "main": [[{ "node": "Post to Teams" }]] }
  }
}
```

**n8n workflows to seed:**
| Workflow | Trigger | Calls | Posts to |
|---|---|---|---|
| `daily-inventory-alert` | Daily 6am | Dify inventory agent | Teams operations channel |
| `sap-stock-event` | SAP webhook (simulated) | Dify inventory agent | Teams + audit log |
| `monthly-cost-variance` | 1st of month, 7am | Dify costing agent | Teams finance channel |
| `sharepoint-doc-drop` | File watcher (simulated) | RAG ingestion `/ingest` | Confirmation to Teams |

Seed all workflows via `scripts/seed_n8n.py` which POSTs each JSON to `http://localhost:5678/api/v1/workflows` using the n8n API key.

---

## Catalog YAML Pattern (Agent / AIModel / Integration / DataProduct)

All catalog entities live in `catalog/`. Use `kind: Resource` for models and data products; `kind: Component` for agents and integrations. The `spec.type` field is what drives the UI grouping in the Catalog tab.

```yaml
# catalog/agents/<name>.yaml  — Agent
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: <agent-name>                          # kebab-case
  title: "<Human Readable Title>"
  description: >
    One paragraph. What it does, what data it uses, which department owns it.
  tags: [ai-agent, <dept>, <use-case>]
  annotations:
    dify/app-id: "<dify-app-uuid>"            # set after Dify deployment
    langfuse/project: jslmind-prod
    mcp/tool-name: "<tool_name>"              # must match mcp_server.py
spec:
  type: ai-agent
  lifecycle: production                       # or staging
  owner: <dept>-team
  system: jslmind-platform
  data_sources: [gold.<table>]
  rag_collection: jsl_docs
  temporal_workflow: <WorkflowClassName>      # omit if no Temporal
  mcp_endpoint: "http://langgraph-service:8000/mcp/tools/<tool_name>/call"
```

```yaml
# catalog/models/<name>.yaml  — AIModel
apiVersion: backstage.io/v1alpha1
kind: Resource
metadata:
  name: <model-name>
  title: "<Model Title>"
  description: >
    What it does, how it was trained, what it feeds into.
  tags: [<type>, <framework>]
  annotations:
    mlflow/model-name: <model-name>
    mlflow/stage: Production
    serving/endpoint: "http://bentoml:3000/<path>/predict"
    monitoring/evidently: "http://evidently:8080/projects/<project>"
spec:
  type: ml-model                              # or foundation-llm | embedding-model
  lifecycle: production
  owner: <dept>-team
  system: jslmind-platform
  framework: scikit-learn                     # or pytorch | xgboost | statsmodels
  serving: bentoml                            # or ollama | vllm
  inputs:
    - { name: <field>, type: float }
  output: "<description of output>"
  eval_metrics: { precision: 0.0, recall: 0.0, f1: 0.0 }
  drift_threshold: 0.15
  retraining_trigger: "weekly-airflow-dag + Evidently drift alert"
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
