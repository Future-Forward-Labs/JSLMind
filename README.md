# JSLMind Demo Platform

On-premise enterprise AI platform demo for Jindal Stainless Limited.
7-day sprint · local Docker Compose · AWS fallback.

**Full architecture:** `JSLMind_Demo_Blueprint.md`

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [One-shot startup](#one-shot-startup)
3. [Build prerequisites (Java modules)](#build-prerequisites-java-modules)
4. [Starting services by phase](#starting-services-by-phase)
5. [Credentials — all services](#credentials--all-services)
6. [Phase 5 — OT/CBM in detail](#phase-5--otcbm-in-detail)
7. [Demo scripts](#demo-scripts)
8. [First-time setup notes](#first-time-setup-notes)
9. [Troubleshooting](#troubleshooting)
10. [Port reference](#port-reference)

---

## Prerequisites

- Docker Desktop ≥ 4.28 (16 GB RAM allocated recommended)
- Java 21 (`brew install openjdk@21`) — only needed to build the two Java modules
- Maven 3.9+ (`brew install maven`)
- Python 3.11+ (for corpus generation and seed scripts)

```bash
# verify
java -version          # openjdk 21
mvn -version           # Apache Maven 3.x
docker compose version # v2.x
```

---

## One-shot startup

```bash
cp .env.example .env        # fill in ANTHROPIC_API_KEY at minimum
bash build-java.sh          # build both Java modules locally (see next section)
bash start.sh               # phase-by-phase boot with readiness checks
```

`start.sh` brings up all phases in dependency order and prints a URL summary when done.

---

## Build prerequisites (Java modules)

Both Java modules must be built **on the host** before `docker compose up`.
The Docker images use a pre-built JAR approach — Maven is not run inside Docker
because the Netskope corporate proxy intercepts TLS and breaks `mvn` inside containers.

```bash
# 1. Build and install the Temporal workflow module into ~/.m2
#    (camel-integration depends on this JAR at compile time)
cd workflows
JAVA_HOME=$(/usr/libexec/java_home -v 21) mvn package install -DskipTests -q
cd ..

# 2. Build the Camel/Spring Boot integration module
cd integration
JAVA_HOME=$(/usr/libexec/java_home -v 21) mvn package -DskipTests -q
cd ..
```

> **Re-run both steps** whenever you change code in `workflows/` or `integration/`,
> then `docker compose up -d --build <service>` to rebuild the affected image.

A convenience wrapper is provided:

```bash
bash build-java.sh   # runs both steps above in order
```

---

## Starting services by phase

```bash
# ── Phase 1 — Foundation (always start first) ─────────────────────────────────
docker compose up -d postgres redis keycloak prometheus grafana
bash scripts/seed-keycloak.sh

# ── Phase 2 — LLM Gateway ─────────────────────────────────────────────────────
# Prereq: place netskope-root.pem + netskope-intermediate.pem in infra/ first
docker compose up -d ollama litellm-proxy langfuse-server langfuse-worker
bash scripts/pull-ollama-models.sh      # 15-25 min first run
bash scripts/seed-litellm-keys.sh

# ── Phase 3 — Backstage Catalog ───────────────────────────────────────────────
docker compose up -d backstage

# ── Phase 4 — Medallion Pipeline ──────────────────────────────────────────────
docker compose up -d minio airflow-init
sleep 30   # wait for Airflow DB migration
docker compose up -d airflow-webserver airflow-scheduler marquez marquez-web camel-integration
bash scripts/seed-minio.sh
bash scripts/seed-sap-data.sh
# Create Airflow admin user (airflow-init command may have a parse issue on first run)
docker compose exec airflow-webserver \
  airflow users create --username admin --password admin \
  --firstname Admin --lastname JSL --role Admin --email admin@jsl.com || true
for dag in sap_ingest medallion_transform data_quality; do
  curl -sf -X PATCH -H "Authorization: Basic $(echo -n 'admin:admin' | base64)" \
    -H "Content-Type: application/json" \
    -d '{"is_paused": false}' "http://localhost:8085/api/v1/dags/${dag}"
done

# ── Phase 5 — OT/CBM Streaming ────────────────────────────────────────────────
# Prereq: Java modules built (see "Build prerequisites" above)
bash build-java.sh
docker compose up -d redpanda timescaledb mosquitto \
  temporal temporal-ui \
  mqtt-simulator camel-integration cbm-worker

# ── Phase 6 — Hybrid RAG ──────────────────────────────────────────────────────
# Prereq: rag/netskope-ca-bundle.pem (see First-time setup)
python rag/docs/generate_corpus.py     # one-time
docker compose up -d qdrant rag-service kong

# ── Phase 7 — Agent Builder ───────────────────────────────────────────────────
docker compose up -d dify dify-web dify-worker n8n langgraph-service

# ── Phase 8 / Demo Shell — Unified UI ─────────────────────────────────────────
docker compose up -d frontend

# ── Full stack ────────────────────────────────────────────────────────────────
bash build-java.sh && docker compose up -d
```

---

## Credentials — all services

> `.env` is gitignored. Never commit it.

### Phase 1 — Platform Foundation

| Service | URL | Username | Password |
|---|---|---|---|
| **Postgres** | `localhost:5432` | `postgres` | `jslmind_pg_2024` |
| **Redis** | `localhost:6379` | — | `jslmind_redis_2024` |
| **Keycloak Admin** | http://localhost:8080/admin | `admin` | `jslmind_kc_2024` |
| Keycloak JSLMind Realm | http://localhost:8080/realms/jslmind | — | — |
| Keycloak Demo User | — | `demo@jsl.com` | see `DEMO_USER_PASSWORD` in `.env` |
| **Grafana** | http://localhost:3001 | `admin` | `admin123` |
| Prometheus | http://localhost:9090 | — | open |

**Keycloak groups:** `operations-team` · `finance-team` · `quality-team`

### Phase 2 — LLM Gateway

| Service | URL | Username | Password / Key |
|---|---|---|---|
| **LiteLLM Proxy** | http://localhost:4000 | — | Bearer `sk-jsl-master` |
| **LiteLLM UI** | http://localhost:4000/ui | `admin` | `sk-jsl-master` |
| **Langfuse** | http://localhost:3002 | `admin@jsl.com` ¹ | your chosen password ¹ |
| Ollama API | http://localhost:11434 | — | open |

> ¹ Langfuse has no default account. Sign up on first open at http://localhost:3002, then go to **Settings → API Keys → Create** and copy the two keys into `.env` (`LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`). Restart LiteLLM after.

**LiteLLM model aliases:**

| Alias | Primary | Fallback | Notes |
|---|---|---|---|
| `jsl-fast` | `ollama/llama3.2:3b` | Claude Haiku | Live UI, streaming |
| `jsl-quality` | `ollama/mistral:7b-instruct` | Claude Sonnet | Agent reasoning, RAG |
| `jsl-embed` | `ollama/bge-m3` | — | RAG embeddings (1024-dim) |
| `jsl-cloud` | `claude-sonnet-4-6` | — | Works immediately, no Ollama needed |

### Phase 3 — Agent Catalog

| Service | URL | Login |
|---|---|---|
| **Backstage** | http://localhost:7007 | Click "Enter as Guest" |

### Phase 4 — Medallion Pipeline

| Service | URL | Username | Password |
|---|---|---|---|
| **MinIO Console** | http://localhost:9001 | `jslmind` | `jslmind_minio_2024` |
| MinIO API | http://localhost:9000 | `jslmind` | `jslmind_minio_2024` |
| **Airflow** | http://localhost:8085 | `admin` | `admin` |
| **Marquez UI** | http://localhost:3004 | — | open |
| Marquez API | http://localhost:5000/api/v1 | — | open |
| Camel Actuator | http://localhost:8090/actuator/health | — | open |

### Phase 5 — OT/CBM Streaming

| Service | URL | Username | Password |
|---|---|---|---|
| **JSLMind OT Page** | http://localhost:3000/ot | — | open |
| **Temporal UI** | http://localhost:8088 | — | open |
| **Grafana OT Dashboard** | http://localhost:3001/d/jsl-ot-sensors | `admin` | `admin123` |
| TimescaleDB | `localhost:5433` db=`sensors` | `postgres` | `jslmind_pg_2024` |
| RedPanda (Kafka) | `localhost:9092` | — | — |
| MQTT Broker (Mosquitto) | `localhost:1883` | — | open |
| MQTT Simulator API | http://localhost:8099 | — | open |

### Phase 6 — Hybrid RAG

| Service | URL | Notes |
|---|---|---|
| **Qdrant Dashboard** | http://localhost:6333/dashboard | open |
| RAG Service API | http://localhost:8001 | open |

### Phase 7 — Agent Builder

| Service | URL | Username | Password |
|---|---|---|---|
| **Dify** | http://localhost:3003 | `admin@jsl.com` ² | `Admin123!` ² |
| Dify API | http://localhost:5001 | — | Bearer token from Dify UI |
| **n8n** | http://localhost:5678 | `admin@jsl.com` ³ | your chosen password ³ |
| LangGraph MCP API | http://localhost:8000 | — | open |

> ² Dify: sign up on first open. Use the suggested credentials above.
> ³ n8n: sign up on first open with any credentials you choose.

### Phase 8 — Unified UI

| Service | URL | Notes |
|---|---|---|
| **JSLMind App** | http://localhost:3000 | Keycloak SSO |
| Kong Proxy | http://localhost:8000 | — |
| Kong Admin API | http://localhost:8002 | — |

---

## Phase 5 — OT/CBM in detail

### Pipeline architecture

```
MQTT Simulator (Python, 1 Hz)
  └─► Mosquitto (MQTT broker)
        └─► Apache Camel / KepwareToKafkaRoute
              └─► RedPanda topic: plant.sensors
                    ├─► Kafka Streams Z-score anomaly detector  ──► TimescaleDB (anomaly_events)
                    │     └─► Temporal CBMWorkflow (cbm-CRM-1)
                    └─► Spring Kafka @KafkaListener              ──► TimescaleDB (sensor_readings)

TimescaleDB ──► Grafana OT Dashboard (5s refresh)
TimescaleDB ──► FastAPI /ot/latest, /ot/alerts (WebSocket) ──► React OT page
TimescaleDB ──► Airflow DAG ot_bronze_export (hourly) ──► MinIO bronze-ot-sensors (Parquet)
```

### Sensor tags (13 total)

| Equipment | Tag | Normal range | Anomaly shift |
|---|---|---|---|
| CRM-1 (Cold Rolling Mill) | `bearing_temp_degC` | 55 ± 0.8 °C | +22 °C |
| CRM-1 | `vibration_mm_s` | 2.5 ± 0.12 mm/s | +7.5 mm/s |
| CRM-1 | `motor_current_amp` | 900 ± 8 A | +280 A |
| CRM-1 | `rolling_force_kN` | 10000 ± 80 kN | +2200 kN |
| CRM-1 | `strip_speed_mpm` | 148 ± 1.2 m/min | — |
| APL-1 (Annealing & Pickling) | `furnace_temp_degC` | 1048 ± 2.5 °C | -60 °C |
| APL-1 | `hno3_concentration_pct` | 20 ± 0.15 % | -6 % |
| APL-1 | `strip_speed_mpm` | 35 ± 0.5 m/min | — |
| APL-1 | `rinse_conductivity_us` | 110 ± 4 µS/cm | +400 µS/cm |
| CCM-1 (Continuous Caster) | `mold_level_mm` | 110 ± 0.6 mm | +18 mm |
| CCM-1 | `casting_speed_mpm` | 1.10 ± 0.008 m/min | — |
| CCM-1 | `mold_cooling_delta_degC` | 11.5 ± 0.25 °C | +9 °C |
| CCM-1 | `tundish_temp_degC` | 1545 ± 1.5 °C | -25 °C |

### Anomaly detection

- **Algorithm:** Welford's online Z-score (running mean + variance, no historical window needed)
- **Threshold:** 5σ — at this level a Gaussian distribution produces a false positive roughly once every 1.7 million samples per tag, making spontaneous false positives effectively impossible during a demo
- **Minimum samples:** 10 readings per tag before detection activates (~10 seconds after startup)

### CBMWorkflow — one per equipment, not per tag

When `bearing_temp`, `vibration`, and `motor_current` on CRM-1 all spike simultaneously, that is **one bearing failure event**, not three separate maintenance requests.

The workflow uses a 10-second correlation window:

1. First anomalous tag on an equipment starts `cbm-CRM-1` in Temporal
2. Subsequent anomalous tags on the same equipment within the window are delivered as `addCorrelatedAnomaly` signals
3. After 10s the workflow runs: `detectAnomaly → scoreConfidence → createSAPNotification → waitForApproval (2 min in demo) → scheduleMaintenance`

In Temporal UI you should see **one** workflow per equipment (e.g. `cbm-CRM-1`), with signal events for each correlated tag in the timeline.

### Verify Phase 5

```bash
bash scripts/verify-phase5.sh

# Check sensor row count
docker compose exec timescaledb psql -U postgres -d sensors \
  -c "SELECT COUNT(*), MAX(time) FROM sensor_readings;"

# Check anomaly events
docker compose exec timescaledb psql -U postgres -d sensors \
  -c "SELECT equipment_id, tag, ROUND(z_score::numeric,2), time FROM anomaly_events ORDER BY time DESC LIMIT 5;"

# Check Kafka topic message count
docker compose exec redpanda rpk topic describe plant.sensors
```

---

## Demo scripts

### Trigger a live CBM anomaly (the WOW moment)

```bash
# Inject a 30-second anomaly on CRM-1 (bearing + vibration + motor current spike)
curl -X POST "http://localhost:8099/inject-anomaly?equipment=CRM-1"

# Within 5-10 seconds you should see in camel-integration logs:
#   [AnomalyProcessor] CBMWorkflow started: cbm-CRM-1 (trigger tag: vibration_mm_s)
#   [AnomalyProcessor] Correlated CRM-1/bearing_temp_degC z=5.xx → cbm-CRM-1
#   [AnomalyProcessor] Correlated CRM-1/motor_current_amp z=5.xx → cbm-CRM-1

# Watch logs in real time
docker compose logs -f camel-integration | grep -E "(ANOMALY|CBMWorkflow|Correlated)"
```

Open **http://localhost:8088** → you should see one `cbm-CRM-1` workflow Running,
with multiple signal events in the timeline view.

Other equipment:
```bash
curl -X POST "http://localhost:8099/inject-anomaly?equipment=APL-1"   # furnace temp + HNO3 drop
curl -X POST "http://localhost:8099/inject-anomaly?equipment=CCM-1"   # tundish temp + mold level
```

### Approve a maintenance work order

```bash
# Manually approve the running cbm-CRM-1 workflow (skips the 2-min auto-timeout)
docker compose exec temporal \
  temporal workflow signal \
  --address temporal:7233 \
  --workflow-id cbm-CRM-1 \
  --name approveMaintenanceSchedule \
  --yes
```

### Terminate all open workflows (reset for fresh demo)

```bash
docker compose exec temporal \
  temporal workflow terminate \
  --address temporal:7233 \
  --namespace default \
  --query "ExecutionStatus='Running'" \
  --reason "demo reset" \
  --yes
```

### RAG query

```bash
curl -s -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "Max carbon content for Grade 316L?", "top_k": 3}' \
  | python3 -m json.tool
```

### Live doc drop (WOW moment — Phase 6)

```bash
echo "JSL Grade 317LMN: Cr 18-19%, Mo 4-5%, N 0.1-0.2%, max C 0.03%." \
  > rag/docs/incoming/demo_drop.txt
sleep 20
curl -s -X POST http://localhost:8001/query \
  -H 'Content-Type: application/json' \
  -d '{"query": "Tell me about Grade 317LMN molybdenum content"}' \
  | python3 -m json.tool
rm rag/docs/incoming/demo_drop.txt
```

### LLM gateway smoke test

```bash
# Cloud model — works immediately
curl -s http://localhost:4000/chat/completions \
  -H "Authorization: Bearer sk-jsl-master" \
  -H "Content-Type: application/json" \
  -d '{"model":"jsl-cloud","messages":[{"role":"user","content":"Name one stainless steel grade."}]}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['choices'][0]['message']['content'])"
```

---

## First-time setup notes

### Phase 2 — Ollama / LiteLLM / Langfuse

1. **Anthropic API key** — set `ANTHROPIC_API_KEY` in `.env`. The `jsl-cloud` model works immediately.

2. **Netskope SSL** — `LiteLLM` has `ssl_verify: false` already set. Ollama image uses `infra/Dockerfile.ollama` which bundles corporate CA certs. Before building:
   ```
   infra/netskope-root.pem
   infra/netskope-intermediate.pem
   ```
   Export from your system keychain or ask IT. Both are gitignored.

3. **Langfuse** — no default account. Sign up at http://localhost:3002, then create API keys and paste into `.env`. Restart LiteLLM after.

### Phase 4 — Airflow Fernet key

Generate before first start:
```bash
python3 -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
# paste as AIRFLOW_FERNET_KEY in .env
```

### Phase 5 — Kafka Streams state reset

If the anomaly processor shows stale statistics after a long uptime (high σ values from old wide data), reset by deleting the changelog topic and consumer group:

```bash
docker compose exec redpanda rpk topic delete jsl-anomaly-detector-anomaly-state-store-changelog
# then restart camel-integration so it starts fresh
docker compose restart camel-integration
```

### Phase 5 — Grafana OT dashboard

If Grafana was started **before** Phase 5 services were brought up, the TimescaleDB datasource provisioning file wasn't loaded. Fix:

```bash
docker compose restart grafana
# Wait 10s, then verify:
curl -s -u admin:admin123 -X POST \
  "http://localhost:3001/api/datasources/uid/timescaledb-uid/health"
# Expected: {"status":"OK"}
```

### Phase 6 — Netskope CA cert for RAG service

```bash
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

The file is gitignored. Re-run when the cert rotates.

### Phase 6 — Generate corpus (one-time)

```bash
pip install reportlab python-docx
python rag/docs/generate_corpus.py
# Expected: 20 files in rag/docs/corpus/
```

`rag-service` auto-seeds Qdrant on startup. Wait 2-3 min for BGE-M3 embeddings:
```bash
docker compose logs -f rag-service   # wait for "Application startup complete"
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| **`mvn package` fails: SSL cert error** | Build runs on host, not in Docker. Ensure corporate CA cert is trusted in your macOS keychain. |
| **`camel-integration` fails: `CBMWorkflow` ClassNotFound** | Run `cd workflows && mvn install -DskipTests` to install to `~/.m2`, then rebuild camel-integration JAR and image. |
| **`cbm-worker` fails: gRPC connect error** | Ensure `workflows/pom.xml` uses `maven-shade-plugin` (not `maven-assembly-plugin`) — shade plugin merges META-INF/services needed by gRPC DNS resolver. |
| **Temporal won't start: "Unsupported driver"** | `docker-compose.yml` must have `DB: postgres12` (not `DB: postgresql`) for the Temporal auto-setup image. Already fixed. |
| **Kafka Streams anomaly processor crashes on startup** | Usually `CBMWorkflow` ClassNotFound — see above. After fix, `docker compose restart camel-integration`. |
| **False positive anomalies without injection** | Z-score threshold is 5.0 — if you still see them, reset Kafka Streams state (delete changelog topic + consumer group, restart camel-integration). |
| **Grafana OT dashboard: "No data"** | TimescaleDB datasource not loaded — `docker compose restart grafana`. Verify: `curl -s -u admin:admin123 -X POST http://localhost:3001/api/datasources/uid/timescaledb-uid/health` |
| **Grafana OT datasource: password auth failed** | `POSTGRES_PASSWORD` env var must be in the `grafana` service in `docker-compose.yml`. Already set. |
| **Too many Temporal workflows** | Batch terminate: `docker compose exec temporal temporal workflow terminate --address temporal:7233 --namespace default --query "ExecutionStatus='Running'" --reason "reset" --yes` |
| **Keycloak won't start** | `docker compose exec postgres psql -U postgres -c "CREATE DATABASE keycloak;"` then restart. |
| **LiteLLM DB error** | `docker compose exec postgres psql -U postgres -c "CREATE DATABASE litellm;"` |
| **Langfuse "Invalid environment variables"** | `SALT` + `ENCRYPTION_KEY` missing — already in `docker-compose.yml`. Re-run `docker compose up -d langfuse-server langfuse-worker`. |
| **Ollama build fails** | Place `netskope-root.pem` + `netskope-intermediate.pem` in `infra/` before building. |
| **Qdrant empty / no vectors after startup** | Corpus not generated — run `python rag/docs/generate_corpus.py` then `docker compose restart rag-service`. |
| **rag-service still seeding (slow)** | Wait 2-3 min. BGE-M3 embeds each chunk via LiteLLM. Watch: `docker compose logs -f rag-service`. |
| **Kong /rag/query 404** | `docker compose up -d kong` |
| **Grafana password out of sync** | Password persists in `grafana_data` volume — update `GRAFANA_ADMIN_PASSWORD` in `.env` to match what you set in the UI. |
| **Reset everything** | `docker compose down -v` (destroys all volumes) then start fresh. |

---

## Port reference

| Port | Service | Phase |
|---|---|---|
| 1883 | Mosquitto (MQTT broker) | 5 |
| 3000 | React Frontend (JSLMind Demo Shell) | 8 |
| 3001 | Grafana | 1 |
| 3002 | Langfuse | 2 |
| 3003 | Dify Web | 7 |
| 3004 | Marquez Web UI | 4 |
| 4000 | LiteLLM Proxy | 2 |
| 5000 | Marquez API | 4 |
| 5001 | Dify API | 7 |
| 5432 | Postgres (main) | 1 |
| 5433 | TimescaleDB (sensors DB) | 5 |
| 5678 | n8n | 7 |
| 6333 | Qdrant | 6 |
| 6379 | Redis | 1 |
| 7007 | Backstage | 3 |
| 7233 | Temporal gRPC | 5 |
| 8000 | Kong Proxy / LangGraph MCP | 7/8 |
| 8001 | RAG Service | 6 |
| 8002 | Kong Admin API | 8 |
| 8080 | Keycloak | 1 |
| 8085 | Airflow | 4 |
| 8088 | Temporal UI | 5 |
| 8090 | Camel Integration (actuator) | 4/5 |
| 8099 | MQTT Simulator API | 5 |
| 9000 | MinIO API | 4 |
| 9001 | MinIO Console | 4 |
| 9090 | Prometheus | 1 |
| 9092 | RedPanda (Kafka external) | 5 |
| 11434 | Ollama | 2 |
