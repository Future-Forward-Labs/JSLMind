"""
Seed the RAG index with the pre-generated corpus.
Run once at startup if the Qdrant collection is empty.

Usage (inside container):
    python seed_corpus.py
"""

import os
import sys
from pathlib import Path

CORPUS_DIR = Path("/docs/corpus")


def main():
    if not CORPUS_DIR.exists() or not any(CORPUS_DIR.iterdir()):
        print(f"No corpus found at {CORPUS_DIR} — skipping seed.")
        return

    from qdrant_client import QdrantClient

    qdrant_url = os.environ.get("QDRANT_URL", "http://qdrant:6333")
    client = QdrantClient(url=qdrant_url)

    if client.collection_exists("jsl_docs"):
        count = client.count("jsl_docs").count
        if count > 0:
            print(f"Collection jsl_docs already has {count} vectors — skipping seed.")
            return

    # Import pipeline after qdrant check to avoid creating singletons unnecessarily
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
