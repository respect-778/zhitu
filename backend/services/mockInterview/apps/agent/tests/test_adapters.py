"""Offline tests for the deterministic mock adapters + local provider selection."""

import asyncio
from types import SimpleNamespace

from deepinterview_agent.core.adapters.llm import OllamaLLM, OpenAILLM, get_llm
from deepinterview_agent.core.adapters.mock import (
    MockEmbeddings,
    MockLLM,
    MockSearch,
    build_mock,
)
from deepinterview_agent.shared_models import (
    InterviewContext,
    QuestionPlan,
    ScoreCard,
)


def _run(coro):
    return asyncio.run(coro)


def test_build_mock_question_plan_is_valid() -> None:
    plan = build_mock(QuestionPlan)
    assert isinstance(plan, QuestionPlan)
    assert len(plan.questions) >= 1
    q = plan.questions[0]
    assert q.text["en"] == "mock"
    assert 1 <= q.difficulty <= 5
    assert len(q.rubric) >= 1
    assert len(q.followups) >= 1


def test_mock_llm_complete_json_schema_valid() -> None:
    plan = _run(MockLLM().complete_json(system="s", user="u", schema=QuestionPlan))
    assert isinstance(plan, QuestionPlan)

    ctx = _run(MockLLM().complete_json(system="s", user="u", schema=InterviewContext))
    assert isinstance(ctx, InterviewContext)
    # Defaulted fields stay at their defaults.
    assert ctx.cursor == 0
    assert ctx.answers == []
    assert ctx.scorecard is None

    sc = _run(MockLLM().complete_json(system="s", user="u", schema=ScoreCard))
    assert isinstance(sc, ScoreCard)
    assert sc.language_report.summary == "mock"


def test_mock_llm_complete_json_deterministic() -> None:
    a = _run(MockLLM().complete_json(system="s", user="u", schema=QuestionPlan))
    b = _run(MockLLM().complete_json(system="s", user="u", schema=QuestionPlan))
    assert a.model_dump() == b.model_dump()


def test_mock_llm_complete_text_is_str() -> None:
    text = _run(MockLLM().complete_text(system="s", user="u"))
    assert isinstance(text, str) and text


def test_mock_search_deterministic() -> None:
    a = _run(MockSearch().search("acme payments"))
    b = _run(MockSearch().search("acme payments"))
    assert [r.model_dump() for r in a] == [r.model_dump() for r in b]
    assert len(a) >= 1


def test_mock_embeddings_deterministic_and_dim() -> None:
    a = _run(MockEmbeddings().embed(["hello", "world"]))
    b = _run(MockEmbeddings().embed(["hello", "world"]))
    assert a == b
    assert len(a) == 2
    assert all(len(v) == MockEmbeddings.DIM for v in a)
    # Different text -> different vector.
    assert a[0] != a[1]


# --- local provider selection (the offline half of the "no cloud keys" path) ---
#
# These pin the FACTORY, not the servers: constructing an adapter performs no
# network I/O, so they stay hermetic and run in plain CI (no extras needed).
# What must not regress is the contract that a misconfigured local provider
# degrades to the mock instead of raising — and, just as importantly, that a
# correctly configured one does NOT silently stay on the mock.


def _settings(**overrides):
    """Real Settings with env ignored, so a developer's .env can't sway a test."""
    base = {
        "llm_provider": "mock",
        "ollama_base_url": "http://localhost:11434/v1",
        "ollama_model": "qwen3:8b",
        "local_api_key": "local",
        "llm_call_timeout_sec": 90.0,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def test_get_llm_ollama_returns_local_adapter() -> None:
    """LLM_PROVIDER=ollama + a base URL selects the local adapter, not the mock.

    The failure this guards against is silent: a local provider that falls
    through to MockLLM still "works", and every generated question comes back
    titled "mock" (see the _loads_json docstring in core/adapters/llm.py).
    """
    llm = get_llm(_settings(llm_provider="ollama"))
    assert isinstance(llm, OllamaLLM)
    assert llm._base_url == "http://localhost:11434/v1"
    assert llm._model == "qwen3:8b"
    # No cloud credential is involved: the key is the non-empty placeholder the
    # openai SDK requires, never a real one.
    assert llm._api_key == "local"


def test_get_llm_ollama_without_base_url_falls_back_to_mock() -> None:
    llm = get_llm(_settings(llm_provider="ollama", ollama_base_url=""))
    assert isinstance(llm, MockLLM)


def test_get_llm_dashscope_uses_configured_endpoint() -> None:
    llm = get_llm(
        _settings(
            llm_provider="dashscope",
            dashscope_api_key="test-key",
            dashscope_base_url="https://example.com/v1",
            dashscope_model="test-model",
        )
    )
    assert isinstance(llm, OpenAILLM)
    assert llm._base_url == "https://example.com/v1"
    assert llm._model == "test-model"
    assert llm._request_kwargs == {"extra_body": {"enable_thinking": False}}


def test_get_llm_dashscope_without_key_preserves_offline_mode() -> None:
    assert isinstance(get_llm(_settings(llm_provider="dashscope", dashscope_api_key=None)), MockLLM)


def test_ollama_llm_retries_once_on_unparseable_json() -> None:
    """A small local model's first reply is often unparseable; one retry saves it.

    Gemini/GPT are single-shot; this retry exists only on the local path, where
    the keystone QuestionPlan call is the one most likely to come back wrapped
    in prose or a <think> block.
    """
    calls: list[str] = []
    llm = OllamaLLM("local", "qwen3:8b", 90.0, base_url="http://x/v1")

    async def _fake(_self, *, system: str, user: str, schema: type):
        calls.append(system)
        if len(calls) == 1:
            raise ValueError("Expecting value: line 1 column 1 (char 0)")
        return build_mock(schema)

    # Patch the inherited OpenAI implementation the subclass delegates to.
    import deepinterview_agent.core.adapters.llm as llm_mod

    original = llm_mod.OpenAILLM.complete_json
    llm_mod.OpenAILLM.complete_json = _fake  # type: ignore[assignment]
    try:
        out = _run(llm.complete_json(system="s", user="u", schema=QuestionPlan))
    finally:
        llm_mod.OpenAILLM.complete_json = original  # type: ignore[assignment]

    assert isinstance(out, QuestionPlan)
    assert len(calls) == 2, "expected exactly one retry"
    assert "could not be parsed as JSON" in calls[1], "retry must add the nudge"
    assert "could not be parsed as JSON" not in calls[0], "first call stays clean"
