"""Trace viewer routes: easy tracking of agent work over HTTP.

``GET /api/traces`` lists recent traces (newest first, optional
``?session_id=`` + ``?limit=``); ``GET /api/traces/{trace_id}`` returns the
full nested detail for one trace. Both read the local JSONL store written by
:mod:`core.tracing` — no keys, no extra deps. Read-only and unguarded (same
posture as the session GET); trace events hold timings/metadata and prompt
text only when ``TRACE_INCLUDE_PROMPTS=1``.
"""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field

from ..core.config import get_settings
from ..core.tracing import list_traces, read_trace

router = APIRouter()


class TraceListResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    traces: list[dict] = Field(default_factory=list)


@router.get("/api/traces", response_model=TraceListResponse)
async def get_traces(
    session_id: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
) -> TraceListResponse:
    directory = Path(get_settings().trace_dir)
    return TraceListResponse(
        traces=list_traces(directory=directory, session_id=session_id, limit=limit)
    )


@router.get("/api/traces/{trace_id}")
async def get_trace(trace_id: str) -> dict:
    detail = read_trace(trace_id, directory=Path(get_settings().trace_dir))
    if detail is None:
        raise HTTPException(status_code=404, detail="Unknown trace_id")
    return detail
