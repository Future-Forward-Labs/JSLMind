# JSLMind Demo Platform

On-premise enterprise AI platform demo for Jindal Stainless Limited. 7-day sprint, local Docker Compose + AWS backup.

**Full architecture:** See `JSLMind_Demo_Blueprint.md`

---

## Quick Start

```bash
# 1. Copy env file and fill in any missing values
cp .env.example .env

# 2. Start Phase 1 (foundation — always required)
docker compose up -d postgres redis keycloak prometheus grafana

# 3. Seed Keycloak realm, groups and demo user
bash scripts/seed-keycloak.sh
```

---

## Credentials — All Services

> `.env` is gitignored. Never commit it.

### Phase 1 — Platform Foundation

| Service | URL | Username | Password / Key |
|---|---|---|---|
| **Postgres** | `localhost:5432` | `postgres` | `jslmind_pg_2024` |
| **Redis** | `localhost:6379` | — | `jslmind_redis_2024` |
| **Keycloak Admin Console** | http://localhost:8080/admin | `admin` | `jslmind_kc_2024` |
| Keycloak JSLMind Realm | http://localhost:8080/realms/jslmind | — | — |
| Keycloak Demo User | — | `demo@jsl.com` | see `DEMO_USER_PASSWORD` in `.env` |
| **Grafana** | http://localhost:3001 | `admin` | `admin123` |
| Prometheus | http://localhost:9090 | — | — (open) |

**Keycloak groups seeded:** `operations-team` · `finance-team` · `quality-team`

### Phase 2 — LLM Gateway

| Service | URL | Username | Password / Key |
|---|---|---|---|
| **LiteLLM Proxy** (API) | http://localhost:4000 | — | Bearer `sk-jsl-master` |
| **LiteLLM UI** | http://localhost:4000/ui | `admin` | `sk-jsl-master` |
| **Langfuse** | http://localhost:3002 | `admin@jsl.com` ¹ | your chosen password ¹ |
| Ollama API | http://localhost:11434 | — | — (open) |

> ¹ Langfuse has no default account. On first open you will see a **Sign Up** form — register with any email/password you choose. After registering, go to **Settings → API Keys → Create** and paste the two keys into `.env`.

**LiteLLM model aliases:**

| Alias | Primary (local) | Fallback (cloud) | Use for |
|---|---|---|---|
| `jsl-fast` | `ollama/llama3.2:3b` | Claude Haiku | Live UI, streaming |
| `jsl-quality` | `ollama/mistral:7b-instruct` | Claude Sonnet | Agent reasoning, RAG |
| `jsl-embed` | `ollama/bge-m3` | — | RAG embeddings (1024-dim) |
| `jsl-cloud` | `claude-sonnet-4-6` (direct) | — | Demo fallback, highest quality |

**Note:** `jsl-cloud` works immediately. `jsl-fast` / `jsl-quality` / `jsl-embed` require Ollama models to finish downloading first.

### Phase 3 — Agent Catalog

| Service | URL | Username | Password |
|---|---|---|---|
| **Backstage** | http://localhost:7007 | — | Guest (click "Enter as Guest") |

**Image:** `ghcr.io/backstage/backstage:latest` (official; `roadiehq/community-backstage` is private)

**Auth note:** Backend API auth is disabled (`dangerouslyDisableDefaultAuthPolicy: true`) — correct for demo. User login uses the built-in Guest provider.

### Phase 4 — Medallion Pipeline

| Service | URL | Username | Password |
|---|---|---|---|
| **MinIO Console** | http://localhost:9001 | `jslmind` | `jslmind_minio_2024` |
| MinIO API | http://localhost:9000 | `jslmind` | `jslmind_minio_2024` |
| **Airflow** | http://localhost:8085 | `admin` | `admin` |
| **Marquez (Lineage)** | http://localhost:5000 | — | — (open) |
| Camel Actuator | http://localhost:8090/actuator/health | — | — (open) |

### Phase 5 — OT/CBM Streaming

| Service | URL | Username | Password |
|---|---|---|---|
| **Temporal UI** | http://localhost:8088 | — | — (open) |
| RedPanda (Kafka) | `localhost:9092` | — | — |
| MQTT Broker | `localhost:1883` | — | — |
| MQTT Simulator API | http://localhost:8099 | — | — (open) |
| **TimescaleDB** | `localhost:5433` | `postgres` | `jslmind_pg_2024` |

### Phase 6 — Hybrid RAG

| Service | URL | Username | Password |
|---|---|---|---|
| **Qdrant Dashboard** | http://localhost:6333/dashboard | — | — (open) |
| RAG Service API | http://localhost:8001 | — | — (open) |

### Phase 7 — Agent Builder

| Service | URL | Username | Password |
|---|---|---|---|
| **Dify** | http://localhost:3003 | `admin@jsl.com` ² | `Admin123!` ² |
| Dify API | http://localhost:5001 | — | Bearer token from Dify UI |
| **n8n** | http://localhost:5678 | `admin@jsl.com` ³ | your chosen password ³ |
| LangGraph MCP API | http://localhost:8000 | — | — (open) |

> ² Dify: sign up on first open. Use `admin@jsl.com` / `Admin123!` as the suggested credentials.
> ³ n8n: sign up on first open with any credentials you choose.

### Phase 8 — Unified UI

| Service | URL | Username | Password |
|---|---|---|---|
| **JSLMind App** | http://localhost:3000 | Keycloak SSO | see `DEMO_USER_PASSWORD` in `.env` |
| **JSLMind Demo Shell** | http://localhost:3000 | — | — (open) |
| FastAPI Backend | http://localhost:8003 | — | — (open) |
| Kong Proxy | http://localhost:8000 | — | — |
| Kong Admin API | http://localhost:8002 | — | — |

---

## Starting Services by Phase

```bash
# ── Phase 1 — Foundation (always start first) ─────────────────────────────────
docker compose up -d postgres redis keycloak prometheus grafana
bash scripts/seed-keycloak.sh

# ── Phase 2 — LLM Gateway ─────────────────────────────────────────────────────
# Prereq: place netskope-root.pem + netskope-intermediate.pem in infra/ first
# (needed to build custom Ollama image so `ollama pull` works behind office proxy)
docker compose up -d ollama litellm-proxy langfuse-server langfuse-worker
bash scripts/pull-ollama-models.sh      # 15-25 min on first run
bash scripts/seed-litellm-keys.sh       # generates per-team virtual keys

# ── Phase 3 — Backstage Catalog ───────────────────────────────────────────────
docker compose up -d backstage

# ── Phase 4 — Medallion Pipeline ──────────────────────────────────────────────
docker compose up -d minio camel-integration airflow-webserver airflow-scheduler marquez
bash scripts/seed-minio.sh
bash scripts/seed-sap-data.sh

# ── Phase 5 — OT/CBM Streaming ────────────────────────────────────────────────
docker compose up -d redpanda temporal temporal-ui timescaledb mosquitto mqtt-simulator pyflink-anomaly cbm-worker

# ── Phase 6 — Hybrid RAG ──────────────────────────────────────────────────────
# Prereq 1: place Netskope CA bundle at rag/netskope-ca-bundle.pem (gitignored)
# Prereq 2: build Camel JAR on host (Maven can't pull deps through Docker proxy)
cd integration && JAVA_HOME=$(/usr/libexec/java_home) mvn package -DskipTests -q && cd ..
# Prereq 3: generate the 20-doc synthetic corpus (one-time)
python rag/docs/generate_corpus.py
# Start services — rag-service auto-seeds Qdrant from corpus/ on startup
docker compose up -d qdrant rag-service camel-integration kong

# ── Phase 7 — Agent Builder ───────────────────────────────────────────────────
docker compose up -d dify dify-web dify-worker n8n langgraph-service

# ── Phase 8 — Unified UI ──────────────────────────────────────────────────────
docker compose up -d kong fastapi-backend react-frontend

# ── Demo Shell — Unified UI ────────────────────────────────────────────────────
docker compose up -d frontend
# Open http://localhost:3000 — demo shell active

# ── Full stack (demo day) ─────────────────────────────────────────────────────
docker compose up -d
```

---

## First-Time Setup Notes

### Phase 2 — LiteLLM & Langfuse

1. **`ANTHROPIC_API_KEY`** — already set in `.env`. `jsl-cloud` model works immediately.

2. **Netskope SSL** — LiteLLM has `ssl_verify: false` in `gateway/litellm_config.yaml` so it can reach the Anthropic API through the corporate proxy. No action needed.

3. **Ollama image** — uses `infra/Dockerfile.ollama` which bundles corporate CA certs. Before building, place these in `infra/`:
   ```
   infra/netskope-root.pem
   infra/netskope-intermediate.pem
   ```
   Export from your system keychain or ask IT. Both files are gitignored.

4. **Langfuse account** — open http://localhost:3002 and sign up (no default account exists). Then:
   - Go to **Settings → API Keys → Create**
   - Copy the two keys into `.env`:
     ```
     LANGFUSE_PUBLIC_KEY=pk-lf-...
     LANGFUSE_SECRET_KEY=sk-lf-...
     ```
   - Restart LiteLLM: `docker compose restart litellm-proxy`

### Phase 3 — Backstage

Backstage takes ~60s on first start to run DB migrations. Wait for `Listening on :7007` in logs:
```bash
docker compose logs -f backstage
```

Catalog ingestion is async — if entities are missing after health passes, wait 30s:
```bash
sleep 30 && bash scripts/verify-phase3.sh
```

### Phase 4 — Airflow

Generate the Fernet key before starting Airflow:
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# paste output as AIRFLOW_FERNET_KEY in .env
```

### Phase 6 — Hybrid RAG

**1. Netskope CA cert** — the `rag-service` Docker build runs `pip install` inside the container. Export the two Netskope certs from your System Keychain and save them as a combined PEM bundle:
```bash
# macOS — export Netskope certs (adjust cert names to match your keychain)
security find-certificate -a -p /Library/Keychains/System.keychain \
  | python3 -c "
import sys, re, subprocess
certs = re.findall(r'-----BEGIN CERTIFICATE-----.*?-----END CERTIFICATE-----', sys.stdin.read(), re.DOTALL)
for c in certs:
    r = subprocess.run(['openssl','x509','-subject','-noout'], input=c.encode(), capture_output=True)
    if 'netskope' in r.stdout.decode().lower() or 'goskope' in r.stdout.decode().lower():
        print(c)
" > rag/netskope-ca-bundle.pem
```
The file is gitignored. Re-run this whenever the cert is rotated.

**2. Build Camel JAR on host** — Maven can't resolve dependencies through the Netskope proxy inside Docker. Build locally first; the Dockerfile copies the pre-built JAR:
```bash
cd integration
JAVA_HOME=$(/usr/libexec/java_home) mvn package -DskipTests -q
cd ..
```
Re-run after any `integration/` code change before rebuilding the Docker image.

**3. Generate corpus** — creates 20 synthetic JSL documents in `rag/docs/corpus/` (one-time):
```bash
pip install reportlab python-docx   # local deps, not needed in container
python rag/docs/generate_corpus.py
# Expected: 20 files in rag/docs/corpus/
```

**4. Startup** — `rag-service` auto-seeds Qdrant from `corpus/` on container start. No separate seed script needed:
```bash
docker compose up -d qdrant rag-service camel-integration kong
# Wait ~2–3 min for corpus embedding (20 docs × multiple chunks × BGE-M3)
docker compose logs -f rag-service   # wait for "Application startup complete"
```

---

## Testing Phase 3 — Backstage Catalog

```bash
# Run full verification (health + all 7 entities)
bash scripts/verify-phase3.sh

# Manually query a specific entity
curl -s "http://localhost:7007/api/catalog/entities?filter=metadata.name=inventory-agent" \
  | python3 -c "import sys,json; e=json.load(sys.stdin)[0]; print(e['metadata']['name'], '|', e['spec']['type'])"

# List all catalog entities
curl -s "http://localhost:7007/api/catalog/entities" \
  | python3 -c "import sys,json; [print(e['kind'], e['metadata']['name']) for e in json.load(sys.stdin)]"
```

Open http://localhost:7007/catalog to browse the UI. Click **"Enter as Guest"** when prompted.

---

## Testing Phase 6 — Hybrid RAG

```bash
# Run full verification (11 checks end-to-end)
bash scripts/verify-phase6.sh

# Direct query — RAG service
curl -s -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "Max carbon content for Grade 316L?", "top_k": 3}' \
  | python3 -m json.tool

# Query with grade filter
curl -s -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "surface finish requirements", "filters": {"grade": "304"}, "top_k": 2}' \
  | python3 -m json.tool

# Via Kong gateway
curl -s -X POST http://localhost:8000/rag/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "pickling line maintenance schedule"}' \
  | python3 -m json.tool

# Camel route health
curl -s http://localhost:8090/actuator/health | python3 -m json.tool

# Qdrant collection stats
curl -s http://localhost:6333/collections/jsl_docs \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print('points:', d['result']['points_count'])"

# Live doc drop demo (WOW moment) — file auto-indexed in <20s
echo "JSL Demo: Grade 316L max carbon 0.03%, chromium 16-18%, molybdenum 2-3%." \
  > rag/docs/incoming/demo_drop.txt
sleep 15
curl -s -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "what document was just added?"}' | python3 -m json.tool
rm rag/docs/incoming/demo_drop.txt
```

Open http://localhost:6333/dashboard to browse the Qdrant vector collection.

---

### Demo Shell — Adding a New Phase

When a phase is completed, update the demo shell:
1. Create `frontend/src/pages/<PhaseName>.jsx` with live widgets for that phase
2. Flip the sidebar entry from "coming soon" to active in `frontend/src/components/Sidebar.jsx`
3. Rebuild: `docker compose up -d --build frontend`

---

## Testing Phase 2 — LLM Gateway

```bash
# Cloud model — works immediately (no Ollama needed)
curl -s http://localhost:4000/chat/completions \
  -H "Authorization: Bearer sk-jsl-master" \
  -H "Content-Type: application/json" \
  -d '{"model":"jsl-cloud","messages":[{"role":"user","content":"Name one stainless steel grade in one word."}]}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"

# Local fast model (requires llama3.2:3b pull to complete)
curl -s http://localhost:4000/chat/completions \
  -H "Authorization: Bearer sk-jsl-master" \
  -H "Content-Type: application/json" \
  -d '{"model":"jsl-fast","messages":[{"role":"user","content":"Name one stainless steel grade."}]}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"

# Embedding model (requires bge-m3 pull to complete)
curl -s http://localhost:4000/embeddings \
  -H "Authorization: Bearer sk-jsl-master" \
  -H "Content-Type: application/json" \
  -d '{"model":"jsl-embed","input":"stainless steel grade 316L"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(f'dim: {len(d[\"data\"][0][\"embedding\"])}')"

# Check which Ollama models are ready
docker compose exec ollama ollama list

# Run full verification script
bash scripts/verify-phase2.sh
```

Check traces at http://localhost:3002 (Langfuse) after any query.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **Keycloak won't start** | `docker compose exec postgres psql -U postgres -c "CREATE DATABASE keycloak;"` then `docker compose restart keycloak` |
| **Langfuse "Invalid environment variables"** | `SALT` + `ENCRYPTION_KEY` missing — already in `docker-compose.yml`. Run `docker compose up -d langfuse-server langfuse-worker` |
| **LiteLLM SSL error** (Anthropic API) | `ssl_verify: false` is set in `gateway/litellm_config.yaml` — rebuild: `docker compose up -d --build litellm-proxy` |
| **Ollama build fails** | Place `netskope-root.pem` + `netskope-intermediate.pem` in `infra/` before `docker compose up -d ollama` |
| **Ollama model not found** | Still downloading — check: `docker compose exec ollama ollama list` |
| **LiteLLM DB error** | `docker compose exec postgres psql -U postgres -c "CREATE DATABASE litellm;"` |
| **Port conflict** | Change the host port in `docker-compose.yml` (e.g. `8090:8080` instead of `8080:8080`) |
| **Grafana password out of sync** | Password set in UI persists in the `grafana_data` volume — update `.env` `GRAFANA_ADMIN_PASSWORD` to match |
| **Reset everything** | `docker compose down -v` (destroys all volumes) then start fresh |
| **rag-service build: SSL cert error** | `rag/netskope-ca-bundle.pem` missing — re-export from System Keychain (see Phase 6 setup above) |
| **rag-service build: PEM not found** | `rag/.dockerignore` must have `!netskope-ca-bundle.pem` exception — already set in repo |
| **camel-integration build: Maven SSL error** | Build JAR on host first: `cd integration && mvn package -DskipTests -q` |
| **Camel actuator empty reply (port 8090)** | `spring-boot-starter-web` missing from pom.xml — already fixed; rebuild: `docker compose up -d --build camel-integration` |
| **Qdrant empty / no vectors after startup** | corpus not generated — run `python rag/docs/generate_corpus.py` then restart `rag-service` |
| **rag-service still seeding (uvicorn not up)** | Wait 2–3 min — BGE-M3 embeds each chunk via LiteLLM. Watch: `docker compose logs -f rag-service` |
| **Kong /rag/query 404** | Kong not started — `docker compose up -d kong` |

---

## Port Reference

| Port | Service | Phase |
|---|---|---|
| 3000 | React Frontend (JSLMind App) | 8 |
| 3001 | Grafana | 1 |
| 3002 | Langfuse | 2 |
| 3003 | Dify Web | 7 |
| 4000 | LiteLLM Proxy | 2 |
| 5000 | Marquez (Lineage UI) | 4 |
| 5001 | Dify API | 7 |
| 5432 | Postgres (main) | 1 |
| 5433 | TimescaleDB (sensors) | 5 |
| 5678 | n8n | 7 |
| 6333 | Qdrant | 6 |
| 6379 | Redis | 1 |
| 7007 | Backstage | 3 |
| 7233 | Temporal gRPC | 5 |
| 8000 | Kong Proxy / LangGraph MCP | 7/8 |
| 8001 | RAG Service | 6 |
| 8002 | Kong Admin API | 8 |
| 8003 | FastAPI Backend | 8 |
| 8080 | Keycloak | 1 |
| 8085 | Airflow | 4 |
| 8088 | Temporal UI | 5 |
| 8090 | Camel Integration (actuator) | 4 |
| 8099 | MQTT Simulator API | 5 |
| 9000 | MinIO API | 4 |
| 9001 | MinIO Console | 4 |
| 9090 | Prometheus | 1 |
| 9092 | RedPanda (Kafka) | 5 |
| 11434 | Ollama | 2 |
