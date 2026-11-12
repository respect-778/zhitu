"""History, local durability, migration and access-scope regressions."""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from deepinterview_agent.api import session as session_api
from deepinterview_agent.app import app
from deepinterview_agent.core.adapters.mock import build_mock
from deepinterview_agent.core.persistence.repository import MemoryRepository, SupabaseRepository
from deepinterview_agent.core.persistence.sqlite_repository import SQLiteRepository
from deepinterview_agent.shared_models import AnswerRecord, InterviewContext, PrepRequest, ScoreCard


def run(coro):
    return asyncio.run(coro)


def request(user_id=None):
    return PrepRequest(cv_url="https://example.com/cv.pdf", jd_text="Synthetic backend role", company="Test", user_id=user_id, language_mode={"primary": "zh", "mixed": False})


def test_local_round_trip_survives_new_repository_and_preserves_all_fields(tmp_path):
    path = tmp_path / "sessions.sqlite3"
    repo = SQLiteRepository(path)
    sid = run(repo.create_session(request()))
    context = build_mock(InterviewContext).model_copy(update={"session_id": sid})
    run(repo.save_context(sid, context))
    answer = AnswerRecord(question_id="q1", transcript="合成回答", started_at="2026-11-10T00:00:00Z", ended_at="2026-11-10T00:00:10Z")
    run(repo.append_answer(sid, answer))
    scorecard = build_mock(ScoreCard)
    run(repo.save_scorecard(sid, scorecard))
    turns = [{"role": "user", "text": "合成回答", "question_id": "q1"}]
    run(repo.save_transcript(sid, turns))
    run(repo.save_coach_transcript(sid, [{"role": "assistant", "text": "Coach"}]))
    run(repo.mark_progress(sid, "cv_analysis"))
    run(repo.add_warnings(sid, ["synthetic-warning"]))
    run(repo.update_status(sid, "complete"))

    restored = SQLiteRepository(path)
    view = run(restored.get_session_view(sid))
    assert view.status == "complete"
    assert view.context.answers[-1] == answer
    assert view.transcript == turns
    assert view.scorecard == scorecard
    assert view.progress == ["cv_analysis"]
    assert view.prep_warnings == ["synthetic-warning"]
    assert run(restored.load_context("missing")) is None
    assert run(restored.get_session_view("missing")) is None
    summary = run(restored.list_sessions(None, 10, 0))[0]
    assert summary.created_at is not None
    assert summary.overall_score == scorecard.overall_score
    assert "transcript" not in summary.model_dump()
    assert "cv_url" not in summary.model_dump()


@pytest.mark.parametrize("durable", [False, True])
def test_owner_filter_pagination_and_newest_first(tmp_path, durable):
    repo = SQLiteRepository(tmp_path / "sessions.sqlite3") if durable else MemoryRepository()
    oldest = run(repo.create_session(request()))
    owner = run(repo.create_session(request("owner-a")))
    newest = run(repo.create_session(request()))
    assert [row.session_id for row in run(repo.list_sessions(None, 1, 0))] == [newest]
    assert [row.session_id for row in run(repo.list_sessions(None, 1, 1))] == [oldest]
    assert [row.session_id for row in run(repo.list_sessions("owner-a", 10, 0))] == [owner]
    assert run(repo.list_sessions("owner-b", 10, 0)) == []


def test_legacy_import_is_additive_idempotent_and_keeps_unknown_time(tmp_path):
    memory = MemoryRepository()
    sid = run(memory.create_session(request()))
    data = asdict(memory._rows[sid])
    data.pop("created_at")
    repo = SQLiteRepository(tmp_path / "sessions.sqlite3")
    assert repo.import_snapshot({sid: data}) == 1
    run(repo.update_status(sid, "no_answers"))
    assert repo.import_snapshot({sid: data}) == 0
    assert run(repo.get_session_view(sid)).status == "no_answers"
    assert run(repo.list_sessions(None, 10, 0))[0].created_at is None
    with pytest.raises(ValueError):
        repo.import_snapshot({"mismatched-id": data})
    assert len(run(repo.list_sessions(None, 10, 0))) == 1


def test_separate_writers_do_not_lose_updates(tmp_path):
    path = tmp_path / "sessions.sqlite3"
    repo = SQLiteRepository(path)
    sid = run(repo.create_session(request()))

    def write(index):
        independent = SQLiteRepository(path)
        run(independent.add_warnings(sid, [f"warning-{index}"]))

    with ThreadPoolExecutor(max_workers=4) as pool:
        list(pool.map(write, range(12)))
    assert set(run(repo.get_session_view(sid)).prep_warnings) == {f"warning-{i}" for i in range(12)}


def test_history_api_requires_secret_and_filters_owner(monkeypatch, tmp_path):
    repo = SQLiteRepository(tmp_path / "sessions.sqlite3")
    sid = run(repo.create_session(request()))
    run(repo.create_session(request("another-user")))
    monkeypatch.setattr(session_api, "get_settings", lambda: SimpleNamespace(interview_history_secret="test-secret"))
    monkeypatch.setattr(session_api, "build_deps", lambda: SimpleNamespace(repo=repo))
    client = TestClient(app)
    assert client.get("/api/sessions").status_code == 401
    assert client.get("/api/sessions", headers={"x-history-secret": "wrong"}).status_code == 401
    response = client.get("/api/sessions?limit=1", headers={"x-history-secret": "test-secret"})
    assert response.status_code == 200
    assert response.json()["items"][0]["session_id"] == sid
    assert response.json()["has_more"] is False
    assert "context" not in response.json()["items"][0]
    assert client.get("/api/sessions?limit=101", headers={"x-history-secret": "test-secret"}).status_code == 422


def test_supabase_history_queries_only_the_selected_owner():
    calls = []

    class Query:
        def select(self, columns):
            calls.append(("select", columns))
            return self

        def eq(self, column, value):
            calls.append((column, value))
            return self

        def order(self, column, desc):
            return self

        def range(self, start, end):
            calls.append(("range", (start, end)))
            return self

        def execute(self):
            return SimpleNamespace(data=[{"id": "sess_test", "status": "complete", "created_at": "2026-11-10T00:00:00Z", "company": "Test", "job_title": "Backend", "overall_score": "3.5"}])

    repo = SupabaseRepository("https://example.com", "test-key")
    repo._client = SimpleNamespace(table=lambda name: Query())
    assert run(repo.list_sessions(None, 10, 0)) == []
    assert calls == []
    assert run(repo.list_sessions("owner-a", 10, 5))[0].overall_score == 3.5
    assert ("user_id", "owner-a") in calls
    assert ("range", (5, 14)) in calls
    assert "cv_url" not in calls[0][1]
