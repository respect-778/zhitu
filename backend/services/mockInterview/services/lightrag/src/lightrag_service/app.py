"""FastAPI app for the DeepInterview knowledge sidecar (:9621).

Endpoints:
* ``GET  /health``     — liveness probe.
* ``POST /kb/ingest``  — fetch each file URL (raw-text fallback offline) and ingest.
* ``POST /kb/query``   — retrieve a grounded answer + citations for a user.

The ingest handler fetches file URLs with httpx **only if it is installed**; when
httpx is absent or a fetch fails it treats the ``files[]`` entry as raw text (same
spirit as the prep CV fallback), so the service stays runnable fully offline with
just fastapi/uvicorn/pydantic.
"""

from __future__ import annotations

import hmac
import ipaddress
import os
from typing import TYPE_CHECKING
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Header, HTTPException

from .backend import get_backend
from .models import (
    KbIngestRequest,
    KbIngestResponse,
    KbQueryRequest,
    KbQueryResponse,
)

if TYPE_CHECKING:
    from .backend import RagBackend

# How long to wait when fetching a file URL (seconds).
_FETCH_TIMEOUT = 15.0


def _is_public_http_url(url: str) -> bool:
    """SSRF guard: only http(s), never loopback/private/link-local/reserved hosts.

    The ingest fetch runs server-side, so a caller-supplied URL could otherwise
    make the sidecar probe the internal network (cloud metadata, other services)
    and reflect the body back via /kb/query. Hostname-literal checks only (no DNS
    resolution) — pair with network egress policy for defence in depth.
    """
    try:
        parts = urlsplit(url)
    except ValueError:
        return False
    if parts.scheme not in ("http", "https"):
        return False
    host = (parts.hostname or "").strip("[]").lower()
    if not host or host == "localhost" or host.endswith((".localhost", ".internal")):
        return False
    try:
        addr = ipaddress.ip_address(host)
    except ValueError:
        return True  # non-IP hostname: allowed (see docstring caveat)
    return not (
        addr.is_private
        or addr.is_loopback
        or addr.is_link_local
        or addr.is_reserved
        or addr.is_multicast
        or addr.is_unspecified
    )


async def require_secret(
    x_internal_secret: str | None = Header(default=None),
) -> None:
    """Enforce ``LIGHTRAG_API_SECRET`` when configured; no-op otherwise (offline)."""
    expected = os.environ.get("LIGHTRAG_API_SECRET")
    if not expected:
        return
    if not x_internal_secret or not hmac.compare_digest(x_internal_secret, expected):
        raise HTTPException(status_code=401, detail="Invalid or missing internal secret")


async def _resolve_file(ref: str) -> tuple[str, str]:
    """Resolve one ``files[]`` entry to ``(source_id, text)``.

    If ``ref`` is a PUBLIC http(s) URL and httpx is installed, fetch it; on any
    failure (no httpx, network error, non-http ref, or a refused non-public URL)
    fall back to treating ``ref`` itself as raw text. ``source_id`` is the URL
    when fetched, else a short label.
    """
    is_url = ref.startswith("http://") or ref.startswith("https://")
    if is_url:
        if not _is_public_http_url(ref):
            # Refuse SSRF targets: keep the URL as the source id but ingest no body.
            return (ref, "")
        try:
            import httpx  # noqa: PLC0415

            # Follow no redirects: an allowed public URL could otherwise 302 to an
            # internal target, bypassing the guard above.
            async with httpx.AsyncClient(timeout=_FETCH_TIMEOUT) as client:
                resp = await client.get(ref, follow_redirects=False)
                resp.raise_for_status()
                return (ref, resp.text)
        except Exception:  # noqa: BLE001 - any fetch failure -> raw-text fallback
            # Couldn't fetch (offline / no httpx / bad status): keep the URL as the
            # source id but we have no body, so skip ingesting empty content.
            return (ref, "")
    # Not a URL: treat the entry itself as raw text. Use a stable short label.
    label = ref.strip().split("\n", 1)[0][:60] or "text"
    return (label, ref)


def create_app(backend: RagBackend | None = None) -> FastAPI:
    """Build the FastAPI app. A ``backend`` may be injected (tests); else selected."""
    backend = backend or get_backend()
    app = FastAPI(title="DeepInterview Knowledge Sidecar", version="0.0.0")

    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok", "backend": os.environ.get("RAG_BACKEND", "naive")}

    @app.post(
        "/kb/ingest",
        response_model=KbIngestResponse,
        dependencies=[Depends(require_secret)],
    )
    async def kb_ingest(req: KbIngestRequest) -> KbIngestResponse:
        docs: list[tuple[str, str]] = []
        for ref in req.files:
            source_id, text = await _resolve_file(ref)
            if text:
                docs.append((source_id, text))
        track_id = await backend.ingest(req.user_id, docs)
        return KbIngestResponse(track_id=track_id)

    @app.post(
        "/kb/query",
        response_model=KbQueryResponse,
        dependencies=[Depends(require_secret)],
    )
    async def kb_query(req: KbQueryRequest) -> KbQueryResponse:
        answer, citations = await backend.query(req.user_id, req.query, req.lang)
        return KbQueryResponse(answer=answer, citations=citations)

    return app


app = create_app()


def main() -> None:
    """Run the service with uvicorn on ``$LIGHTRAG_PORT`` (default 9621)."""
    import uvicorn  # noqa: PLC0415

    port = int(os.environ.get("LIGHTRAG_PORT", "9621"))
    uvicorn.run(
        "lightrag_service.app:app",
        host="0.0.0.0",  # noqa: S104 - container service binds all interfaces
        port=port,
    )


if __name__ == "__main__":
    main()
