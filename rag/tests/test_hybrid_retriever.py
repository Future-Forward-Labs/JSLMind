import pytest
from unittest.mock import MagicMock, patch

from retrieval.hybrid_retriever import rrf_fuse, HybridRetriever


def test_rrf_fuse_combines_two_lists():
    dense = [{"id": "a", "score": 0.9}, {"id": "b", "score": 0.7}]
    sparse = [{"id": "b", "score": 1.0}, {"id": "c", "score": 0.5}]
    result = rrf_fuse(dense, sparse, top_k=3)
    ids = [r["id"] for r in result]
    assert "b" in ids
    assert len(result) == 3


def test_rrf_fuse_respects_top_k():
    dense = [{"id": str(i), "score": 1.0 - i*0.1} for i in range(10)]
    sparse = [{"id": str(i), "score": 1.0 - i*0.1} for i in range(10)]
    result = rrf_fuse(dense, sparse, top_k=5)
    assert len(result) == 5


def test_rrf_fuse_scores_sorted_descending():
    dense = [{"id": "x", "score": 0.5}, {"id": "y", "score": 0.8}]
    sparse = [{"id": "y", "score": 0.9}, {"id": "z", "score": 0.3}]
    result = rrf_fuse(dense, sparse, top_k=3)
    scores = [r["rrf_score"] for r in result]
    assert scores == sorted(scores, reverse=True)


def test_rrf_fuse_empty_inputs():
    result = rrf_fuse([], [], top_k=5)
    assert result == []


def _make_qdrant_hit(chunk_id: str, text: str, score: float, grade: str = "304"):
    hit = MagicMock()
    hit.id = chunk_id
    hit.score = score
    hit.payload = {
        "text": text,
        "doc_name": "Grade_304_Specification.pdf",
        "doc_type": "spec",
        "grade": grade,
        "section": "3.2 Chemical Composition",
        "page": 4,
    }
    return hit


@patch("retrieval.hybrid_retriever.httpx.post")
def test_retriever_returns_answer_with_sources(mock_post):
    embed_resp = MagicMock()
    embed_resp.json.return_value = {"data": [{"embedding": [0.1] * 1024}]}
    embed_resp.raise_for_status = MagicMock()

    llm_resp = MagicMock()
    llm_resp.json.return_value = {
        "choices": [{"message": {"content": "Max carbon for 316L is 0.03%."}}]
    }
    llm_resp.raise_for_status = MagicMock()

    mock_post.side_effect = [embed_resp, llm_resp]

    mock_qdrant = MagicMock()
    mock_qdrant.search.return_value = [
        _make_qdrant_hit("c1", "Carbon (C): max 0.03%", 0.95, "316L"),
        _make_qdrant_hit("c2", "Chromium (Cr): 16.0-18.0%", 0.80, "316L"),
    ]

    mock_bm25 = MagicMock()
    mock_bm25.search.return_value = [
        {"id": "c1", "text": "Carbon (C): max 0.03%", "score": 1.0},
    ]

    retriever = HybridRetriever(
        qdrant_client=mock_qdrant,
        bm25_store=mock_bm25,
        litellm_base_url="http://fake:4000",
        litellm_api_key="fake",
        embed_model="jsl-embed",
        generate_model="jsl-quality",
        collection="jsl_docs",
    )
    result = retriever.query("Max carbon content for Grade 316L?", top_k=3)

    assert "answer" in result
    assert "sources" in result
    assert len(result["sources"]) > 0
    assert "retrieval_debug" in result
    assert result["retrieval_debug"]["dense_hits"] == 2


@patch("retrieval.hybrid_retriever.httpx.post")
def test_retriever_applies_grade_filter(mock_post):
    embed_resp = MagicMock()
    embed_resp.json.return_value = {"data": [{"embedding": [0.1] * 1024}]}
    embed_resp.raise_for_status = MagicMock()
    llm_resp = MagicMock()
    llm_resp.json.return_value = {"choices": [{"message": {"content": "answer"}}]}
    llm_resp.raise_for_status = MagicMock()
    mock_post.side_effect = [embed_resp, llm_resp]

    mock_qdrant = MagicMock()
    mock_qdrant.search.return_value = []
    mock_bm25 = MagicMock()
    mock_bm25.search.return_value = []

    retriever = HybridRetriever(
        qdrant_client=mock_qdrant,
        bm25_store=mock_bm25,
        litellm_base_url="http://fake:4000",
        litellm_api_key="fake",
        embed_model="jsl-embed",
        generate_model="jsl-quality",
        collection="jsl_docs",
    )
    retriever.query("carbon content", filters={"grade": "316L"}, top_k=5)

    call_kwargs = mock_qdrant.search.call_args[1]
    assert call_kwargs.get("query_filter") is not None
