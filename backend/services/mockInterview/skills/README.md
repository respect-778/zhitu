# skills/ — Company playbooks + rubrics

Versioned, git-tracked **company interview playbooks** and **scoring rubrics**, stored as
**Markdown + YAML frontmatter**. This is the data moat: de-identified, generalized playbooks
promoted from real interview runs (`{company} × {role} × {level}`).

- Each file = one skill. Frontmatter schema: see [`SCHEMA.md`](./SCHEMA.md).
- A **distill → review → promote** pipeline (WP-10) proposes deltas to a review queue;
  nothing auto-merges. Promotion bumps `version`, dedupes, and **scrubs PII**.
- Always attach provenance ("based on N reports, last verified Z"); company facts pass a
  human/LLM review gate to avoid compounding hallucinated claims.

## Pack index

<!-- PACK-INDEX:START — generated, do not edit by hand -->
| Pack | Company | Role | Level | Status | Confidence | Questions | Verified |
|---|---|---|---|---|---|---|---|
| [generic-ai-engineer-senior](./generic-ai-engineer-senior.md) | generic | ai-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-android-engineer-mid](./generic-android-engineer-mid.md) | generic | android-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-backend-engineer-junior](./generic-backend-engineer-junior.md) | generic | backend-engineer | junior | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-backend-engineer-mid](./generic-backend-engineer-mid.md) | generic | backend-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-backend-engineer-senior](./generic-backend-engineer-senior.md) | generic | backend-engineer | senior | promoted | 0.50 | 7 | 2026-07-25 |
| [generic-backend-engineer-staff](./generic-backend-engineer-staff.md) | generic | backend-engineer | staff | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-data-engineer-mid](./generic-data-engineer-mid.md) | generic | data-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-data-engineer-senior](./generic-data-engineer-senior.md) | generic | data-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-data-scientist-mid](./generic-data-scientist-mid.md) | generic | data-scientist | mid | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-devops-engineer-mid](./generic-devops-engineer-mid.md) | generic | devops-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-engineering-manager-senior](./generic-engineering-manager-senior.md) | generic | engineering-manager | senior | promoted | 0.50 | 9 | 2026-08-26 |
| [generic-frontend-engineer-junior](./generic-frontend-engineer-junior.md) | generic | frontend-engineer | junior | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-frontend-engineer-mid](./generic-frontend-engineer-mid.md) | generic | frontend-engineer | mid | promoted | 0.50 | 7 | 2026-07-25 |
| [generic-frontend-engineer-senior](./generic-frontend-engineer-senior.md) | generic | frontend-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-full-stack-engineer-mid](./generic-full-stack-engineer-mid.md) | generic | full-stack-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-full-stack-engineer-senior](./generic-full-stack-engineer-senior.md) | generic | full-stack-engineer | senior | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-ios-engineer-senior](./generic-ios-engineer-senior.md) | generic | ios-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-machine-learning-engineer-mid](./generic-machine-learning-engineer-mid.md) | generic | machine-learning-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-machine-learning-engineer-senior](./generic-machine-learning-engineer-senior.md) | generic | machine-learning-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-mobile-engineer-mid](./generic-mobile-engineer-mid.md) | generic | mobile-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-platform-engineer-senior](./generic-platform-engineer-senior.md) | generic | platform-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-product-manager-mid](./generic-product-manager-mid.md) | generic | product-manager | mid | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-qa-engineer-mid](./generic-qa-engineer-mid.md) | generic | qa-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-security-engineer-senior](./generic-security-engineer-senior.md) | generic | security-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-site-reliability-engineer-senior](./generic-site-reliability-engineer-senior.md) | generic | site-reliability-engineer | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [generic-software-engineer-intern](./generic-software-engineer-intern.md) | generic | software-engineer | intern | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-software-engineer-junior](./generic-software-engineer-junior.md) | generic | software-engineer | junior | promoted | 0.50 | 7 | 2026-07-25 |
| [generic-software-engineer-mid](./generic-software-engineer-mid.md) | generic | software-engineer | mid | promoted | 0.50 | 7 | 2026-08-26 |
| [generic-technical-program-manager-senior](./generic-technical-program-manager-senior.md) | generic | technical-program-manager | senior | promoted | 0.50 | 8 | 2026-08-26 |
| [examplecorp-backend-senior](./example-corp-backend-senior.md) | ExampleCorp | backend-engineer | senior | draft | 0.30 | 2 | 2026-06-08 |
<!-- PACK-INDEX:END -->

Regenerate after adding or editing packs:

```bash
uv --directory apps/agent run python -m deepinterview_agent.skilllib.gen_index
```

`example-corp-backend-senior.md` is a **fictional** sample showing the format.

The `generic-*.md` packs are hand-curated, company-agnostic fallbacks (matched
for any company when no company-specific pack exists) — use them as the model
for contributing new question banks (see issue #38). Set `company: generic`, a
kebab-case `role` slug, and `status: draft` on contributions; maintainers flip
status on review. See SCHEMA.md for how retrieval matches and ranks packs.

Before opening a PR, validate your pack and read the content policy
(recollection-based, generalized, de-identified — hard requirement):

```bash
pnpm deepinterview skills lint   # after `pnpm build`; see CONTRIBUTING.md §6
```
