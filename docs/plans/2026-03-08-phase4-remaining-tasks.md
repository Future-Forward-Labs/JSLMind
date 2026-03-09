# Phase 4 — Remaining Tasks (Resume Here)

> **Status:** Tasks 1–6 complete. Resume from Task 7.
> **Full plan:** `docs/plans/2026-03-08-phase4-hybrid-rag.md`

---

## Progress Summary

| Task | Status |
|---|---|
| 1 — Synthetic Document Corpus Generator | ✅ Done |
| 2 — BM25 Store | ✅ Done |
| 3 — Embedding Pipeline | ✅ Done |
| 4 — Hybrid Retriever (RRF Fusion) | ✅ Done |
| 5 — Combined FastAPI App | ✅ Done |
| 6 — RAG Service Docker Build | ✅ Done |
| 7 — Camel FileToQdrantRoute | ✅ Done |
| 8 — Docker Compose volume update | ✅ Done |
| 9 — Backstage Catalog Entity | ✅ Done |
| 10 — Verification Script | ✅ Done |

---

## What's Already Built

```
rag/
├── app.py                        ← FastAPI: GET /health, POST /ingest, POST /query (port 8001)
├── ingestion/
│   ├── bm25_store.py             ← BM25 sparse index, pickle persist
│   └── embedding_pipeline.py    ← unstructured → BGE-M3 → Qdrant + BM25
├── retrieval/
│   └── hybrid_retriever.py      ← RRF fusion + LLM answer with citations
├── seed_corpus.py                ← seeds Qdrant from /docs/corpus/ on container startup
├── tests/                        ← 22 tests, all passing
├── docs/
│   ├── generate_corpus.py        ← generates 20 synthetic JSL PDFs/Word docs
│   ├── corpus/                   ← generated (gitignored), 20 files
│   └── incoming/                 ← Camel watches this dir for live doc drops
├── Dockerfile                    ← python:3.11-slim, Netskope CA cert, port 8001
├── netskope-ca-bundle.pem        ← corporate proxy CA cert (needed for pip install)
└── requirements.txt
```

**Docker image:** `jslmind-rag:local` (2.78 GB) — already built locally.

---

## Task 7: Camel FileToQdrantRoute

**Goal:** Create the Apache Camel SpringBoot project that watches `rag/docs/incoming/` and POSTs new file paths to `/ingest`.

**Files to create:**
```
integration/
├── pom.xml                        ← Camel 4.6, Java 21, camel-file + camel-http
├── Dockerfile                     ← maven build → eclipse-temurin:21-jre
├── src/main/resources/
│   └── application.properties    ← rag.ingest.url, rag.watch.dir config
└── src/main/java/com/jslmind/integration/
    ├── JSLMindIntegrationApp.java
    └── routes/
        ├── FileToQdrantRoute.java  ← file:// watcher → POST /ingest (KEY ROUTE)
        └── SapToBronzeRoute.java  ← stub (timer log only)
```

**Full code** is in `docs/plans/2026-03-08-phase4-hybrid-rag.md` Task 7.

**Verify with:** `cd integration && mvn package -DskipTests` → `BUILD SUCCESS`

**Commit:** `feat: add Camel SpringBoot integration with FileToQdrantRoute`

---

## Task 8: Docker Compose volume update

**Goal:** Add shared `/docs` volume and RAG env vars to `camel-integration` service so Camel can watch the same directory.

**File to modify:** `docker-compose.yml` — find the `camel-integration` service block and update it to:

```yaml
  camel-integration:
    build:
      context: ./integration
      dockerfile: Dockerfile
    environment:
      MINIO_ENDPOINT: http://minio:9000
      MINIO_ACCESS_KEY: ${MINIO_ROOT_USER}
      MINIO_SECRET_KEY: ${MINIO_ROOT_PASSWORD}
      RAG_INGEST_URL: http://rag-service:8001/ingest
      RAG_WATCH_DIR: /docs/incoming
      SPRING_PROFILES_ACTIVE: demo
    volumes:
      - ./rag/docs:/docs          # shared with rag-service; Camel watches /docs/incoming
    ports:
      - "8090:8080"
    networks: [jslmind]
    depends_on:
      minio:
        condition: service_healthy
      rag-service:
        condition: service_started
    restart: unless-stopped
```

**Verify with:** `docker compose config --quiet` → no errors

**Commit:** `fix: add shared /docs volume and RAG env vars to camel-integration`

---

## Task 9: Backstage Catalog Entity

**Goal:** Register the RAG pipeline as a Backstage Component.

**File to create:** `catalog/data-products/rag-pipeline.yaml`:

```yaml
apiVersion: backstage.io/v1alpha1
kind: Component
metadata:
  name: rag-pipeline
  description: >
    Hybrid RAG pipeline on JSL documents — SOPs, grade specifications, and
    maintenance manuals. Supports dense (BGE-M3/Qdrant) + sparse (BM25) retrieval
    fused via Reciprocal Rank Fusion. Exposes POST /rag/query through Kong.
  annotations:
    backstage.io/techdocs-ref: dir:.
    demo/ui: "RAG Pipeline — query JSL docs with hybrid retrieval and source citations"
    demo/wow: "Drop a new PDF into rag/docs/incoming/ — Camel auto-indexes it in <20s"
spec:
  type: service
  lifecycle: production
  owner: platform-team
  system: jslmind-platform
  providesApis:
    - rag-query-api
```

**File to modify:** `catalog/catalog-info.yaml` — add this line to the `targets` list:
```yaml
    - ./data-products/rag-pipeline.yaml
```

**Commit:** `feat: register RAG pipeline in Backstage catalog`

---

## Task 10: Verification Script

**Goal:** `scripts/verify-phase6.sh` with 10 end-to-end checks.

**Full script code** is in `docs/plans/2026-03-08-phase4-hybrid-rag.md` Task 10.

Checks:
1. `rag-service /health` returns ok
2. Qdrant collection `jsl_docs` exists
3. Qdrant has >100 vectors
4. BM25 index file exists in container
5. `/query` returns `answer` field
6. `/query` returns at least 1 source citation
7. `/query` with grade filter succeeds
8. Kong `/rag/query` returns 200
9. Camel `FileToQdrantRoute` health UP
10. Backstage shows `rag-pipeline` entity
11. Live drop test (drag file → indexed in 8s)

**Make executable:** `chmod +x scripts/verify-phase6.sh`

**Commit:** `test: add verify-phase6 script for Hybrid RAG end-to-end checks`

---

## How to Resume

To continue with subagent-driven execution, open a new session and use:
```
superpowers:executing-plans
```
with `docs/plans/2026-03-08-phase4-hybrid-rag.md` as the plan, starting from Task 7.

Or continue in this session by invoking `superpowers:subagent-driven-development` again.
