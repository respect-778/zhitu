"""``/api/kb`` — knowledge-base ingest + grounded query (Phase 2 RAG).

``POST /api/kb/ingest`` accepts files for a user's knowledge store. When a
``lightrag_url`` is configured it forwards the ingest to the LightRAG sidecar
(``httpx`` POST ``${lightrag_url}/kb/ingest``); with no URL it returns a
deterministic stub :class:`KbIngestResponse` so the endpoint works fully offline.

``POST /api/kb/query`` answers a grounded question over the user's store via
``deps.knowledge.search(...)`` — the same retrieval path the Study Coach uses —
and returns a :class:`KbQueryResponse`.

Every network/retrieval call is guarded with a timeout + fallback (mirroring
``coach/__init__.py``) so the endpoint always returns a valid response.
"""

from __future__ import annotations

import asyncio

from fastapi import APIRouter, HTTPException

from ..core.deps import build_deps
from ..core.logging import get_logger
from ..shared_models import (
    KbIngestRequest,
    KbIngestResponse,
    KbQueryRequest,
    KbQueryResponse,
)

log = get_logger(__name__)

router = APIRouter()

# Timeout when forwarding an ingest to the knowledge sidecar (seconds). Mirrors
# adapters/knowledge.py's ``_QUERY_TIMEOUT`` — ingest is heavier, so allow longer.
_INGEST_TIMEOUT = 60.0
# Timeout for a grounded query (seconds).
_QUERY_TIMEOUT = 20.0

# Route-level size ceilings (Starlette imposes NO default body limit), mirroring
# api/prep.py. Bound both the number of files and the total payload so a single
# request can't flood memory or the sidecar.
_MAX_INGEST_FILES = 100
_MAX_INGEST_TOTAL_LEN = 5_000_000  # ~5MB of raw text / URLs
_MAX_QUERY_LEN = 10_000


async def _guarded(coro, *, label: str, timeout: float):
    """Await ``coro`` with a timeout; on ANY error return ``None`` (caller falls back)."""
    try:
        return await asyncio.wait_for(coro, timeout=timeout)
    except Exception:
        log.exception("kb: stage %r failed; degrading", label)
        return None


@router.post("/api/kb/ingest", response_model=KbIngestResponse)
async def kb_ingest(req: KbIngestRequest) -> KbIngestResponse:
    # Ingest goes through the SAME knowledge adapter as /api/kb/query, so the
    # store key (user_id) and backend selection stay consistent across both
    # paths. With no LIGHTRAG_URL the adapter is MockKnowledge (deterministic
    # offline stub); when configured it forwards to the sidecar's /kb/ingest and
    # degrades to the stub on any failure rather than 5xx.
    if len(req.files) > _MAX_INGEST_FILES or (
        sum(len(f) for f in req.files) > _MAX_INGEST_TOTAL_LEN
    ):
        raise HTTPException(status_code=413, detail="Ingest payload too large")
    deps = build_deps()
    track_id = await _guarded(
        deps.knowledge.ingest(req.store_key, req.files),
        label="ingest",
        timeout=_INGEST_TIMEOUT,
    )
    if track_id is None:
        track_id = f"trk-{req.store_key}-{len(req.files)}"
    return KbIngestResponse(track_id=track_id)


@router.post("/api/kb/query", response_model=KbQueryResponse)
async def kb_query(req: KbQueryRequest) -> KbQueryResponse:
    if len(req.query) > _MAX_QUERY_LEN:
        raise HTTPException(status_code=413, detail="Query too large")
    deps = build_deps()
    grounded = await _guarded(
        deps.knowledge.search(req.store_key, req.query, req.lang),
        label="knowledge",
        timeout=_QUERY_TIMEOUT,
    )
    if grounded is None:
        return KbQueryResponse(
            answer="I couldn't reach the knowledge base just now — try again in a moment.",
            citations=[],
        )
    answer, citations = grounded
    return KbQueryResponse(answer=answer, citations=list(citations))
