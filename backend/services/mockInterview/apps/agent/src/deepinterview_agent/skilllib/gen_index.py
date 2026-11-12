"""Regenerate the pack-index table in ``skills/README.md``.

The index makes the library browsable on GitHub without cloning — a hub only
grows if its shelves are visible. Deterministic output (raw ``confidence``,
not the runtime-decayed value) so regenerating without pack changes is a
no-op and the committed file never churns.

Run from the repo root::

    uv --directory apps/agent run python -m deepinterview_agent.skilllib.gen_index
"""

from __future__ import annotations

import re
from pathlib import Path

from .models import Skill
from .store import DEFAULT_SKILLS_DIR, _is_skill_file, load_skill

START_MARKER = "<!-- PACK-INDEX:START — generated, do not edit by hand -->"
END_MARKER = "<!-- PACK-INDEX:END -->"

_LEVEL_ORDER = {"intern": 0, "junior": 1, "mid": 2, "senior": 3, "staff": 4, "principal": 5}
_QUESTION_RE = re.compile(r"^\s*-\s+\S", re.MULTILINE)


def _question_count(body_md: str) -> int:
    """Number of ``- `` items under the ``## Question bank`` section."""
    parts = re.split(r"^##\s+Question bank\s*$", body_md, flags=re.IGNORECASE | re.MULTILINE)
    if len(parts) < 2:
        return 0
    section = re.split(r"^##\s", parts[1], maxsplit=1, flags=re.MULTILINE)[0]
    return len(_QUESTION_RE.findall(section))


def _load_packs(skills_dir: Path) -> list[tuple[str, Skill]]:
    packs: list[tuple[str, Skill]] = []
    for path in sorted(skills_dir.glob("*.md")):
        if not _is_skill_file(path):
            continue
        try:
            packs.append((path.name, load_skill(path)))
        except Exception:  # noqa: BLE001, S112 - unparseable files are the linter's job, not the index's
            continue
    return packs


def render_index(skills_dir: Path | None = None) -> str:
    """Render the Markdown table for every parseable pack in the live library."""
    root = skills_dir or DEFAULT_SKILLS_DIR
    packs = _load_packs(root)
    packs.sort(
        key=lambda item: (
            item[1].frontmatter.company.lower() != "generic",  # generic packs first
            item[1].frontmatter.company.lower(),
            item[1].frontmatter.role,
            _LEVEL_ORDER.get(item[1].frontmatter.level, 99),
        )
    )
    lines = [
        "| Pack | Company | Role | Level | Status | Confidence | Questions | Verified |",
        "|---|---|---|---|---|---|---|---|",
    ]
    for filename, skill in packs:
        fm = skill.frontmatter
        lines.append(
            f"| [{fm.id}](./{filename}) | {fm.company} | {fm.role} | {fm.level} "
            f"| {fm.status} | {fm.confidence:.2f} | {_question_count(skill.body_md)} "
            f"| {fm.last_verified} |"
        )
    return "\n".join(lines)


def update_readme(skills_dir: Path | None = None) -> Path:
    """Replace the block between the index markers in ``skills/README.md``."""
    root = skills_dir or DEFAULT_SKILLS_DIR
    readme = root / "README.md"
    text = readme.read_text(encoding="utf-8")
    if START_MARKER not in text or END_MARKER not in text:
        msg = f"{readme} is missing the pack-index markers; add them once by hand"
        raise SystemExit(msg)
    head, rest = text.split(START_MARKER, 1)
    _, tail = rest.split(END_MARKER, 1)
    new = f"{head}{START_MARKER}\n{render_index(root)}\n{END_MARKER}{tail}"
    readme.write_text(new, encoding="utf-8")
    return readme


if __name__ == "__main__":
    path = update_readme()
    print(f"regenerated pack index in {path}")
