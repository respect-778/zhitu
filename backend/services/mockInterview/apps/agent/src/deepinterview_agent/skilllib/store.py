"""Read/write skill files (Markdown + YAML frontmatter) and retrieve them.

File format::

    ---
    id: examplecorp-backend-senior
    company: ExampleCorp
    ...
    ---
    # body markdown...

The store is the only place that knows this on-disk shape. ``find_relevant`` is
deliberately *targeted*: it loads only the skill(s) matching ``company × role``
(optionally ``level``) rather than all-loading the library, protecting prep
latency/cost as the library grows.

YAML quirk handled here: an unquoted ``last_verified: 2026-06-08`` parses to a
``datetime.date``, which a ``str``-typed Pydantic field will reject — so frontmatter
date/datetime values are coerced to ISO strings before model construction.
"""

from __future__ import annotations

import datetime as _dt
from pathlib import Path

import yaml

from .models import Skill, SkillFrontmatter

# skilllib/ -> deepinterview_agent/ -> src/ -> agent/ -> apps/ -> <repo root>
_REPO_ROOT = Path(__file__).resolve().parents[5]
DEFAULT_SKILLS_DIR = _REPO_ROOT / "skills"

_FENCE = "---"


def default_skills_dir() -> Path:
    """Return the repo-root ``skills/`` directory (the live library)."""
    return DEFAULT_SKILLS_DIR


def slugify(*, company: str, role: str, level: str) -> str:
    """Canonical ``{company}-{role}-{level}`` slug used for id + filename + merge.

    Lowercased; runs of non-alphanumeric chars collapse to a single hyphen.
    """
    raw = f"{company}-{role}-{level}".lower()
    cleaned: list[str] = []
    prev_dash = False
    for ch in raw:
        if ch.isalnum():
            cleaned.append(ch)
            prev_dash = False
        elif not prev_dash:
            cleaned.append("-")
            prev_dash = True
    return "".join(cleaned).strip("-")


def _coerce_scalars(data: dict) -> dict:
    """Coerce YAML date/datetime values to ISO strings (frontmatter is all str-safe)."""
    out: dict = {}
    for key, value in data.items():
        if isinstance(value, (_dt.date, _dt.datetime)):
            out[key] = value.isoformat()
        else:
            out[key] = value
    return out


def parse_skill(text: str) -> Skill:
    """Parse a ``---\\nfrontmatter\\n---\\nbody`` string into a :class:`Skill`."""
    if not text.lstrip().startswith(_FENCE):
        raise ValueError("skill file must start with a '---' frontmatter fence")
    # Split into ['', frontmatter, body] on the first two fences.
    stripped = text.lstrip("\n")
    parts = stripped.split(_FENCE, 2)
    if len(parts) < 3:
        raise ValueError("skill file is missing the closing '---' frontmatter fence")
    _, raw_front, body = parts
    data = yaml.safe_load(raw_front) or {}
    if not isinstance(data, dict):
        raise ValueError("skill frontmatter must be a YAML mapping")  # noqa: TRY004 - caller catches ValueError for skill-file errors
    frontmatter = SkillFrontmatter.model_validate(_coerce_scalars(data))
    return Skill(frontmatter=frontmatter, body_md=body.lstrip("\n"))


def serialize_skill(skill: Skill) -> str:
    """Serialize a :class:`Skill` back to the ``---\\n...\\n---\\nbody`` format."""
    front = yaml.safe_dump(
        skill.frontmatter.model_dump(),
        sort_keys=False,
        allow_unicode=True,
        default_flow_style=False,
    )
    body = skill.body_md.rstrip("\n")
    return f"{_FENCE}\n{front}{_FENCE}\n\n{body}\n"


def load_skill(path: str | Path) -> Skill:
    """Load and parse a single skill file."""
    return parse_skill(Path(path).read_text(encoding="utf-8"))


def save_skill(skill: Skill, path: str | Path) -> Path:
    """Serialize and write a skill to ``path`` (creating parent dirs)."""
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(serialize_skill(skill), encoding="utf-8")
    return p


def _is_skill_file(path: Path) -> bool:
    """A skill file is a ``*.md`` whose content opens with a frontmatter fence."""
    if path.suffix != ".md":
        return False
    try:
        with path.open("r", encoding="utf-8") as fh:
            head = fh.read(8)
    except OSError:
        return False
    return head.lstrip().startswith(_FENCE)


def list_skills(skills_dir: str | Path | None = None) -> list[Skill]:
    """Load every *live* skill in ``skills_dir`` (top level only).

    Skips ``README.md`` / ``SCHEMA.md`` (no frontmatter) and the ``_review/``
    queue subdirectory. Files that fail to parse are skipped, not raised.
    """
    root = Path(skills_dir) if skills_dir is not None else DEFAULT_SKILLS_DIR
    if not root.exists():
        return []
    skills: list[Skill] = []
    for path in sorted(root.glob("*.md")):
        if not _is_skill_file(path):
            continue
        try:
            skills.append(load_skill(path))
        except (ValueError, yaml.YAMLError):
            continue
    return skills


#: Company value that marks a pack as a fallback for ANY company (issue #38).
GENERIC_COMPANY = "generic"

#: promoted packs outrank in-review ones, which outrank drafts.
_STATUS_RANK = {"promoted": 0, "review": 1, "draft": 2}

#: ``confidence`` halves every N days after ``last_verified`` (SCHEMA.md).
_CONFIDENCE_HALF_LIFE_DAYS = 180.0


# Spellings that mean the same job but tokenize differently. Both sides of the
# match run through ``_role_tokens``, so every entry works in either direction:
# a title written "Front End Engineer" finds a ``frontend-engineer`` pack, and a
# hypothetical ``front-end-engineer`` pack is found by "Frontend Engineer".
#
# Expansion is monotone (if A's tokens were a subset of B's before, they still
# are after), so this can only ADD matches, never remove one that worked.
_COMPOUND_FORMS: dict[str, tuple[str, ...]] = {
    "frontend": ("front", "end"),
    "backend": ("back", "end"),
    "fullstack": ("full", "stack"),
    "devops": ("dev", "ops"),
    "qa": ("quality", "assurance"),
    "ml": ("machine", "learning"),
    "ai": ("artificial", "intelligence"),
    "sre": ("site", "reliability", "engineer"),
    "tpm": ("technical", "program", "manager"),
}

# Interchangeable words for the same role. "Backend Developer" and "Software
# Engineering Intern" are ordinary JD titles that a strict token match misses
# against `backend-engineer` / `software-engineer`.
_SYNONYM_GROUPS: tuple[frozenset[str], ...] = (
    frozenset({"engineer", "engineering", "developer", "dev"}),
)


def _expand_role_tokens(tokens: set[str]) -> set[str]:
    """Add equivalent spellings so title and slug meet in the middle."""
    expanded = set(tokens)
    for joined, parts in _COMPOUND_FORMS.items():
        if joined in tokens:
            expanded.update(parts)
        elif all(part in tokens for part in parts):
            expanded.add(joined)
    for group in _SYNONYM_GROUPS:
        if expanded & group:
            expanded |= group
    return expanded


def _role_tokens(text: str) -> set[str]:
    """Lowercased alphanumeric tokens of a role string or slug, plus variants.

    ``"Senior Backend Engineer"`` and ``"backend-engineer"`` both tokenize into
    comparable sets, so pack slugs can match live JD titles. Real titles also
    spell the same role differently — "Front End", "ML", "Developer" — so the
    raw tokens are expanded with the equivalent forms above before comparison.
    """
    tokens: set[str] = set()
    current: list[str] = []
    for ch in text.lower():
        if ch.isalnum():
            current.append(ch)
        elif current:
            tokens.add("".join(current))
            current = []
    if current:
        tokens.add("".join(current))
    return _expand_role_tokens(tokens)


def effective_confidence(
    fm: SkillFrontmatter, *, today: _dt.date | None = None
) -> float:
    """``confidence`` decayed by the age of ``last_verified``.

    Half-life ``_CONFIDENCE_HALF_LIFE_DAYS``: a pack verified 180 days ago is
    worth half its stated confidence. An unparseable date applies no decay.
    """
    try:
        verified = _dt.date.fromisoformat(fm.last_verified[:10])
    except ValueError:
        return fm.confidence
    now = today or _dt.datetime.now(tz=_dt.UTC).date()
    age_days = max(0, (now - verified).days)
    return fm.confidence * 0.5 ** (age_days / _CONFIDENCE_HALF_LIFE_DAYS)


def find_relevant(
    skills_dir: str | Path | None = None,
    *,
    company: str,
    role: str,
    level: str | None = None,
    limit: int = 2,
) -> list[Skill]:
    """Targeted, ranked retrieval for the prep planner (top ``limit`` packs).

    Matching (all case-insensitive):
      - **role** — the pack's slug tokens must be a subset of the query's
        tokens, so a ``role: backend-engineer`` pack matches the live JD title
        ``"Senior Backend Engineer"``.
      - **company** — packs for the exact company rank above ``generic``
        fallback packs; packs for *other* companies never match.
      - **level** — soft: an exact level match ranks higher, but a senior pack
        still serves a staff query when nothing closer exists.

    Ranking: company tier → level match → status (promoted > review > draft)
    → age-decayed confidence. ``deprecated`` packs are excluded. Retrieval
    stays targeted — only the winning packs are returned, never the library.
    """
    want_company = company.strip().lower()
    want_role = _role_tokens(role)
    want_level = level.strip().lower() if level else None

    scored: list[tuple[int, int, int, float, str, Skill]] = []
    for skill in list_skills(skills_dir):
        fm = skill.frontmatter
        if fm.status == "deprecated":
            continue
        pack_company = fm.company.strip().lower()
        if pack_company == want_company:
            company_tier = 0
        elif pack_company == GENERIC_COMPANY:
            company_tier = 1
        else:
            continue
        pack_role = _role_tokens(fm.role)
        if not pack_role or not pack_role <= want_role:
            continue
        level_tier = 0 if want_level is None or fm.level.strip().lower() == want_level else 1
        status_tier = _STATUS_RANK.get(fm.status, 3)
        scored.append(
            (company_tier, level_tier, status_tier, -effective_confidence(fm), fm.id, skill)
        )
    scored.sort(key=lambda item: item[:5])
    return [item[5] for item in scored[:limit]]
