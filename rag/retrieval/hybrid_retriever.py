"""
Hybrid RAG retriever — RRF fusion of Qdrant dense search and BM25 sparse search.
"""

import httpx
from typing import List, Dict, Optional, Any

from qdrant_client import QdrantClient
from qdrant_client.models import Filter, FieldCondition, MatchValue

from ingestion.bm25_store import BM25Store

RRF_K = 60


def rrf_fuse(
    dense: List[Dict],
    sparse: List[Dict],
    top_k: int = 8,
) -> List[Dict]:
    """
    Reciprocal Rank Fusion: score(d) = Σ 1 / (k + rank_i(d))
    """
    scores: Dict[str, float] = {}
    payload: Dict[str, Dict] = {}

    for rank, item in enumerate(dense):
        doc_id = item["id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank + 1)
        payload[doc_id] = item

    for rank, item in enumerate(sparse):
        doc_id = item["id"]
        scores[doc_id] = scores.get(doc_id, 0.0) + 1.0 / (RRF_K + rank + 1)
        if doc_id not in payload:
            payload[doc_id] = item

    merged = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    result = []
    for doc_id, rrf_score in merged[:top_k]:
        entry = {**payload[doc_id], "rrf_score": rrf_score}
        result.append(entry)
    return result


class HybridRetriever:
    def __init__(
        self,
        qdrant_client: QdrantClient,
        bm25_store: BM25Store,
        litellm_base_url: str,
        litellm_api_key: str,
        embed_model: str,
        generate_model: str,
        collection: str = "jsl_docs",
    ):
        self._qdrant = qdrant_client
        self._bm25 = bm25_store
        self._litellm = litellm_base_url.rstrip("/")
        self._api_key = litellm_api_key
        self._embed_model = embed_model
        self._generate_model = generate_model
        self._collection = collection

    def _embed_query(self, query: str) -> List[float]:
        resp = httpx.post(
            f"{self._litellm}/v1/embeddings",
            json={"model": self._embed_model, "input": [query]},
            headers={"Authorization": f"Bearer {self._api_key}"},
            timeout=30.0,
        )
        resp.raise_for_status()
        return resp.json()["data"][0]["embedding"]

    def _build_qdrant_filter(self, filters: Optional[Dict]) -> Optional[Filter]:
        if not filters:
            return None
        conditions = [
            FieldCondition(key=k, match=MatchValue(value=v))
            for k, v in filters.items()
        ]
        return Filter(must=conditions)

    def _generate_answer(self, query: str, chunks: List[Dict]) -> str:
        context = "\n\n".join(
            f"[Source: {c.get('doc_name', c.get('payload', {}).get('doc_name', 'unknown'))}, "
            f"Section: {c.get('section', c.get('payload', {}).get('section', ''))}, "
            f"Page: {c.get('page', c.get('payload', {}).get('page', '?'))}]\n"
            f"{c.get('text', c.get('payload', {}).get('text', ''))}"
            for c in chunks
        )
        messages = [
            {
                "role": "system",
                "content": (
                    "You are a technical assistant for Jindal Stainless Limited. "
                    "Answer questions using ONLY the provided context. "
                    "Always cite the source document name, section, and page number. "
                    "If the answer is not in the context, say 'Not found in indexed documents.'"
                ),
            },
            {
                "role": "user",
                "content": f"Context:\n{context}\n\nQuestion: {query}",
            },
        ]
        resp = httpx.post(
            f"{self._litellm}/v1/chat/completions",
            json={"model": self._generate_model, "messages": messages, "temperature": 0.1},
            headers={"Authorization": f"Bearer {self._api_key}"},
            timeout=60.0,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]

    def query(
        self,
        query: str,
        filters: Optional[Dict] = None,
        top_k: int = 5,
    ) -> Dict[str, Any]:
        query_vector = self._embed_query(query)
        qdrant_filter = self._build_qdrant_filter(filters)

        dense_hits = self._qdrant.search(
            collection_name=self._collection,
            query_vector=query_vector,
            limit=20,
            query_filter=qdrant_filter,
        )
        dense_results = [
            {
                "id": str(hit.id),
                "score": hit.score,
                "text": hit.payload.get("text", ""),
                "doc_name": hit.payload.get("doc_name", ""),
                "doc_type": hit.payload.get("doc_type", ""),
                "grade": hit.payload.get("grade", ""),
                "section": hit.payload.get("section", ""),
                "page": hit.payload.get("page", 1),
            }
            for hit in dense_hits
        ]

        sparse_results = self._bm25.search(query, top_k=20)

        merged = rrf_fuse(dense_results, sparse_results, top_k=8)

        answer = self._generate_answer(query, merged)

        sources = [
            {
                "doc": r.get("doc_name", ""),
                "section": r.get("section", ""),
                "page": r.get("page", 1),
                "score": round(r["rrf_score"], 4),
                "chunk": r.get("text", "")[:200],
            }
            for r in merged[:top_k]
        ]

        return {
            "answer": answer,
            "sources": sources,
            "retrieval_debug": {
                "dense_hits": len(dense_results),
                "sparse_hits": len(sparse_results),
                "rrf_merged": len(merged),
            },
        }
