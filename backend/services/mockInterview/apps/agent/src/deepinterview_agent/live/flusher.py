"""Periodic transcript checkpoint for the live interview (durability).

All persistence normally happens in the worker's shutdown callback. If the job
process dies hard (OOM / SIGKILL / container eviction) that callback never runs
and the whole interview is lost. :class:`TranscriptFlusher` mitigates this: it
runs OFF the turn-critical path as a detached asyncio task (like
:class:`~deepinterview_agent.live.guard.SessionGuard`) and, every ``interval``
seconds, if the transcript has GROWN since the last checkpoint, calls an injected
async ``flush`` to persist the current context + transcript. A crash then loses
at most one interval of conversation instead of everything.

It is duck-typed for testability: ``flush`` is any ``async (context, transcript)``
callable and ``time_fn`` is injectable, so tests drive it with a fake recorder
and a fake clock — no livekit, no network.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from typing import TYPE_CHECKING

from ..core.logging import get_logger

if TYPE_CHECKING:
    from ..shared_models import InterviewContext
    from .state import InterviewUserdata

log = get_logger(__name__)

FlushFn = Callable[["InterviewContext", list[dict]], Awaitable[None]]


class TranscriptFlusher:
    """Checkpoint the growing transcript at an interval; never blocks a turn."""

    def __init__(
        self,
        userdata: InterviewUserdata,
        flush: FlushFn,
        *,
        interval_sec: float = 20.0,
    ) -> None:
        self._ud = userdata
        self._flush = flush
        self._interval = float(interval_sec)
        self._task: asyncio.Task[None] | None = None
        self._last_len = 0

    def start(self) -> None:
        """Launch the flusher as a detached background task (idempotent).

        A non-positive interval disables it (start() becomes a no-op).
        """
        if self._interval <= 0:
            return
        if self._task is None:
            self._task = asyncio.create_task(self._run())

    async def aclose(self) -> None:
        """Stop the flusher (idempotent)."""
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
            self._task = None

    async def _checkpoint(self) -> None:
        """Persist the current transcript if it grew since the last checkpoint."""
        transcript = list(self._ud.transcript)
        if len(transcript) <= self._last_len:
            return
        with contextlib.suppress(Exception):
            await self._flush(self._ud.ctx, transcript)
            self._last_len = len(transcript)

    async def _run(self) -> None:
        try:
            while True:
                await asyncio.sleep(self._interval)
                await self._checkpoint()
        except asyncio.CancelledError:  # pragma: no cover - cancellation path
            raise
        except Exception:
            log.exception("transcript_flusher: checkpoint loop error (ignored)")
