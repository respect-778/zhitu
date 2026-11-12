"""Offline tests for the WP-10 skill library + distiller (MockLLM, no network).

Covers the store round-trip and targeted retrieval, the PII scrubber, the
distiller's PROPOSE-only contract (drafts land in ``skills/_review/`` and never
the live root, candidate PII is scrubbed), and promotion (create + merge with
version bump, status flip, and a PII safety-net pass). All writes that mutate a
library happen under ``tmp_path`` so the committed ``skills/`` library is never
polluted with candidate data.
"""

from __future__ import annotations

import asyncio
import datetime as _dt
from pathlib import Path

import pytest

from deepinterview_agent.core.deps import build_deps
from deepinterview_agent.prep import run_prep
from deepinterview_agent.shared_models import AnswerRecord, LanguageMode, PrepRequest
from deepinterview_agent.skilllib import (
    effective_confidence,
    find_relevant,
    load_skill,
    promote,
    propose_skill,
    save_skill,
    scrub_pii,
    slugify,
)
from deepinterview_agent.skilllib.distiller import REVIEW_SUBDIR
from deepinterview_agent.skilllib.models import Skill, SkillFrontmatter
from deepinterview_agent.skilllib.store import DEFAULT_SKILLS_DIR

# --- fixtures ----------------------------------------------------------------

_CANDIDATE_NAME = "Jane Q. Doe"
_CANDIDATE_EMAIL = "jane.doe@personalmail.example"
_CANDIDATE_PHONE = "+1 (415) 555-0199"


def _request() -> PrepRequest:
    return PrepRequest(
        cv_url="https://example.com/cv.pdf",
        jd_text="Senior Backend Engineer building distributed payment systems in Python.",
        company="ExampleCorp",
        language_mode=LanguageMode(primary="en", mixed=False),
    )


def _sample_skill() -> Skill:
    fm = SkillFrontmatter(
        id="examplecorp-backend-engineer-senior",
        company="ExampleCorp",
        role="backend-engineer",
        level="senior",
        competency=["system-design", "communication"],
        version=2,
        source_runs=3,
        confidence=0.55,
        last_verified="2026-06-08",
        status="promoted",
    )
    body = (
        "# ExampleCorp — Senior Backend Engineer\n\n"
        "## Round structure\n1. Intro\n2. System design\n\n"
        "## Question bank\n"
        '- "Design a multi-region rate limiter." (technical, target: system-design)\n\n'
        "## Signals\n- Reasons about trade-offs explicitly.\n\n"
        "## Pitfalls\n- Jumps to code before clarifying requirements.\n"
    )
    return Skill(frontmatter=fm, body_md=body)


# --- store: round-trip + targeted retrieval ----------------------------------


def test_store_round_trips_a_skill(tmp_path: Path) -> None:
    skill = _sample_skill()
    path = tmp_path / "examplecorp-backend-engineer-senior.md"
    save_skill(skill, path)

    loaded = load_skill(path)
    assert loaded.frontmatter == skill.frontmatter
    assert loaded.body_md.strip() == skill.body_md.strip()
    # last_verified stays a string even though YAML would parse it as a date.
    assert loaded.frontmatter.last_verified == "2026-06-08"
    assert isinstance(loaded.frontmatter.last_verified, str)


def test_find_relevant_matches_company_and_role_only(tmp_path: Path) -> None:
    save_skill(_sample_skill(), tmp_path / "examplecorp-backend-engineer-senior.md")
    # A non-matching skill for a different company/role.
    other = _sample_skill().model_copy(deep=True)
    other.frontmatter.id = "othercorp-frontend-junior"
    other.frontmatter.company = "OtherCorp"
    other.frontmatter.role = "frontend-engineer"
    other.frontmatter.level = "junior"
    save_skill(other, tmp_path / "othercorp-frontend-junior.md")

    hits = find_relevant(tmp_path, company="ExampleCorp", role="backend-engineer")
    assert len(hits) == 1
    assert hits[0].frontmatter.company == "ExampleCorp"

    # A skill for a *different* company is never returned.
    assert find_relevant(tmp_path, company="OtherCorp", role="backend-engineer") == []
    # Level is soft: a staff query still gets the senior pack (ranked, not excluded).
    staff_hits = find_relevant(
        tmp_path, company="ExampleCorp", role="backend-engineer", level="staff"
    )
    assert [h.frontmatter.level for h in staff_hits] == ["senior"]


def test_find_relevant_matches_jd_titles_and_generic_fallback(tmp_path: Path) -> None:
    """Pack slugs match live JD titles; `company: generic` serves any company."""
    generic = _sample_skill().model_copy(deep=True)
    generic.frontmatter.id = "generic-backend-engineer-senior"
    generic.frontmatter.company = "generic"
    save_skill(generic, tmp_path / "generic-backend-engineer-senior.md")

    # Live pipeline values: real company name + JD title, not slugs.
    hits = find_relevant(tmp_path, company="Stripe", role="Senior Backend Engineer")
    assert [h.frontmatter.id for h in hits] == ["generic-backend-engineer-senior"]

    # A role the JD title doesn't contain never matches.
    assert find_relevant(tmp_path, company="Stripe", role="Data Scientist") == []

    # An exact-company pack outranks the generic fallback.
    exact = _sample_skill().model_copy(deep=True)
    exact.frontmatter.id = "stripe-backend-engineer-senior"
    exact.frontmatter.company = "Stripe"
    save_skill(exact, tmp_path / "stripe-backend-engineer-senior.md")
    hits = find_relevant(tmp_path, company="Stripe", role="Senior Backend Engineer")
    assert hits[0].frontmatter.id == "stripe-backend-engineer-senior"


def test_find_relevant_matches_alternate_title_spellings(tmp_path: Path) -> None:
    """Real JD titles spell roles differently than pack slugs do.

    Strict token matching missed ordinary titles: "Front End Engineer" against a
    `frontend-engineer` pack (front + end vs frontend), "Backend Developer"
    (developer vs engineer), and "Software Engineering Intern" (engineering vs
    engineer). Each miss is silent — the planner just gets no pack — so these
    are pinned rather than left to be rediscovered.
    """
    frontend = _sample_skill().model_copy(deep=True)
    frontend.frontmatter.id = "generic-frontend-engineer-mid"
    frontend.frontmatter.company = "generic"
    frontend.frontmatter.role = "frontend-engineer"
    frontend.frontmatter.level = "mid"
    save_skill(frontend, tmp_path / "generic-frontend-engineer-mid.md")

    for title in ("Front End Engineer", "Frontend Developer", "Front-End Dev"):
        hits = find_relevant(tmp_path, company="Acme", role=title)
        assert [h.frontmatter.id for h in hits] == ["generic-frontend-engineer-mid"], title

    ml = _sample_skill().model_copy(deep=True)
    ml.frontmatter.id = "generic-machine-learning-engineer-senior"
    ml.frontmatter.company = "generic"
    ml.frontmatter.role = "machine-learning-engineer"
    save_skill(ml, tmp_path / "generic-machine-learning-engineer-senior.md")

    # "ML Engineer" is at least as common a title as the spelled-out form.
    hits = find_relevant(tmp_path, company="Acme", role="Senior ML Engineer")
    assert [h.frontmatter.id for h in hits] == ["generic-machine-learning-engineer-senior"]


def test_role_token_expansion_does_not_match_unrelated_roles(tmp_path: Path) -> None:
    """Expansion must add spellings of the same job, not blur different jobs.

    The risk of loosening a matcher is a backend pack turning up for a designer.
    A pack whose slug tokens are genuinely absent from the title still loses.
    """
    backend = _sample_skill().model_copy(deep=True)
    backend.frontmatter.id = "generic-backend-engineer-senior"
    backend.frontmatter.company = "generic"
    save_skill(backend, tmp_path / "generic-backend-engineer-senior.md")

    for title in ("Product Designer", "Sales Manager", "Data Scientist", "Frontend Engineer"):
        assert find_relevant(tmp_path, company="Acme", role=title) == [], title


def test_role_token_expansion_is_monotone() -> None:
    """Expansion may only ADD matches — never break one that already worked.

    Both the pack slug and the JD title run through the same expansion, so a
    subset relation that held on raw tokens must still hold afterwards. If that
    stops being true, packs silently stop being retrieved.
    """
    from deepinterview_agent.skilllib.store import _role_tokens

    pairs = [
        ("backend-engineer", "Senior Backend Engineer"),
        ("software-engineer", "Software Engineer"),
        ("data-engineer", "Staff Data Engineer"),
        ("engineering-manager", "Engineering Manager, Platform"),
        ("site-reliability-engineer", "Site Reliability Engineer"),
    ]
    for slug, title in pairs:
        assert _role_tokens(slug) <= _role_tokens(title), (slug, title)


def test_find_relevant_ranks_status_then_decayed_confidence(tmp_path: Path) -> None:
    """`promoted` beats `draft` even at lower confidence; staleness decays rank."""
    draft = _sample_skill().model_copy(deep=True)
    draft.frontmatter.id = "generic-a"
    draft.frontmatter.company = "generic"
    draft.frontmatter.status = "draft"
    draft.frontmatter.confidence = 0.9
    save_skill(draft, tmp_path / "a.md")

    promoted = _sample_skill().model_copy(deep=True)
    promoted.frontmatter.id = "generic-b"
    promoted.frontmatter.company = "generic"
    promoted.frontmatter.status = "promoted"
    promoted.frontmatter.confidence = 0.4
    save_skill(promoted, tmp_path / "b.md")

    hits = find_relevant(tmp_path, company="Acme", role="Backend Engineer", limit=2)
    assert [h.frontmatter.id for h in hits] == ["generic-b", "generic-a"]

    # Same status: a freshly verified pack outranks a stale equal-confidence one.
    stale = _sample_skill().model_copy(deep=True)
    stale.frontmatter.id = "generic-stale"
    stale.frontmatter.company = "generic"
    stale.frontmatter.status = "promoted"
    stale.frontmatter.last_verified = "2020-01-01"
    save_skill(stale, tmp_path / "stale.md")
    fresh = _sample_skill().model_copy(deep=True)
    fresh.frontmatter.id = "generic-fresh"
    fresh.frontmatter.company = "generic"
    fresh.frontmatter.status = "promoted"
    fresh.frontmatter.last_verified = _dt.datetime.now(tz=_dt.UTC).date().isoformat()
    save_skill(fresh, tmp_path / "fresh.md")
    hits = find_relevant(tmp_path, company="Acme", role="Backend Engineer", limit=4)
    assert hits.index(next(h for h in hits if h.frontmatter.id == "generic-fresh")) < hits.index(
        next(h for h in hits if h.frontmatter.id == "generic-stale")
    )


def test_effective_confidence_halves_at_half_life() -> None:
    fm = _sample_skill().frontmatter.model_copy(
        update={"confidence": 0.8, "last_verified": "2026-01-01"}
    )
    today = _dt.date(2026, 6, 30)  # 180 days later
    assert effective_confidence(fm, today=today) == pytest.approx(0.4, rel=1e-3)
    # Unparseable date: no decay rather than a crash.
    fm_bad = fm.model_copy(update={"last_verified": "unknown"})
    assert effective_confidence(fm_bad, today=today) == 0.8


def test_skill_hint_injects_question_bank_into_planner_context(tmp_path: Path) -> None:
    """The planner hint carries the pack BODY (question bank), not just metadata."""
    from deepinterview_agent.prep.nodes import _skill_library_hint

    generic = _sample_skill().model_copy(deep=True)
    generic.frontmatter.id = "generic-backend-engineer-senior"
    generic.frontmatter.company = "generic"
    save_skill(generic, tmp_path / "generic.md")

    hint = _skill_library_hint(
        company="Stripe",
        role="Senior Backend Engineer",
        level="senior",
        skills_dir=str(tmp_path),
    )
    assert "Design a multi-region rate limiter." in hint  # question bank line
    assert "Jumps to code before clarifying requirements." in hint  # pitfalls line
    assert len(hint) <= 1600  # bounded

    # Empty library -> empty hint, never an error.
    assert _skill_library_hint(
        company="Stripe", role="X", level="senior", skills_dir=str(tmp_path / "none")
    ) == ""


def test_find_relevant_loads_committed_example() -> None:
    """The committed fictional example is parseable and retrievable by company+role."""
    hits = find_relevant(DEFAULT_SKILLS_DIR, company="ExampleCorp", role="backend-engineer")
    ids = {h.frontmatter.id for h in hits}
    assert "examplecorp-backend-senior" in ids
    # README.md / SCHEMA.md (no frontmatter) are skipped, not raised.
    assert find_relevant(DEFAULT_SKILLS_DIR, company="Nope", role="nobody") == []


# --- scrub -------------------------------------------------------------------


def test_scrub_pii_removes_name_email_and_phone() -> None:
    text = (
        f"{_CANDIDATE_NAME} answered well. Reach at {_CANDIDATE_EMAIL} "
        f"or call {_CANDIDATE_PHONE} anytime."
    )
    scrubbed = scrub_pii(text, names=[_CANDIDATE_NAME])

    assert "Jane" not in scrubbed
    assert _CANDIDATE_EMAIL not in scrubbed
    assert "555-0199" not in scrubbed
    assert "[candidate]" in scrubbed
    assert "[email]" in scrubbed
    assert "[phone]" in scrubbed
    # Idempotent.
    assert scrub_pii(scrubbed, names=[_CANDIDATE_NAME]) == scrubbed


# --- distiller: PROPOSE only --------------------------------------------------


def _prepared_session_with_pii(deps) -> str:
    """run_prep, then seed a distinctive name + a PII-laden answer transcript."""
    session_id = asyncio.run(run_prep(_request(), deps))
    ctx = asyncio.run(deps.repo.load_context(session_id))
    assert ctx is not None
    # Override the mock candidate name with something distinctive to scrub.
    ctx.candidate.name = _CANDIDATE_NAME
    questions = ctx.plan.questions
    assert questions
    ctx.answers.append(
        AnswerRecord(
            question_id=questions[0].id,
            transcript=(
                f"My name is {_CANDIDATE_NAME}, you can reach me at {_CANDIDATE_EMAIL} "
                f"or {_CANDIDATE_PHONE}. I designed a service with idempotent retries."
            ),
            started_at="2026-06-08T09:00:00Z",
            ended_at="2026-06-08T09:02:00Z",
            duration_sec=120.0,
        )
    )
    asyncio.run(deps.repo.save_context(session_id, ctx))
    return session_id


def test_propose_skill_writes_draft_to_review_only_and_scrubs_pii(tmp_path: Path) -> None:
    deps = build_deps()
    session_id = _prepared_session_with_pii(deps)

    draft = asyncio.run(propose_skill(session_id, deps, skills_dir=tmp_path))

    # Draft is a 'draft', sourced from 1 run, with a modest confidence.
    assert draft.frontmatter.status == "draft"
    assert draft.frontmatter.source_runs == 1
    assert 0.0 < draft.frontmatter.confidence <= 0.4
    assert draft.source_session_id == session_id

    # The draft file exists in the review queue and NOT in the live root.
    review_path = tmp_path / REVIEW_SUBDIR / f"{draft.id}.md"
    assert review_path.exists(), "draft must be written to the review queue"
    live_files = list(tmp_path.glob("*.md"))
    assert live_files == [], "propose_skill must NOT write into the live library root"

    # PII from the candidate name is scrubbed from the body the distiller built.
    assert "Jane" not in draft.body_md
    assert "[candidate]" in draft.body_md
    # And the on-disk draft is scrubbed too.
    assert "Jane" not in review_path.read_text(encoding="utf-8")


# --- promote -----------------------------------------------------------------


def test_promote_creates_new_skill_with_promoted_status(tmp_path: Path) -> None:
    deps = build_deps()
    session_id = _prepared_session_with_pii(deps)
    draft = asyncio.run(propose_skill(session_id, deps, skills_dir=tmp_path))
    draft_path = tmp_path / REVIEW_SUBDIR / f"{draft.id}.md"

    out_path = promote(draft_path, skills_dir=tmp_path)

    assert out_path.exists()
    assert out_path.parent == tmp_path  # written into the live root, not _review.
    promoted = load_skill(out_path)
    assert promoted.frontmatter.status == "promoted"
    assert promoted.frontmatter.id == slugify(
        company=draft.frontmatter.company,
        role=draft.frontmatter.role,
        level=draft.frontmatter.level,
    )
    # PII safety-net: still clean after promotion.
    assert "Jane" not in promoted.body_md


def test_promote_merges_and_bumps_version_when_skill_exists(tmp_path: Path) -> None:
    deps = build_deps()
    session_id = _prepared_session_with_pii(deps)
    draft = asyncio.run(propose_skill(session_id, deps, skills_dir=tmp_path))
    draft_path = tmp_path / REVIEW_SUBDIR / f"{draft.id}.md"

    # Seed an existing live skill with the same slug to force a merge.
    slug = slugify(
        company=draft.frontmatter.company,
        role=draft.frontmatter.role,
        level=draft.frontmatter.level,
    )
    existing = Skill(
        frontmatter=SkillFrontmatter(
            id=slug,
            company=draft.frontmatter.company,
            role=draft.frontmatter.role,
            level=draft.frontmatter.level,
            competency=["pre-existing-competency"],
            version=4,
            source_runs=9,
            confidence=0.6,
            last_verified="2026-01-01",
            status="promoted",
        ),
        body_md=(
            "# Existing\n\n## Question bank\n"
            '- "An already-known question." (technical, target: x)\n'
        ),
    )
    save_skill(existing, tmp_path / f"{slug}.md")

    out_path = promote(draft_path, skills_dir=tmp_path)
    merged = load_skill(out_path)

    assert merged.frontmatter.version == 5, "version must bump on merge"
    assert merged.frontmatter.source_runs == 10, "source_runs must increment"
    assert merged.frontmatter.confidence > 0.6, "confidence must rise modestly"
    assert merged.frontmatter.confidence <= 0.95
    assert merged.frontmatter.status == "promoted"
    # The pre-existing question is retained; the bank is merged (deduped).
    assert "An already-known question." in merged.body_md
    assert "Jane" not in merged.body_md


def test_propose_default_dir_writes_to_review_only(
    tmp_path: Path, monkeypatch
) -> None:
    """Guard the no-``skills_dir`` branch without touching the committed library.

    Point the distiller's default at ``tmp_path`` so the default code path is
    exercised but the real ``skills/`` tree is never written to.
    """
    from deepinterview_agent.skilllib import distiller as distiller_mod

    monkeypatch.setattr(distiller_mod, "DEFAULT_SKILLS_DIR", tmp_path)

    deps = build_deps()
    session_id = _prepared_session_with_pii(deps)
    draft = asyncio.run(propose_skill(session_id, deps))

    assert (tmp_path / REVIEW_SUBDIR / f"{draft.id}.md").exists()
    assert list(tmp_path.glob("*.md")) == [], "default branch must not write live skills"


# --- pack index ---------------------------------------------------------------


def test_render_index_lists_packs_and_counts_questions(tmp_path: Path) -> None:
    from deepinterview_agent.skilllib.gen_index import render_index

    save_skill(_sample_skill(), tmp_path / "examplecorp-backend-engineer-senior.md")
    table = render_index(tmp_path)
    assert "[examplecorp-backend-engineer-senior](./examplecorp-backend-engineer-senior.md)" in table
    assert "| 1 |" in table  # one question-bank item in the sample body


def test_update_readme_replaces_only_marker_block(tmp_path: Path) -> None:
    from deepinterview_agent.skilllib.gen_index import (
        END_MARKER,
        START_MARKER,
        update_readme,
    )

    save_skill(_sample_skill(), tmp_path / "examplecorp-backend-engineer-senior.md")
    readme = tmp_path / "README.md"
    readme.write_text(f"intro\n\n{START_MARKER}\nstale\n{END_MARKER}\n\noutro\n", encoding="utf-8")
    update_readme(tmp_path)
    text = readme.read_text(encoding="utf-8")
    assert "stale" not in text
    assert text.startswith("intro") and text.rstrip().endswith("outro")
    assert "| Pack |" in text

    # Missing markers is a hard, explained failure.
    bare = tmp_path / "sub"
    bare.mkdir()
    (bare / "README.md").write_text("no markers", encoding="utf-8")
    with pytest.raises(SystemExit):
        update_readme(bare)
