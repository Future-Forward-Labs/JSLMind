# Technology Decision: <use-case-name>

## Use Case Summary
<one paragraph description>

## Recommended Stack

### LLM Choice
| Need | Recommended Model | Why | Ollama Command | RAM |
|---|---|---|---|---|
| Primary | | | | |
| Fallback | | n/a | n/a | n/a |
| Embeddings | | | | |

### Database Choice
| Data Type | Database | Why | Provisioning |
|---|---|---|---|

### Integration Pattern
| Trigger | Pattern | Tool | Example Route |
|---|---|---|---|

### Agent Architecture
- **Builder**: Dify (business user) OR LangGraph (developer)
- **Orchestration**: Temporal (multi-step/approval) OR direct call (one-shot)
- **Trigger**: n8n (event/schedule) OR direct API (on-demand)

### Observability
- Langfuse: Pattern D (automatic once LANGFUSE keys set)
- Grafana dashboard: <which panels to add>

## Trade-offs Considered
<2-3 sentences on what was NOT chosen and why>

## Production Migration Note
<one sentence on how this choice scales to production>
