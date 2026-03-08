import pytest
from unittest.mock import MagicMock, patch
from pathlib import Path

from ingestion.embedding_pipeline import (
    extract_chunks,
    upsert_to_qdrant,
    EmbeddingPipeline,
)


def test_extract_chunks_returns_list_of_dicts(tmp_path):
    txt_file = tmp_path / "test.txt"
    txt_file.write_text("Carbon (C): max 0.03%\n\nChromium (Cr): 16.0-18.0%")
    chunks = extract_chunks(str(txt_file))
    assert isinstance(chunks, list)
    assert len(chunks) > 0
    for c in chunks:
        assert "text" in c
        assert "metadata" in c
        assert "doc_name" in c["metadata"]


def test_extract_chunks_infers_grade_from_filename(tmp_path):
    txt_file = tmp_path / "Grade_316L_Specification.txt"
    txt_file.write_text("Carbon (C): max 0.03%")
    chunks = extract_chunks(str(txt_file))
    assert chunks[0]["metadata"]["grade"] == "316L"


def test_extract_chunks_infers_doc_type_spec(tmp_path):
    txt_file = tmp_path / "Grade_304_Specification.txt"
    txt_file.write_text("Tensile strength 515 MPa")
    chunks = extract_chunks(str(txt_file))
    assert chunks[0]["metadata"]["doc_type"] == "spec"


def test_extract_chunks_infers_doc_type_sop(tmp_path):
    txt_file = tmp_path / "SOP_Pickling_304.txt"
    txt_file.write_text("Step 1: rinse with water")
    chunks = extract_chunks(str(txt_file))
    assert chunks[0]["metadata"]["doc_type"] == "sop"


def test_upsert_to_qdrant_calls_client_upsert():
    mock_client = MagicMock()
    mock_client.collection_exists.return_value = True

    chunks = [
        {"id": "c1", "text": "some text", "embedding": [0.1] * 1024,
         "metadata": {"doc_name": "test.pdf", "doc_type": "spec", "grade": "304",
                      "section": "1. Scope", "page": 1}},
    ]
    upsert_to_qdrant(mock_client, "jsl_docs", chunks)
    mock_client.upsert.assert_called_once()


def test_upsert_creates_collection_if_missing():
    mock_client = MagicMock()
    mock_client.collection_exists.return_value = False

    chunks = [
        {"id": "c1", "text": "text", "embedding": [0.1] * 1024,
         "metadata": {"doc_name": "f.pdf", "doc_type": "spec", "grade": "304",
                      "section": "s", "page": 1}},
    ]
    upsert_to_qdrant(mock_client, "jsl_docs", chunks)
    mock_client.create_collection.assert_called_once()
    mock_client.upsert.assert_called_once()


@patch("ingestion.embedding_pipeline.httpx.post")
def test_pipeline_process_calls_embed_and_upsert(mock_post, tmp_path):
    mock_response = MagicMock()
    mock_response.json.return_value = {
        "data": [{"embedding": [0.1] * 1024}]
    }
    mock_response.raise_for_status = MagicMock()
    mock_post.return_value = mock_response

    mock_qdrant = MagicMock()
    mock_qdrant.collection_exists.return_value = True
    mock_bm25 = MagicMock()

    txt_file = tmp_path / "Grade_304_Specification.txt"
    txt_file.write_text("Carbon max 0.08%\nTensile strength 515 MPa")

    pipeline = EmbeddingPipeline(
        qdrant_client=mock_qdrant,
        bm25_store=mock_bm25,
        litellm_base_url="http://fake-litellm:4000",
        litellm_api_key="fake-key",
        embed_model="jsl-embed",
        collection="jsl_docs",
    )
    result = pipeline.process(str(txt_file))

    assert result["status"] == "indexed"
    assert result["chunks"] > 0
    mock_qdrant.upsert.assert_called()
    mock_bm25.add_chunks.assert_called()
    mock_bm25.save.assert_called()
