"""Paraformer and CosyVoice adapters using DashScope's WebSocket protocol."""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

from livekit.agents import (
    APIConnectionError,
    APIConnectOptions,
    APITimeoutError,
    stt,
    tts,
)
from livekit.agents.types import DEFAULT_API_CONNECT_OPTIONS, NOT_GIVEN, NotGivenOr
from livekit.agents.utils import AudioBuffer
from websockets.asyncio.client import connect
from websockets.exceptions import WebSocketException


def _command(action: str, task_id: str, payload: dict[str, Any]) -> str:
    return json.dumps(
        {
            "header": {"action": action, "task_id": task_id, "streaming": "duplex"},
            "payload": payload,
        }
    )


def _event(message: str | bytes) -> dict[str, Any]:
    data = json.loads(message)
    if data["header"].get("event") == "task-failed":
        # Provider messages can echo request data. Keep diagnostics to the error code.
        code = data["header"].get("error_code", "unknown")
        raise APIConnectionError(f"DashScope speech task failed ({code})")
    return data


async def _wait_started(socket: Any, timeout: float) -> None:
    async with asyncio.timeout(timeout):
        data = _event(await socket.recv())
        if data["header"].get("event") != "task-started":
            raise APIConnectionError("DashScope did not acknowledge the speech task")


class DashScopeSTT(stt.STT):
    def __init__(self, *, api_key: str, model: str, url: str, language: str) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True, interim_results=True, offline_recognize=False
            )
        )
        self._api_key = api_key
        self._model = model
        self._url = url
        self._language = language

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "dashscope"

    async def _recognize_impl(
        self,
        buffer: AudioBuffer,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions,
    ) -> stt.SpeechEvent:
        raise NotImplementedError("Paraformer uses the streaming recognition interface")

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> stt.SpeechStream:
        selected_language = language if isinstance(language, str) else self._language
        return _RecognitionStream(self, selected_language, conn_options)


class _RecognitionStream(stt.SpeechStream):
    def __init__(
        self, engine: DashScopeSTT, language: str, conn_options: APIConnectOptions
    ) -> None:
        super().__init__(stt=engine, conn_options=conn_options, sample_rate=16000)
        self._engine = engine
        self._language = language

    async def _run(self) -> None:
        task_id = uuid.uuid4().hex
        engine = self._engine
        try:
            async with connect(
                engine._url,
                additional_headers={"Authorization": f"Bearer {engine._api_key}"},
                open_timeout=self._conn_options.timeout,
                close_timeout=3,
            ) as socket:
                await socket.send(
                    _command(
                        "run-task",
                        task_id,
                        {
                            "task_group": "audio",
                            "task": "asr",
                            "function": "recognition",
                            "model": engine.model,
                            "parameters": {
                                "format": "pcm",
                                "sample_rate": 16000,
                                "language_hints": [self._language],
                            },
                            "input": {},
                        },
                    )
                )
                await _wait_started(socket, self._conn_options.timeout)

                async def send_audio() -> None:
                    async for frame in self._input_ch:
                        if isinstance(frame, self._FlushSentinel):
                            continue
                        await socket.send(frame.data.tobytes())
                    await socket.send(_command("finish-task", task_id, {"input": {}}))

                async def receive_text() -> None:
                    speaking = False
                    async for message in socket:
                        data = _event(message)
                        event = data["header"].get("event")
                        if event == "task-finished":
                            return
                        sentence = data.get("payload", {}).get("output", {}).get("sentence", {})
                        text = sentence.get("text", "")
                        if not text:
                            continue
                        if not speaking:
                            self._event_ch.send_nowait(
                                stt.SpeechEvent(type=stt.SpeechEventType.START_OF_SPEECH)
                            )
                            speaking = True
                        final = sentence.get("sentence_end", False)
                        self._event_ch.send_nowait(
                            stt.SpeechEvent(
                                type=(
                                    stt.SpeechEventType.FINAL_TRANSCRIPT
                                    if final
                                    else stt.SpeechEventType.INTERIM_TRANSCRIPT
                                ),
                                request_id=task_id,
                                alternatives=[stt.SpeechData(language=self._language, text=text)],
                            )
                        )
                        if final:
                            self._event_ch.send_nowait(
                                stt.SpeechEvent(type=stt.SpeechEventType.END_OF_SPEECH)
                            )
                            speaking = False
                    raise APIConnectionError("DashScope closed before recognition completed")

                tasks = [asyncio.create_task(send_audio()), asyncio.create_task(receive_text())]
                try:
                    await asyncio.gather(*tasks)
                finally:
                    for task in tasks:
                        task.cancel()
                    await asyncio.gather(*tasks, return_exceptions=True)
        except TimeoutError as exc:
            raise APITimeoutError() from exc
        except (WebSocketException, OSError) as exc:
            raise APIConnectionError() from exc


class DashScopeTTS(tts.TTS):
    def __init__(self, *, api_key: str, model: str, voice: str, url: str) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False), sample_rate=24000, num_channels=1
        )
        self._api_key = api_key
        self._model = model
        self._voice = voice
        self._url = url

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "dashscope"

    def synthesize(
        self,
        text: str,
        *,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> tts.ChunkedStream:
        return _SynthesisStream(self, text, conn_options)


class _SynthesisStream(tts.ChunkedStream):
    def __init__(self, engine: DashScopeTTS, text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=engine, input_text=text, conn_options=conn_options)
        self._engine = engine

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        task_id = uuid.uuid4().hex
        engine = self._engine
        output_emitter.initialize(
            request_id=task_id,
            sample_rate=engine.sample_rate,
            num_channels=1,
            mime_type="audio/pcm",
            frame_size_ms=20,
        )
        try:
            async with (
                asyncio.timeout(30),
                connect(
                    engine._url,
                    additional_headers={"Authorization": f"Bearer {engine._api_key}"},
                    open_timeout=self._conn_options.timeout,
                    close_timeout=3,
                ) as socket,
            ):
                await socket.send(
                    _command(
                        "run-task",
                        task_id,
                        {
                            "task_group": "audio",
                            "task": "tts",
                            "function": "SpeechSynthesizer",
                            "model": engine.model,
                            "parameters": {
                                "text_type": "PlainText",
                                "voice": engine._voice,
                                "format": "pcm",
                                "sample_rate": engine.sample_rate,
                            },
                            "input": {},
                        },
                    )
                )
                await _wait_started(socket, self._conn_options.timeout)
                await socket.send(
                    _command("continue-task", task_id, {"input": {"text": self._input_text}})
                )
                await socket.send(_command("finish-task", task_id, {"input": {}}))
                async for message in socket:
                    if isinstance(message, bytes):
                        output_emitter.push(message)
                    elif _event(message)["header"].get("event") == "task-finished":
                        output_emitter.flush()
                        return
                raise APIConnectionError("DashScope closed before speech synthesis completed")
        except TimeoutError as exc:
            raise APITimeoutError() from exc
        except (WebSocketException, OSError) as exc:
            raise APIConnectionError() from exc
