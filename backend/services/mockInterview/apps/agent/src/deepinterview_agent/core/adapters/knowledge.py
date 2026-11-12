"""Knowledge adapter: client for the WP-8 LightRAG knowledge sidecar.

``get_knowledge(settings)`` returns :class:`MockKnowledge` (deterministic, offline)
unless a LightRAG URL is configured, in which case it returns :class:`HttpKnowledge`
which POSTs to ``${LIGHTRAG_URL}/kb/query``.

The URL is read from ``settings.lightrag_url`` (``LIGHTRAG_URL`` env). Unset (the
default) keeps everything fully offline. When ``settings.lightrag_api_secret`` is
set it is sent as the ``X-Internal-Secret`` header so a locked-down sidecar
accepts the call.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Protocol, runtime_checkable

from ...shared_models import Citation
from ..logging import get_logger

if TYPE_CHECKING:
    from ..config import Settings

log = get_logger(__name__)

# Request timeout when querying the knowledge sidecar (seconds).
_QUERY_TIMEOUT = 20.0
# Ingest is heavier (parse + embed), so allow longer. Mirrors api/kb.py.
_INGEST_TIMEOUT = 60.0


def _stub_track_id(user_id: str, files: list[str]) -> str:
    """Deterministic offline track id (stable for a given key + file set).

    No ``uuid4``/``hash()`` (non-deterministic across runs) so callers/tests can
    assert on it.
    """
    return f"trk-{user_id}-{len(files)}"


@runtime_checkable
class KnowledgeClient(Protocol):
    """Grounded retrieval over (and ingestion into) a user's knowledge store."""

    async def search(
        self, user_id: str, query: str, lang: str
    ) -> tuple[str, list[Citation]]:
        """Return ``(answer, citations)`` for ``query`` over ``user_id``'s store."""
        ...

    async def ingest(self, user_id: str, files: list[str]) -> str:
        """Ingest ``files`` (raw text or fetchable URLs) into ``user_id``'s store.

        Returns a ``track_id``. The ``user_id`` key MUST match the one later
        passed to :meth:`search`, or the ingested docs are unreachable — in the
        OSS auth-free flow that key is the ``session_id`` (see the prep pipeline
        and the Study Coach, which both key knowledge by session).
        """
        ...


class HttpKnowledge:
    """Calls the knowledge sidecar's ``POST /kb/query`` over HTTP (httpx)."""

    def __init__(self, base_url: str, secret: str | None = None) -> None:
        # Normalise so we can safely join the path.
        self._base_url = base_url.rstrip("/")
        self._secret = secret

    def _headers(self) -> dict[str, str]:
        return {"X-Internal-Secret": self._secret} if self._secret else {}

    async def search(
        self, user_id: str, query: str, lang: str
    ) -> tuple[str, list[Citation]]:
        import httpx

        payload = {"user_id": user_id, "query": query, "lang": lang}
        async with httpx.AsyncClient(timeout=_QUERY_TIMEOUT) as client:
            resp = await client.post(
                f"{self._base_url}/kb/query", json=payload, headers=self._headers()
            )
            resp.raise_for_status()
            data = resp.json()
        answer = data.get("answer", "")
        citations = [Citation(**c) for c in data.get("citations", [])]
        return (answer, citations)

    async def ingest(self, user_id: str, files: list[str]) -> str:
        import httpx

        payload = {"user_id": user_id, "files": files}
        async with httpx.AsyncClient(timeout=_INGEST_TIMEOUT) as client:
            resp = await client.post(
                f"{self._base_url}/kb/ingest", json=payload, headers=self._headers()
            )
            resp.raise_for_status()
            data = resp.json()
        return data.get("track_id", _stub_track_id(user_id, files))


class MockKnowledge:
    """Deterministic, offline knowledge client (the default).

    Returns a canned grounded answer + two citations. No network, no state.
    """

    async def search(
        self, user_id: str, query: str, lang: str
    ) -> tuple[str, list[Citation]]:
        answer = (
            f"Based on your prep materials, here is a grounded note on '{query}'. "
            "Focus your study on the highlighted competency and review the cited sources."
        )
        citations = [
            Citation(
                title="Prep notes",
                url="kb://prep-notes",
                snippet=f"Relevant guidance for '{query}' drawn from your uploaded materials.",
            ),
            Citation(
                title="Study coach summary",
                url="kb://study-coach",
                snippet="Key talking points and a worked example for this topic.",
            ),
        ]
        return (answer, citations)

    async def ingest(self, user_id: str, files: list[str]) -> str:
        """Offline no-op: there is no store, so just return a deterministic id."""
        return _stub_track_id(user_id, files)


def get_knowledge(settings: Settings) -> KnowledgeClient:
    """Choose a knowledge client. ``MockKnowledge`` unless a LightRAG URL is set."""
    url = getattr(settings, "lightrag_url", None) or None
    if url:
        return HttpKnowledge(url, getattr(settings, "lightrag_api_secret", None))
    log.info("No LIGHTRAG_URL configured; using MockKnowledge (offline).")
    return MockKnowledge()
