# Skill frontmatter schema

Every skill file begins with YAML frontmatter:

| Field | Type | Notes |
|---|---|---|
| `id` | string | Stable slug, e.g. `examplecorp-backend-senior`. |
| `company` | string | Company name, or **`generic`** — a fallback pack matched for *any* company when no company-specific pack exists. |
| `role` | string | **Kebab-case slug**, e.g. `backend-engineer`. Matched by token subset against the live JD title: `backend-engineer` matches "Senior Backend Engineer"; a slug the JD title doesn't contain never matches. |
| `level` | string | One of `intern, junior, mid, senior, staff, principal`. |
| `competency` | string \| string[] | Target competency entities (shared space with scoring + Prep Coach). |
| `version` | integer | Bumped on promotion. |
| `source_runs` | integer | Number of interview runs this was distilled from. |
| `confidence` | number | 0–1; decays over time. |
| `last_verified` | string | ISO-8601 date. |
| `status` | string | `draft \| review \| promoted \| deprecated`. |

Body sections (free-form Markdown): **Round structure**, **Question bank**, **Signals**, **Pitfalls**.

## How the pipeline uses a pack

During prep, the question planner retrieves the top-ranked matching packs and
injects their **Round structure / Question bank / Signals / Pitfalls** sections
(size-capped) into the planning prompt as reference material — so pack content
directly shapes the interview.

Ranking: exact-company packs beat `generic` ones → exact `level` beats other
levels (level never excludes a pack outright) → `promoted` > `review` > `draft`
(`deprecated` is never retrieved) → age-decayed confidence. `confidence` decays
with a **180-day half-life** from `last_verified`, so stale packs lose weight
until re-verified.
