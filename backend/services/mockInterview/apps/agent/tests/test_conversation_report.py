"""Regression coverage for real dialogue and repeated answers to one question."""

import asyncio

from fastapi.testclient import TestClient

from deepinterview_agent.app import create_app
from deepinterview_agent.core.adapters.mock import build_mock
from deepinterview_agent.core.deps import build_deps
from deepinterview_agent.shared_models import (
    AnswerRecord,
    InterviewContext,
    LanguageMode,
    PrepRequest,
)


def test_live_dialogue_is_readable_and_all_spoken_answers_reach_scoring(monkeypatch):
    deps = build_deps()
    sid = asyncio.run(
        deps.repo.create_session(
            PrepRequest(
                cv_url="Synthetic resume",
                jd_text="Synthetic engineering role",
                company="Example",
                language_mode=LanguageMode(primary="en", mixed=False),
            )
        )
    )
    ctx = build_mock(InterviewContext)
    ctx.session_id = sid
    qid = ctx.plan.questions[0].id
    ctx.answers = [
        AnswerRecord(question_id=qid, transcript="First saved summary", started_at="", ended_at=""),
        AnswerRecord(question_id=qid, transcript="Last saved summary", started_at="", ended_at=""),
    ]
    asyncio.run(deps.repo.save_context(sid, ctx))
    dialogue = [
        {"role": "assistant", "text": "Tell me about your project.", "question_id": qid},
        {
            "role": "user",
            "text": "I built the retry queue and reduced duplicate charges.",
            "question_id": qid,
        },
        {"role": "assistant", "text": "How did you verify the results?", "question_id": qid},
        {
            "role": "user",
            "text": "I compared production metrics before and after the rollout.",
            "question_id": qid,
        },
        {"role": "assistant", "text": "Thank you for your time.", "question_id": ""},
    ]
    prompts = []
    original = deps.llm

    class RecordingLLM:
        async def complete_json(self, **kwargs):
            prompts.append(kwargs)
            return await original.complete_json(**kwargs)

        async def complete_text(self, **kwargs):
            prompts.append(kwargs)
            return await original.complete_text(**kwargs)

    monkeypatch.setattr(deps, "llm", RecordingLLM())
    with TestClient(create_app()) as client:
        response = client.post(
            f"/api/session/{sid}/live-result",
            json={
                "context": ctx.model_dump(),
                "transcript": dialogue,
            },
        )
        assert response.status_code == 200
        view = client.get(f"/api/session/{sid}").json()
        assert view["transcript"] == dialogue
        assert client.post("/api/score", json={"session_id": sid}).status_code == 200

    evaluation = next(p for p in prompts if p.get("schema").__name__ == "CompetencyScore")
    assert dialogue[1]["text"] in evaluation["user"]
    assert dialogue[3]["text"] in evaluation["user"]
    assert "Last saved summary" not in evaluation["user"]
    reference = next(p for p in prompts if "schema" not in p)
    assert dialogue[1]["text"] in reference["user"]
    assert dialogue[3]["text"] in reference["user"]


def test_legacy_duplicate_answers_are_combined_without_mutating_source():
    from deepinterview_agent.core.answers import answers_by_question

    records = [
        AnswerRecord(question_id="q1", transcript="First answer", started_at="", ended_at=""),
        AnswerRecord(question_id="q1", transcript="Follow-up answer", started_at="", ended_at=""),
        AnswerRecord(question_id="q1", transcript="", started_at="", ended_at=""),
        AnswerRecord(question_id="q1", transcript="Follow-up answer", started_at="", ended_at=""),
    ]
    combined = answers_by_question(records)
    assert combined["q1"].transcript == "First answer\n\nFollow-up answer"
    assert records[0].transcript == "First answer"
