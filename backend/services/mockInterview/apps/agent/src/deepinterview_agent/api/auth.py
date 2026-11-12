"""Optional internal shared-secret auth for the agent's write endpoints.

The agent API is trust-the-network by design: read paths are capability-guarded
by unguessable session ids. But the *write* endpoints — prep/score/coach/kb
ingest and the worker's live-result write-back — create sessions, spend paid LLM
compute, or overwrite interview history, so a hosted deployment should gate them.

When ``INTERNAL_API_SECRET`` is configured, callers must present it in the
``X-Internal-Secret`` header (constant-time compared); a missing/mismatched
secret is 401. When it is unset (the OSS/offline default), the dependency is a
no-op so zero-config local runs and the test suite are unaffected.
"""

from __future__ import annotations

import hmac

from fastapi import Header, HTTPException

from ..core.config import get_settings

__all__ = ["require_internal_secret"]


async def require_internal_secret(
    x_internal_secret: str | None = Header(default=None),
) -> None:
    """FastAPI dependency: enforce the internal secret when one is configured."""
    expected = get_settings().internal_api_secret
    if not expected:
        return  # auth disabled (OSS default) — endpoints stay open
    if not x_internal_secret or not hmac.compare_digest(
        x_internal_secret, expected
    ):
        raise HTTPException(
            status_code=401, detail="Invalid or missing internal secret"
        )
