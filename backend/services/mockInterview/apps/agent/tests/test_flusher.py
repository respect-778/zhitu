"""Unit tests for the off-path transcript checkpointer (durability).

The flusher only touches ``userdata.transcript`` / ``userdata.ctx`` and an
injected async ``flush``, so it is driven here with a SimpleNamespace userdata
and a recording flush — no livekit, no network, no real sleep (``_checkpoint``
is exercised directly).
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace

from deepinterview_agent.live.flusher import TranscriptFlusher


def _userdata(transcript: list[dict]) -> SimpleNamespace:
    return SimpleNamespace(transcript=transcript, ctx=SimpleNamespace(name="ctx"))


def test_checkpoint_flushes_only_when_transcript_grows() -> None:
    calls: list[int] = []

    async def flush(ctx, transcript: list[dict]) -> None:
        calls.append(len(transcript))

    transcript: list[dict] = []
    ud = _userdata(transcript)
    flusher = TranscriptFlusher(ud, flush, interval_sec=5.0)

    # Empty transcript -> no flush.
    asyncio.run(flusher._checkpoint())
    assert calls == []

    # Grows -> flush.
    transcript.append({"role": "user", "text": "hi"})
    asyncio.run(flusher._checkpoint())
    assert calls == [1]

    # No growth -> no additional flush.
    asyncio.run(flusher._checkpoint())
    assert calls == [1]

    # Grows again -> flush with the new length.
    transcript.append({"role": "agent", "text": "welcome"})
    asyncio.run(flusher._checkpoint())
    assert calls == [1, 2]


def test_checkpoint_swallows_flush_errors_and_retries_next_tick() -> None:
    attempts: list[int] = []

    async def flaky(ctx, transcript: list[dict]) -> None:
        attempts.append(len(transcript))
        raise RuntimeError("api down")

    transcript = [{"role": "user", "text": "one"}]
    ud = _userdata(transcript)
    flusher = TranscriptFlusher(ud, flaky, interval_sec=5.0)

    # First checkpoint raises inside flush but is swallowed; because the flush
    # failed, _last_len is NOT advanced, so the next tick retries.
    asyncio.run(flusher._checkpoint())
    asyncio.run(flusher._checkpoint())
    assert attempts == [1, 1]


def test_start_is_noop_when_interval_non_positive() -> None:
    async def flush(ctx, transcript: list[dict]) -> None: ...

    flusher = TranscriptFlusher(_userdata([]), flush, interval_sec=0.0)

    async def run() -> None:
        flusher.start()
        assert flusher._task is None  # disabled
        await flusher.aclose()  # idempotent no-op

    asyncio.run(run())


def test_start_then_aclose_cancels_the_task() -> None:
    async def flush(ctx, transcript: list[dict]) -> None: ...

    async def run() -> None:
        flusher = TranscriptFlusher(_userdata([]), flush, interval_sec=30.0)
        flusher.start()
        assert flusher._task is not None
        await flusher.aclose()
        assert flusher._task is None

    asyncio.run(run())
