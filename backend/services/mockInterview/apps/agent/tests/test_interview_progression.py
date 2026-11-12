"""Protect question IDs when the live model requests early round changes."""

import asyncio
from types import SimpleNamespace

import pytest

pytest.importorskip("livekit.agents")

from deepinterview_agent.core.adapters.mock import build_mock
from deepinterview_agent.live.interviewer import Interviewer
from deepinterview_agent.live.state import InterviewUserdata
from deepinterview_agent.shared_models import InterviewContext


def test_round_switch_does_not_assign_coding_answers_to_an_intro_question():
    ctx = build_mock(InterviewContext)
    ud = InterviewUserdata(session_id=ctx.session_id, ctx=ctx)
    agent = Interviewer(ud)
    result = asyncio.run(agent.start_coding_round(SimpleNamespace(userdata=ud)))
    assert isinstance(result, str)
    assert "get_next_question" in result
    assert ud.ctx.cursor == 0


def test_unanswered_questions_cannot_be_skipped_or_ended_by_the_model():
    ctx = build_mock(InterviewContext)
    ctx.answers = []
    ud = InterviewUserdata(session_id=ctx.session_id, ctx=ctx)
    agent = Interviewer(ud)
    context = SimpleNamespace(userdata=ud)
    assert "no answer yet" in asyncio.run(agent.get_next_question(context))
    assert ctx.cursor == 0
    assert "remaining planned questions" in asyncio.run(agent.end_interview(context))


def test_explicit_candidate_stop_closes_the_session():
    ctx = build_mock(InterviewContext)
    ud = InterviewUserdata(session_id=ctx.session_id, ctx=ctx)
    shutdowns = []
    agent = SimpleNamespace(session=SimpleNamespace(shutdown=lambda **kw: shutdowns.append(kw)))
    asyncio.run(Interviewer.end_interview(agent, SimpleNamespace(userdata=ud), True))
    assert shutdowns == [{"drain": True}]


def test_section_tool_advances_once_and_waits_for_the_next_answer():
    ctx = build_mock(InterviewContext)
    template = ctx.plan.questions[0]
    ctx.plan.questions = [
        template.model_copy(update={"id": "q1", "section": "intro"}),
        template.model_copy(update={"id": "q2", "section": "technical"}),
        template.model_copy(update={"id": "q3", "section": "coding"}),
    ]
    ctx.answers = []
    ud = InterviewUserdata(session_id=ctx.session_id, ctx=ctx)
    ud.transcript = [{"role": "user", "text": "My first answer", "question_id": "q1"}]
    agent = Interviewer(ud)
    context = SimpleNamespace(userdata=ud)
    result = asyncio.run(agent.next_section(context))
    assert "technical" in result
    assert ctx.cursor == 1
    assert "no answer yet" in asyncio.run(agent.get_next_question(context))
    assert ctx.cursor == 1
