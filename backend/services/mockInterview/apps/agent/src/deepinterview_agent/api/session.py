"""Session routes: the session view + the worker's live-result write-back.

``GET /api/session/{id}`` returns a :class:`SessionView` (status, completed prep
steps, input-quality warnings, and the :class:`InterviewContext` once ready).
Unknown ids → 404.

``POST /api/session/{id}/live-result`` is the INTERNAL write path the voice
worker uses at shutdown. The worker runs in a separate process, so with no
Supabase configured its own in-memory repo is invisible to the API — answers
would be lost and never scored. Writing through this endpoint lands the result
in the store the API actually reads. (Like every route, it is session-id
capability-guarded: ids are unguessable uuid4.)
"""

from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from ..core.config import get_settings
from ..core.deps import build_deps
from ..shared_models import InterviewContext
from .auth import require_internal_secret
from .views import SessionHistory, SessionView

router = APIRouter()


class LiveResultRequest(BaseModel):
    """Worker→API write-back: the post-interview context + verbatim transcript.

    API-internal (both ends are Python), so it lives here — NOT in
    ``shared_models`` — keeping the TS↔Pydantic parity registry untouched.
    """

    model_config = ConfigDict(extra="forbid")
    context: InterviewContext
    transcript: list[dict] = Field(default_factory=list)
    # Optional terminal hint ("no_answers" when the interview captured nothing).
    status: str | None = None


_ALLOWED_LIVE_STATUSES = {"no_answers", "error"}

# Once a session reaches one of these it is done; a late/replayed live-result
# write must not be able to overwrite a scored interview's history.
_TERMINAL_STATUSES = {"complete", "no_answers", "error", "rejected"}


@router.get("/api/sessions", response_model=SessionHistory)
async def list_sessions(
    user_id: str | None = None,
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    x_history_secret: str | None = Header(default=None),
) -> SessionHistory:
    # Unlike a single unguessable session URL, a directory needs a service
    # credential even on zero-auth installations. The web BFF selects the owner.
    expected = get_settings().interview_history_secret
    if not expected or not x_history_secret or not hmac.compare_digest(expected, x_history_secret):
        raise HTTPException(status_code=401, detail="History access denied")
    items = await build_deps().repo.list_sessions(user_id, limit + 1, offset)
    return SessionHistory(items=items[:limit], has_more=len(items) > limit)


@router.get("/api/session/{session_id}", response_model=SessionView)
async def get_session(session_id: str) -> SessionView:
    view = await build_deps().repo.get_session_view(session_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    return view


@router.post(
    "/api/session/{session_id}/live-result",
    dependencies=[Depends(require_internal_secret)],
)
async def post_live_result(session_id: str, req: LiveResultRequest) -> dict:
    deps = build_deps()
    view = await deps.repo.get_session_view(session_id)
    if view is None:
        raise HTTPException(status_code=404, detail="Unknown session_id")
    # Refuse to rewrite a session that has already reached a terminal state:
    # the transcript/answers are final once scored, and a replayed or forged
    # write must not be able to mutate them.
    if view.status in _TERMINAL_STATUSES:
        raise HTTPException(
            status_code=409, detail=f"Session already {view.status}"
        )
    if req.transcript:
        await deps.repo.save_transcript(session_id, req.transcript)
    await deps.repo.save_context(session_id, req.context)
    if req.status in _ALLOWED_LIVE_STATUSES:
        await deps.repo.update_status(session_id, req.status)
    return {"ok": True}
