"""
JSLMind RAG Service — FastAPI app (port 8001)
Endpoints:
  GET  /health        — liveness probe
  POST /ingest        — called by Camel on new file drop
  POST /query         — hybrid RAG query (exposed via Kong at /rag/query)
  GET  /ot/latest     — most recent sensor reading per (equipment_id, tag)
  WS   /ot/alerts     — WebSocket: push anomaly alerts to connected clients
  POST /ot/alert      — called by Kafka Streams processor on anomaly detection
"""

import asyncio
import os
import logging
from pathlib import Path
from typing import Optional, Dict

import psycopg2
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from qdrant_client import QdrantClient

from ingestion.bm25_store import BM25Store
from ingestion.embedding_pipeline import EmbeddingPipeline
from retrieval.hybrid_retriever import HybridRetriever

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

QDRANT_URL = os.environ.get("QDRANT_URL", "http://qdrant:6333")
TSDB_DSN   = os.environ.get("TIMESCALEDB_DSN",
    "host=timescaledb port=5432 dbname=sensors user=postgres password=postgres")
LITELLM_BASE_URL = os.environ.get("LITELLM_BASE_URL", "http://litellm-proxy:4000")
LITELLM_API_KEY = os.environ.get("LITELLM_API_KEY", "sk-jsl-master")
EMBED_MODEL = os.environ.get("EMBED_MODEL", "jsl-embed")
GENERATE_MODEL = os.environ.get("GENERATE_MODEL", "jsl-quality")
BM25_INDEX_PATH = os.environ.get("BM25_INDEX_PATH", "/docs/bm25_index.pkl")
COLLECTION = "jsl_docs"

# Singletons — initialised lazily on first request so that tests can patch
# QdrantClient / BM25Store / EmbeddingPipeline / HybridRetriever before the
# constructors are called.
_qdrant_client: Optional[QdrantClient] = None
_bm25_store: Optional[BM25Store] = None
_pipeline: Optional[EmbeddingPipeline] = None
_retriever: Optional[HybridRetriever] = None


def _get_qdrant_client() -> QdrantClient:
    global _qdrant_client
    if _qdrant_client is None:
        _qdrant_client = QdrantClient(url=QDRANT_URL)
    return _qdrant_client


def _get_bm25_store() -> BM25Store:
    global _bm25_store
    if _bm25_store is None:
        _bm25_store = BM25Store(index_path=BM25_INDEX_PATH)
    return _bm25_store


def _get_pipeline() -> EmbeddingPipeline:
    global _pipeline
    if _pipeline is None:
        _pipeline = EmbeddingPipeline(
            qdrant_client=_get_qdrant_client(),
            bm25_store=_get_bm25_store(),
            litellm_base_url=LITELLM_BASE_URL,
            litellm_api_key=LITELLM_API_KEY,
            embed_model=EMBED_MODEL,
            collection=COLLECTION,
        )
    return _pipeline


def _get_retriever() -> HybridRetriever:
    global _retriever
    if _retriever is None:
        _retriever = HybridRetriever(
            qdrant_client=_get_qdrant_client(),
            bm25_store=_get_bm25_store(),
            litellm_base_url=LITELLM_BASE_URL,
            litellm_api_key=LITELLM_API_KEY,
            embed_model=EMBED_MODEL,
            generate_model=GENERATE_MODEL,
            collection=COLLECTION,
        )
    return _retriever


app = FastAPI(title="JSLMind RAG Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class IngestRequest(BaseModel):
    file_path: str


class QueryRequest(BaseModel):
    query: str
    filters: Optional[Dict[str, str]] = None
    top_k: int = 5


@app.get("/health")
def health():
    return {"status": "ok", "service": "rag-service"}


@app.post("/ingest")
def ingest(req: IngestRequest):
    if not Path(req.file_path).exists():
        raise HTTPException(status_code=404, detail=f"File not found: {req.file_path}")
    logger.info(f"Ingesting: {req.file_path}")
    result = _get_pipeline().process(req.file_path)
    logger.info(f"Indexed {result['chunks']} chunks from {req.file_path}")
    return result


@app.post("/query")
def query(req: QueryRequest):
    logger.info(f"Query: {req.query!r} filters={req.filters}")
    return _get_retriever().query(req.query, filters=req.filters, top_k=req.top_k)


# ── OT / CBM Streaming Endpoints ─────────────────────────────────────────────

_alert_subscribers: list[WebSocket] = []


@app.get("/ot/latest")
def ot_latest():
    """Most recent reading per (equipment_id, tag)."""
    conn = psycopg2.connect(TSDB_DSN)
    with conn.cursor() as cur:
        cur.execute("""
            SELECT DISTINCT ON (equipment_id, tag)
                equipment_id, tag, value, unit, time
            FROM sensor_readings
            ORDER BY equipment_id, tag, time DESC
        """)
        rows = cur.fetchall()
    conn.close()
    return {
        f"{r[0]}|{r[1]}": {
            "equipment_id": r[0],
            "tag":          r[1],
            "value":        r[2],
            "unit":         r[3],
            "timestamp":    r[4].isoformat(),
        }
        for r in rows
    }


@app.websocket("/ot/alerts")
async def ot_alerts_ws(ws: WebSocket):
    await ws.accept()
    _alert_subscribers.append(ws)
    try:
        while True:
            await asyncio.sleep(30)
    except WebSocketDisconnect:
        _alert_subscribers.remove(ws)


@app.post("/ot/alert")
async def receive_alert(alert: dict):
    """Kafka Streams processor POSTs here on anomaly detection."""
    dead = []
    for ws in _alert_subscribers:
        try:
            await ws.send_json(alert)
        except Exception:
            dead.append(ws)
    for ws in dead:
        _alert_subscribers.remove(ws)
    return {"status": "broadcast", "subscribers": len(_alert_subscribers)}
