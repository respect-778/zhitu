"""Durable local sessions, sharing the existing in-memory mutation semantics.

Each operation loads a fresh row inside a SQLite transaction. API and voice
worker processes can update separate fields without overwriting stale snapshots.
"""

from __future__ import annotations

import json
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import asdict
from pathlib import Path
from typing import Any

from ...api.views import SessionSummary, SessionView
from ...shared_models import AnswerRecord, InterviewContext, PrepRequest, ScoreCard
from .repository import MemoryRepository, _SessionRow, summarize_session


class SQLiteRepository:
    def __init__(self, path: str | Path) -> None:
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as db:
            db.execute(
                "CREATE TABLE IF NOT EXISTS sessions ("
                "id TEXT PRIMARY KEY, user_id TEXT, created_at TEXT, payload TEXT NOT NULL)"
            )
            db.execute(
                "CREATE INDEX IF NOT EXISTS sessions_owner_date ON sessions(user_id, created_at DESC)"
            )

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        db = sqlite3.connect(self.path, timeout=15)
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def _save(db: sqlite3.Connection, row: _SessionRow) -> None:
        db.execute(
            "INSERT INTO sessions(id,user_id,created_at,payload) VALUES(?,?,?,?) "
            "ON CONFLICT(id) DO UPDATE SET payload=excluded.payload, "
            "user_id=excluded.user_id, created_at=excluded.created_at",
            (row.id, row.user_id, row.created_at, json.dumps(asdict(row), ensure_ascii=False)),
        )

    async def _operate(self, method: str, session_id: str, *args: Any, write: bool = True) -> Any:
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE" if write else "BEGIN")
            result = db.execute("SELECT payload FROM sessions WHERE id=?", (session_id,)).fetchone()
            memory = MemoryRepository()
            if result:
                memory._rows[session_id] = _SessionRow(**json.loads(result[0]))
            value = await getattr(memory, method)(session_id, *args)
            if write:
                self._save(db, memory._require(session_id))
            return value

    async def create_session(self, req: PrepRequest) -> str:
        memory = MemoryRepository()
        session_id = await memory.create_session(req)
        with self._connect() as db:
            self._save(db, memory._require(session_id))
        return session_id

    async def save_context(self, session_id: str, ctx: InterviewContext) -> None:
        await self._operate("save_context", session_id, ctx)

    async def load_context(self, session_id: str) -> InterviewContext | None:
        return await self._operate("load_context", session_id, write=False)

    async def update_status(self, session_id: str, status: str) -> None:
        await self._operate("update_status", session_id, status)

    async def append_answer(self, session_id: str, answer: AnswerRecord) -> None:
        await self._operate("append_answer", session_id, answer)

    async def save_scorecard(self, session_id: str, scorecard: ScoreCard) -> None:
        await self._operate("save_scorecard", session_id, scorecard)

    async def save_transcript(self, session_id: str, turns: list[dict]) -> None:
        await self._operate("save_transcript", session_id, turns)

    async def save_coach_transcript(self, session_id: str, turns: list[dict]) -> None:
        await self._operate("save_coach_transcript", session_id, turns)

    async def mark_progress(self, session_id: str, step: str) -> None:
        await self._operate("mark_progress", session_id, step)

    async def add_warnings(self, session_id: str, warnings: list[str]) -> None:
        await self._operate("add_warnings", session_id, warnings)

    async def get_session_view(self, session_id: str) -> SessionView | None:
        return await self._operate("get_session_view", session_id, write=False)

    async def list_sessions(self, user_id: str | None, limit: int, offset: int) -> list[SessionSummary]:
        with self._connect() as db:
            rows = db.execute(
                "SELECT payload FROM sessions WHERE user_id IS ? "
                "ORDER BY created_at DESC, rowid DESC LIMIT ? OFFSET ?",
                (user_id, limit, offset),
            ).fetchall()
        return [summarize_session(_SessionRow(**json.loads(row[0]))) for row in rows]

    def import_snapshot(self, rows: dict[str, dict]) -> int:
        """One-time additive migration. Existing durable rows always win."""
        count = 0
        with self._connect() as db:
            db.execute("BEGIN IMMEDIATE")
            for session_id, data in rows.items():
                row = _SessionRow(**data)
                if row.id != session_id:
                    raise ValueError("Snapshot session ID mismatch")
                if db.execute("SELECT 1 FROM sessions WHERE id=?", (session_id,)).fetchone():
                    continue
                self._save(db, row)
                count += 1
        return count
