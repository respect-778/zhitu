# ruff: noqa: BLE001, S110, PYI034, PYI046
# This module is a degradation shim by design: every provider call is wrapped in
# a blind catch-and-continue (tracing must never break a prep run or live turn),
# and the no-op stand-ins deliberately mirror provider types, not PYI idioms.
"""WP-12 — gated, provider-agnostic observability for the agent.

Design (see docs/DEPLOY.md):
  - ZERO config = local JSONL tracing only (``TRACE_DIR``). With no
    ``SENTRY_DSN`` / ``LANGFUSE_*`` set, nothing hosted initializes.
  - ``sentry-sdk`` and ``langfuse`` are the optional ``observability`` extra
    (NOT installed by default). Imports are lazy + wrapped in ``try/except
    ImportError`` so a missing package is a silent no-op.
  - Never raises: tracing must never break a prep run or a live turn.

Wire-up: :func:`init_observability` is called once at process start from
``app.create_app()`` and ``worker.main()``/``entrypoint``. It syncs Settings
into the local tracer (see :mod:`core.tracing`) and initializes Sentry /
Langfuse when configured. ``TRACE_ENABLED=0`` disables even local tracing
(the test suite sets this; see ``tests/conftest.py``).

Per-call tracing lives in :mod:`core.tracing` — :func:`start_trace`,
:func:`start_span`, :func:`add_event`, the :func:`traced` decorator, and the
:class:`TracedLLM` adapter wrapper. This module re-exports the pieces call
sites need so existing imports keep working.
"""

from __future__ import annotations

import os
from typing import Any, Protocol

from .logging import get_logger
from .tracing import init_tracing
from .tracing import start_span as _real_start_span

_log = get_logger("deepinterview.observability")

_initialized = False


class _Settings(Protocol):
    """Structural type — anything exposing these optional attrs works.

    The agent ``Settings`` (core/config.py) declares the tracing fields
    (``trace_enabled``/``trace_dir``/``trace_include_prompts``/``langfuse_*``/
    ``sentry_dsn``); older/stub settings fall back to env via ``getattr``.
    """


def _env(*names: str) -> str | None:
    for name in names:
        val = os.environ.get(name)
        if val:
            return val
    return None


def _sentry_dsn(settings: Any | None) -> str | None:
    return getattr(settings, "sentry_dsn", None) or _env("SENTRY_DSN")


def _langfuse_keys(settings: Any | None) -> tuple[str | None, str | None]:
    public = getattr(settings, "langfuse_public_key", None) or _env("LANGFUSE_PUBLIC_KEY")
    secret = getattr(settings, "langfuse_secret_key", None) or _env("LANGFUSE_SECRET_KEY")
    return public, secret


def init_observability(settings: Any | None = None) -> None:
    """Initialize local tracing + Sentry and/or Langfuse if configured.

    Safe to call multiple times and safe to call with the optional packages not
    installed (logs a debug line and returns). Local JSONL tracing follows
    ``trace_enabled``/``TRACE_ENABLED``; hosted providers need their keys.
    """
    global _initialized
    if _initialized:
        return
    _initialized = True  # mark first so a failure doesn't loop on retry.

    # Local tracing first (no deps): sync Settings (.env + env) into the tracer
    # so file-based tracking works out of the box, including via `docker compose`.
    try:
        init_tracing(
            enabled=getattr(settings, "trace_enabled", None),
            trace_dir=getattr(settings, "trace_dir", None),
            include_prompts=getattr(settings, "trace_include_prompts", None),
            langfuse_public_key=getattr(settings, "langfuse_public_key", None),
            langfuse_secret_key=getattr(settings, "langfuse_secret_key", None),
            langfuse_host=getattr(settings, "langfuse_host", None),
        )
    except Exception as exc:  # pragma: no cover - defensive
        _log.warning("tracing init failed: %s", exc)

    dsn = _sentry_dsn(settings)
    if dsn:
        try:
            import sentry_sdk

            sentry_sdk.init(
                dsn=dsn,
                traces_sample_rate=float(os.environ.get("SENTRY_TRACES_SAMPLE_RATE", "0.1")),
                environment=os.environ.get("NODE_ENV", "production"),
            )
            _log.info("Sentry initialized")
        except ImportError:
            _log.debug("sentry-sdk not installed; skipping Sentry (extra: observability)")
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning("Sentry init failed: %s", exc)

    public, secret = _langfuse_keys(settings)
    if public and secret:
        try:
            import langfuse  # noqa: F401

            _log.info("Langfuse credentials present; hosted tracing enabled")
        except ImportError:
            _log.debug("langfuse not installed; skipping (extra: observability)")
        except Exception as exc:  # pragma: no cover - defensive
            _log.warning("Langfuse init failed: %s", exc)


class _NoOpTracer:
    """Fallback tracer with the minimal surface used by call sites."""

    def start_span(self, _name: str, **_kw: Any) -> _NoOpSpan:
        return _NoOpSpan()


class _NoOpSpan:
    def __enter__(self) -> _NoOpSpan:
        return self

    def __exit__(self, *_exc: object) -> bool:
        return False

    def set_attribute(self, _key: str, _value: Any) -> None:
        return None


def get_tracer() -> Any:
    """Return a tracer with ``start_span(name, **attrs)``.

    Now backed by the real local tracer (:mod:`core.tracing`): with tracing
    enabled it records JSONL spans (+ OTel/Langfuse when configured),
    otherwise it yields disabled span ids — so call sites can
    ``with get_tracer().start_span(...)`` unconditionally.
    """
    from . import tracing as _tracing

    class _Tracer:
        def start_span(self, name: str, **kw: Any) -> Any:
            return _real_start_span(name, **kw)

    # Keep the old no-op importable for tests that patch it, but default to real.
    _ = _tracing
    return _Tracer()


def capture_error(error: BaseException) -> None:
    """Report an error to Sentry if available; else log it. Never raises."""
    dsn = _sentry_dsn(None)
    if dsn:
        try:
            import sentry_sdk

            sentry_sdk.capture_exception(error)
            return
        except ImportError:
            pass
        except Exception:  # pragma: no cover - defensive
            pass
    _log.error("capture_error: %r", error)
