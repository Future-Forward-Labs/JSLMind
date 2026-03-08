# Technology Decision: JSLMind Platform (Baseline)

## Use Case Summary
JSLMind is an on-premise enterprise AI platform for Jindal Stainless Limited (India's largest stainless steel manufacturer). It provides a governed, sovereign AI platform enabling plant managers and operations analysts to build AI agents without code, query SOPs and grade specs via natural language, monitor equipment health in real time, and analyse production costs — all without data leaving JSL's network.

## Recommended Stack

### LLM Choice
| Need | Recommended Model | Why | Ollama Command | RAM |
|---|---|---|---|---|
| Primary (agent reasoning) | `mistral:7b-instruct` | Best instruction following at 7B; fits 16 GB Mac | `ollama pull mistral:7b-instruct` | 5.5 GB |
| Fast (live UI, streaming) | `llama3.2:3b` | ~45 tok/s on M2; acceptable quality for demos | `ollama pull llama3.2:3b` | 3.5 GB |
| Fallback (cloud) | `claude-sonnet-4-6` | Highest quality; demo reliability net | n/a | n/a |
| Embeddings | `bge-m3` | Dual dense+sparse from one model; 1024 dim | `ollama pull bge-m3` | 1.2 GB |

### Database Choice
| Data Type | Database | Why | Provisioning |
|---|---|---|---|
| Structured/transactional | PostgreSQL 16 | ACID, shared by Keycloak/Airflow/Temporal/Dify | Phase 1 docker service |
| Time-series sensor data | TimescaleDB | Hypertable compression; PLC tag storage | Pattern A (`type: timescaledb`) |
| Vector similarity | Qdrant | Sub-ms ANN; single binary for demo | Phase 6 docker service |
| Columnar analytics | DuckDB (in-process) | Sub-second SQL on Iceberg/Parquet in MinIO | Used by dbt Gold models |
| Cache / queue | Redis | LiteLLM semantic cache; n8n queue | Phase 1 docker service |
| Object / data lake | MinIO (local) → S3 (AWS) | S3-compatible; Iceberg-compatible | Phase 4; Pattern B |

### Integration Pattern
| Source → Destination | Pattern | Tool | Notes |
|---|---|---|---|
| SAP → Bronze | Batch poll (60s) | Apache Camel timer | SAP doesn't push; RFC/OData read |
| OT sensor → Kafka | Real-time MQTT stream | Camel MQTT → RedPanda | PLC/Kepware MQTT output |
| File drop → Qdrant | Event-driven pipeline | Camel file watcher → RAG service | SharePoint / DMS ingestion |
| Business event → Agent | Webhook | n8n | SAP stock threshold → Dify agent |
| Schedule → Agent report | Cron | n8n | Daily 6am costing analytics |
| Temporal → SAP PM | Activity call | Temporal + Camel RFC stub | Maintenance WO creation |

### Agent Architecture
- **Builder**: Dify (business users, no code) for simple agents; LangGraph (Mindsprint engineers) for complex multi-step
- **Orchestration**: Temporal (all agents with >1 step or human approval gate)
- **Trigger**: n8n for SAP events and schedules; Dify UI for on-demand

### Observability
- Langfuse: Pattern D — set `LANGFUSE_PUBLIC_KEY` + `LANGFUSE_SECRET_KEY` in every service
- Grafana: jslmind-platform dashboard (platform health); one panel per phase added

## Trade-offs Considered
Chose Dify over building a custom agent UI to save 3 weeks; Dify's RBAC and RAG tooling are sufficient for the demo. Chose RedPanda over Apache Kafka for zero-configuration single-binary operation — production JSL could switch to Kafka without code changes. Chose LlamaIndex RRF over a pure vector search because the BM25 keyword layer is critical for exact SAP grade codes (e.g., `STL-304-CR-2MM`) that semantic embeddings can miss.

## Production Migration Note
Every component runs in a Docker container; replacing `docker-compose.yml` with Kubernetes manifests (or ECS task definitions) requires only infra config changes — zero application code rewrites.
