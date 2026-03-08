"""
BM25 sparse index — persisted to disk as a pickle.
Complements Qdrant dense search in the hybrid RRF retriever.
"""

import os
import pickle
from typing import List, Dict, Optional

from rank_bm25 import BM25Okapi


class BM25Store:
    def __init__(self, index_path: str = "/docs/bm25_index.pkl"):
        self._index_path = index_path
        self._chunks: List[Dict] = []   # [{id, text}, ...]
        self._bm25: Optional[BM25Okapi] = None
        if os.path.exists(index_path):
            self.load()

    # ── write ──────────────────────────────────────────────────────────────
    def add_chunks(self, chunks: List[Dict]) -> None:
        """Add chunks and rebuild the BM25 index."""
        self._chunks.extend(chunks)
        self._rebuild()

    def _rebuild(self) -> None:
        if not self._chunks:
            self._bm25 = None
            return
        tokenised = [c["text"].lower().split() for c in self._chunks]
        self._bm25 = BM25Okapi(tokenised)

    def save(self) -> None:
        os.makedirs(os.path.dirname(self._index_path) or ".", exist_ok=True)
        with open(self._index_path, "wb") as f:
            pickle.dump({"chunks": self._chunks}, f)

    def load(self) -> None:
        with open(self._index_path, "rb") as f:
            data = pickle.load(f)
        self._chunks = data["chunks"]
        self._rebuild()

    # ── read ───────────────────────────────────────────────────────────────
    def search(self, query: str, top_k: int = 20) -> List[Dict]:
        """Return [{id, text, score}] sorted by BM25 score descending, normalised 0–1."""
        if self._bm25 is None or not self._chunks:
            return []
        tokens = query.lower().split()
        raw_scores = self._bm25.get_scores(tokens)
        max_score = max(raw_scores) if max(raw_scores) > 0 else 1.0
        ranked = sorted(
            [
                {"id": self._chunks[i]["id"],
                 "text": self._chunks[i]["text"],
                 "score": float(raw_scores[i] / max_score)}
                for i in range(len(self._chunks))
            ],
            key=lambda x: x["score"],
            reverse=True,
        )
        return ranked[:top_k]
