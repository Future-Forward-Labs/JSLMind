"""
Seed the RAG index with the pre-generated corpus.
Run once at startup if the Qdrant collection is empty.

Usage (inside container):
    python seed_corpus.py
"""

import os
import sys
import time
from pathlib import Path

CORPUS_DIR = Path("/docs/corpus")


def _wait_for_qdrant(client, max_attempts: int = 12, delay: float = 5.0):
    """Retry until Qdrant is reachable or max_attempts exceeded."""
    for attempt in range(1, max_attempts + 1):
        try:
            client.get_collections()
            return
        except Exception as e:
            print(f"Qdrant not ready (attempt {attempt}/{max_attempts}): {e}")
            if attempt < max_attempts:
                time.sleep(delay)
    print("Qdrant did not become ready in time — skipping seed.")
    sys.exit(0)  # exit 0 so uvicorn still starts


def main():
    if not CORPUS_DIR.exists() or not any(CORPUS_DIR.iterdir()):
        print(f"No corpus found at {CORPUS_DIR} — skipping seed.")
        return

    import time
    from qdrant_client import QdrantClient

    qdrant_url = os.environ.get("QDRANT_URL", "http://qdrant:6333")
    client = QdrantClient(url=qdrant_url)

    _wait_for_qdrant(client)

    if client.collection_exists("jsl_docs"):
        count = client.count("jsl_docs").count
        if count > 0:
            print(f"Collection jsl_docs already has {count} vectors — skipping seed.")
            return

    from app import _get_pipeline
    pipeline = _get_pipeline()

    files = list(CORPUS_DIR.glob("*"))
    print(f"Seeding {len(files)} documents from {CORPUS_DIR} …")
    for f in files:
        if f.suffix.lower() in (".pdf", ".docx", ".doc", ".xlsx", ".txt"):
            result = pipeline.process(str(f))
            print(f"  ✓ {f.name}: {result['chunks']} chunks")

    print("Seed complete.")


if __name__ == "__main__":
    main()
