"""Offline regression coverage for DashScope speech event and audio handling."""

import asyncio
import json

import pytest

pytest.importorskip("livekit.agents")

from livekit import rtc
from livekit.agents import APIConnectOptions, stt

from deepinterview_agent.core.adapters import dashscope_voice
from deepinterview_agent.core.config import Settings
from deepinterview_agent.worker import (
    _require_live_providers,
    build_llm,
    build_stt,
    build_tts,
    build_turn_handling,
)


class FakeSocket:
    def __init__(self, messages):
        self.messages = iter(messages)
        self.sent = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_):
        pass

    async def send(self, message):
        self.sent.append(message)

    async def recv(self):
        return next(self.messages)

    def __aiter__(self):
        return self

    async def __anext__(self):
        try:
            return next(self.messages)
        except StopIteration:
            raise StopAsyncIteration from None


def _message(event, **payload):
    return json.dumps({"header": {"event": event}, "payload": payload})


def test_streaming_recognition_preserves_transcript_and_finish(monkeypatch):
    socket = FakeSocket(
        [
            _message("task-started"),
            _message(
                "result-generated", output={"sentence": {"text": "测试", "sentence_end": True}}
            ),
            _message("task-finished"),
        ]
    )
    monkeypatch.setattr(dashscope_voice, "connect", lambda *args, **kwargs: socket)

    async def run():
        engine = dashscope_voice.DashScopeSTT(
            api_key="test", model="test-asr", url="wss://example.com", language="zh"
        )
        async with engine.stream(conn_options=APIConnectOptions(max_retry=0)) as stream:
            stream.push_frame(rtc.AudioFrame.create(16000, 1, 1600))
            stream.end_input()
            return [event async for event in stream]

    events = asyncio.run(run())
    assert [event.type for event in events] == [
        stt.SpeechEventType.START_OF_SPEECH,
        stt.SpeechEventType.FINAL_TRANSCRIPT,
        stt.SpeechEventType.END_OF_SPEECH,
    ]
    assert events[1].alternatives[0].text == "测试"
    assert json.loads(socket.sent[-1])["header"]["action"] == "finish-task"
    assert any(isinstance(message, bytes) for message in socket.sent)


def test_synthesis_outputs_pcm_and_uses_consistent_task_id(monkeypatch):
    pcm = b"\x01\x00" * 2400
    socket = FakeSocket([_message("task-started"), pcm, _message("task-finished")])
    monkeypatch.setattr(dashscope_voice, "connect", lambda *args, **kwargs: socket)

    async def run():
        engine = dashscope_voice.DashScopeTTS(
            api_key="test", model="test-tts", voice="test-voice", url="wss://example.com"
        )
        async with engine.synthesize("测试", conn_options=APIConnectOptions(max_retry=0)) as stream:
            return [event async for event in stream]

    audio = asyncio.run(run())
    rendered = b"".join(event.frame.data.tobytes() for event in audio)
    assert rendered[: len(pcm)] == pcm
    # AudioEmitter can append its ten-millisecond final-segment silence marker.
    assert not any(rendered[len(pcm) :])
    commands = [json.loads(message) for message in socket.sent]
    assert [message["header"]["action"] for message in commands] == [
        "run-task",
        "continue-task",
        "finish-task",
    ]
    assert len({message["header"]["task_id"] for message in commands}) == 1


def test_provider_failure_does_not_include_server_message():
    data = {"header": {"event": "task-failed", "error_code": "Denied", "error_message": "private"}}
    with pytest.raises(Exception, match="Denied") as error:
        dashscope_voice._event(json.dumps(data))
    assert "private" not in str(error.value)


def test_worker_selects_all_dashscope_providers():
    async def run():
        settings = Settings(
            _env_file=None,
            llm_provider="dashscope",
            stt_provider="dashscope",
            tts_provider="dashscope",
            dashscope_api_key="test",
        )
        _require_live_providers(settings)
        recognizer = build_stt(settings, "zh")
        synthesizer = build_tts(settings, "zh")
        model = build_llm(settings)
        assert recognizer.model == "paraformer-realtime-v2"
        assert model.model == "qwen3.7-flash"
        assert synthesizer.sample_rate == 24000
        await recognizer.aclose()
        await synthesizer.aclose()
        await model.aclose()

    asyncio.run(run())


def test_worker_requires_dashscope_key():
    settings = Settings(
        _env_file=None,
        llm_provider="dashscope",
        stt_provider="dashscope",
        tts_provider="dashscope",
        dashscope_api_key=None,
    )
    with pytest.raises(RuntimeError, match="DASHSCOPE_API_KEY"):
        _require_live_providers(settings)


def test_endpointing_fallback_explicitly_uses_local_vad():
    assert build_turn_handling("vi")["turn_detection"] == "vad"


def test_worker_registers_plugins_before_starting_job_threads(monkeypatch):
    import importlib

    from deepinterview_agent import worker

    calls = []
    monkeypatch.setattr(importlib, "import_module", lambda name: calls.append(name))
    monkeypatch.setattr(worker, "get_settings", lambda: Settings(_env_file=None))
    monkeypatch.setattr(worker, "init_observability", lambda settings: None)
    monkeypatch.setattr(worker.cli, "run_app", lambda options: calls.append("run_app"))
    worker.main()
    assert calls == ["livekit.plugins.silero", "livekit.plugins.openai", "run_app"]
