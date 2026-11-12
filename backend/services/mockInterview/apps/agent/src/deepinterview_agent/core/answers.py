"""Complete answer text shared by scoring and coaching readers."""

from collections.abc import Sequence

from ..shared_models import AnswerRecord


def answers_by_question(
    answers: Sequence[AnswerRecord],
    transcript: Sequence[dict] = (),
) -> dict[str, AnswerRecord]:
    """Join saved answers in order, preferring committed speech when available.

    Exact duplicate saves are ignored. The original records remain intact so
    retries and report readers retain their full history.
    """
    records: dict[str, AnswerRecord] = {}
    parts: dict[str, list[str]] = {}
    for answer in answers:
        text = (answer.transcript or "").strip()
        if not text:
            continue
        records.setdefault(answer.question_id, answer)
        fragments = parts.setdefault(answer.question_id, [])
        if text not in fragments:
            fragments.append(text)

    spoken: dict[str, list[str]] = {}
    for turn in transcript:
        qid = turn.get("question_id") or ""
        text = (turn.get("text") or "").strip()
        if turn.get("role") == "user" and qid in records and text:
            spoken.setdefault(qid, []).append(text)

    return {
        qid: record.model_copy(update={"transcript": "\n\n".join(spoken.get(qid, parts[qid]))})
        for qid, record in records.items()
    }
