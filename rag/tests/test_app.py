import pytest
from unittest.mock import MagicMock, patch
from fastapi.testclient import TestClient


@pytest.fixture
def client():
    with patch("app.QdrantClient") as mock_qdrant_cls, \
         patch("app.BM25Store") as mock_bm25_cls, \
         patch("app.EmbeddingPipeline") as mock_pipeline_cls, \
         patch("app.HybridRetriever") as mock_retriever_cls:

        mock_pipeline_cls.return_value.process.return_value = {
            "doc_id": "test-id", "chunks": 12, "status": "indexed"
        }
        mock_retriever_cls.return_value.query.return_value = {
            "answer": "Max carbon for 316L is 0.03%.",
            "sources": [
                {"doc": "Grade_316L_Specification.pdf",
                 "section": "3.2 Chemical Composition",
                 "page": 4, "score": 0.91,
                 "chunk": "Carbon (C): max 0.03%"}
            ],
            "retrieval_debug": {"dense_hits": 20, "sparse_hits": 20, "rrf_merged": 8},
        }

        from app import app
        yield TestClient(app)


def test_health_returns_ok(client):
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


def test_ingest_returns_indexed(client, tmp_path):
    txt = tmp_path / "test.txt"
    txt.write_text("Carbon max 0.03%")
    resp = client.post("/ingest", json={"file_path": str(txt)})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "indexed"
    assert body["chunks"] == 12


def test_ingest_missing_file_returns_404(client):
    resp = client.post("/ingest", json={"file_path": "/nonexistent/file.pdf"})
    assert resp.status_code == 404


def test_query_returns_answer_and_sources(client):
    resp = client.post("/query", json={"query": "Max carbon for 316L?"})
    assert resp.status_code == 200
    body = resp.json()
    assert "answer" in body
    assert "sources" in body
    assert len(body["sources"]) > 0


def test_query_with_filters(client):
    resp = client.post("/query", json={
        "query": "surface finish",
        "filters": {"grade": "316L"},
        "top_k": 3,
    })
    assert resp.status_code == 200
