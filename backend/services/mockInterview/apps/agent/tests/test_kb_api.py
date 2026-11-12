"""Offline API tests for the Phase 2 knowledge endpoints (FastAPI TestClient).

No lightrag_url configured and no network: ``/api/kb/ingest`` returns a
deterministic stub track_id; ``/api/kb/query`` grounds via the default
MockKnowledge client.
"""

import pytest
from fastapi.testclient import TestClient

from deepinterview_agent.app import create_app
from deepinterview_agent.core.config import get_settings


@pytest.fixture(autouse=True)
def _no_local_dotenv(monkeypatch, tmp_path):
    """Keep the suite independent of the developer's local config.

    pydantic-settings reads ``.env`` cwd-relative, so a dev machine with
    LIGHTRAG_URL wired for local runs would silently flip these offline tests
    onto HttpKnowledge. Run from an empty cwd, scrub the process env, and drop
    the ``get_settings`` lru_cache on both sides so neither an earlier test's
    cached Settings leaks in nor ours leaks out.
    """
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("LIGHTRAG_URL", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def _client() -> TestClient:
    return TestClient(create_app())


def test_kb_ingest_returns_track_id_offline() -> None:
    resp = _client().post(
        "/api/kb/ingest",
        json={"store_key": "user_x", "files": ["kb://doc-1", "kb://doc-2"]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["track_id"], str)
    assert body["track_id"]


def test_kb_ingest_is_deterministic_offline() -> None:
    client = _client()
    payload = {"store_key": "user_x", "files": ["kb://doc-1", "kb://doc-2"]}
    first = client.post("/api/kb/ingest", json=payload).json()["track_id"]
    second = client.post("/api/kb/ingest", json=payload).json()["track_id"]
    assert first == second


def test_kb_query_returns_grounded_answer() -> None:
    resp = _client().post(
        "/api/kb/query",
        json={"store_key": "user_x", "query": "How do I structure a STAR answer?", "lang": "en"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body["answer"], str)
    assert body["answer"]
    # MockKnowledge grounds the reply with citations.
    assert len(body["citations"]) >= 1
