"""
conftest.py — resets the app module's lazy-initialised singletons between
tests so each test's patch context gets fresh instances.
"""
import sys
import pytest


@pytest.fixture(autouse=True)
def reset_app_singletons():
    """Clear cached singletons in app module before each test so the lazy
    initialisers run inside the active patch context."""
    # Drop the cached module so patch() re-imports it fresh the first time
    # it resolves 'app.QdrantClient' etc.  Without this, the second and
    # subsequent test runs would reuse the previously-imported module and its
    # already-created (un-mocked) singletons.
    sys.modules.pop("app", None)
    yield
    # Clean up after the test as well.
    app_mod = sys.modules.get("app")
    if app_mod is not None:
        app_mod._qdrant_client = None
        app_mod._bm25_store = None
        app_mod._pipeline = None
        app_mod._retriever = None
    sys.modules.pop("app", None)
