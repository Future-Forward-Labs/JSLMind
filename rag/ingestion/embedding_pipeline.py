"""
Embedding pipeline: file → chunks (unstructured) → embeddings (LiteLLM jsl-embed) → Qdrant + BM25.
"""

import re
import uuid
import httpx
from pathlib import Path
from typing import List, Dict, Any

from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct

from ingestion.bm25_store import BM25Store

EMBED_DIM = 1024
COLLECTION = "jsl_docs"


def _infer_grade(filename: str) -> str:
    for grade in ["316L", "304", "430"]:
        if grade in filename:
            return grade
    return "unknown"


def _infer_doc_type(filename: str) -> str:
    fname = filename.lower()
    if "sop" in fname:
        return "sop"
    if "spec" in fname or "specification" in fname:
        return "spec"
    if "mainten" in fname or "manual" in fname:
        return "maintenance"
    if "checklist" in fname or "qc" in fname or "inspection" in fname:
        return "qc"
    if "sap" in fname:
        return "sap_process"
    if "safety" in fname or "environment" in fname or "compliance" in fname:
        return "policy"
    return "general"


def _extract_text_plain(file_path: str) -> List[Dict]:
    text = Path(file_path).read_text(errors="replace")
    paragraphs = [p.strip() for p in text.split("\n\n") if p.strip()]
    doc_name = Path(file_path).name
    return [
        {
            "text": p,
            "metadata": {
                "doc_name": doc_name,
                "grade": _infer_grade(doc_name),
                "doc_type": _infer_doc_type(doc_name),
                "section": f"paragraph-{i+1}",
                "page": 1,
            },
        }
        for i, p in enumerate(paragraphs)
    ]


def _extract_with_unstructured(file_path: str) -> List[Dict]:
    from unstructured.partition.auto import partition
    elements = partition(filename=file_path)
    doc_name = Path(file_path).name
    chunks = []
    current_section = "Introduction"
    current_page = 1

    for el in elements:
        el_type = type(el).__name__
        text = str(el).strip()
        if not text:
            continue
        if el_type in ("Title", "Header"):
            current_section = text[:80]
        if hasattr(el, "metadata") and hasattr(el.metadata, "page_number"):
            pg = el.metadata.page_number
            if pg:
                current_page = pg
        if len(text) < 20:
            continue
        chunks.append({
            "text": text,
            "metadata": {
                "doc_name": doc_name,
                "grade": _infer_grade(doc_name),
                "doc_type": _infer_doc_type(doc_name),
                "section": current_section,
                "page": current_page,
            },
        })

    return chunks if chunks else _extract_text_plain(file_path)


def extract_chunks(file_path: str) -> List[Dict]:
    suffix = Path(file_path).suffix.lower()
    if suffix in (".pdf", ".docx", ".xlsx", ".doc"):
        try:
            return _extract_with_unstructured(file_path)
        except Exception:
            pass
    return _extract_text_plain(file_path)


def _ensure_collection(client: QdrantClient, collection: str) -> None:
    if not client.collection_exists(collection):
        client.create_collection(
            collection_name=collection,
            vectors_config=VectorParams(size=EMBED_DIM, distance=Distance.COSINE),
        )


def upsert_to_qdrant(
    client: QdrantClient,
    collection: str,
    chunks: List[Dict],
) -> None:
    _ensure_collection(client, collection)
    points = [
        PointStruct(
            id=str(uuid.uuid4()),
            vector=c["embedding"],
            payload={
                "text": c["text"],
                **c["metadata"],
            },
        )
        for c in chunks
    ]
    client.upsert(collection_name=collection, points=points)


class EmbeddingPipeline:
    def __init__(
        self,
        qdrant_client: QdrantClient,
        bm25_store: BM25Store,
        litellm_base_url: str,
        litellm_api_key: str,
        embed_model: str,
        collection: str = COLLECTION,
    ):
        self._qdrant = qdrant_client
        self._bm25 = bm25_store
        self._litellm_base_url = litellm_base_url.rstrip("/")
        self._litellm_api_key = litellm_api_key
        self._embed_model = embed_model
        self._collection = collection

    def _embed(self, texts: List[str]) -> List[List[float]]:
        all_embeddings = []
        batch_size = 32
        for i in range(0, len(texts), batch_size):
            batch = texts[i : i + batch_size]
            resp = httpx.post(
                f"{self._litellm_base_url}/v1/embeddings",
                json={"model": self._embed_model, "input": batch},
                headers={"Authorization": f"Bearer {self._litellm_api_key}"},
                timeout=60.0,
            )
            resp.raise_for_status()
            data = resp.json()["data"]
            all_embeddings.extend([d["embedding"] for d in data])
        return all_embeddings

    def process(self, file_path: str) -> Dict[str, Any]:
        doc_id = str(uuid.uuid4())
        raw_chunks = extract_chunks(file_path)
        if not raw_chunks:
            return {"doc_id": doc_id, "chunks": 0, "status": "empty"}

        texts = [c["text"] for c in raw_chunks]
        embeddings = self._embed(texts)

        qdrant_chunks = [
            {**raw_chunks[i], "embedding": embeddings[i], "id": f"{doc_id}-{i}"}
            for i in range(len(raw_chunks))
        ]
        upsert_to_qdrant(self._qdrant, self._collection, qdrant_chunks)

        bm25_chunks = [
            {"id": f"{doc_id}-{i}", "text": raw_chunks[i]["text"]}
            for i in range(len(raw_chunks))
        ]
        self._bm25.add_chunks(bm25_chunks)
        self._bm25.save()

        return {"doc_id": doc_id, "chunks": len(raw_chunks), "status": "indexed"}
