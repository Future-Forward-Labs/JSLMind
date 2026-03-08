import pytest
from unittest.mock import patch
import tempfile
import os

from ingestion.bm25_store import BM25Store


@pytest.fixture
def tmp_index(tmp_path):
    return str(tmp_path / "bm25.pkl")


def test_empty_store_returns_no_results(tmp_index):
    store = BM25Store(index_path=tmp_index)
    results = store.search("carbon content", top_k=5)
    assert results == []


def test_add_and_search_returns_matching_chunk(tmp_index):
    store = BM25Store(index_path=tmp_index)
    store.add_chunks([
        {"id": "chunk-1", "text": "Carbon (C): max 0.03% for Grade 316L stainless steel"},
        {"id": "chunk-2", "text": "Chromium (Cr): 16.0–18.0% for Grade 316L"},
        {"id": "chunk-3", "text": "Annual furnace maintenance schedule for annealing"},
    ])
    results = store.search("carbon content 316L", top_k=2)
    assert len(results) == 2
    assert results[0]["id"] == "chunk-1"
    assert results[0]["score"] > 0


def test_persist_and_reload(tmp_index):
    store = BM25Store(index_path=tmp_index)
    store.add_chunks([
        {"id": "chunk-a", "text": "Tensile strength 485 MPa minimum"},
    ])
    store.save()

    store2 = BM25Store(index_path=tmp_index)
    store2.load()
    results = store2.search("tensile strength", top_k=1)
    assert len(results) == 1
    assert results[0]["id"] == "chunk-a"


def test_search_returns_scores_between_0_and_1(tmp_index):
    store = BM25Store(index_path=tmp_index)
    store.add_chunks([
        {"id": "c1", "text": "maximum carbon content grade 304"},
        {"id": "c2", "text": "bearing replacement schedule"},
    ])
    results = store.search("carbon", top_k=2)
    for r in results:
        assert 0.0 <= r["score"] <= 1.0
