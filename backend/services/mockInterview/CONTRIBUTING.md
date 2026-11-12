# Contributing to DeepInterview

Thanks for helping build an open, multilingual, voice-first interview coach. This guide gets you from a clean clone to a green test run, explains how the monorepo is organized, and describes the conventions we hold PRs to.

DeepInterview is an **early open build**. The most valuable contributions right now are **language packs**, **provider adapters**, and **accessibility** — see [`docs/GOOD_FIRST_ISSUES.md`](docs/GOOD_FIRST_ISSUES.md).

---

## 1. Dev setup

**Prerequisites**

- **Node 20+** (22 recommended — `.nvmrc` pins it; `nvm use` honors it).
- **pnpm 11** (the repo pins `packageManager: pnpm@11.x` — Corepack will pick it up: `corepack enable`).
- **Python 3.11+** with **[uv](https://docs.astral.sh/uv/)** — only needed to work on the agent (`apps/agent`) or the knowledge service (`services/lightrag`).
- **Docker** — only needed for the full-stack `docker compose` path.

**The 60-second offline setup (no API keys required)**

```bash
git clone https://github.com/ngoanpv/DeepInterview.git
cd deepinterview

pnpm install      # JS/TS workspace (apps/web, packages/shared, cli)
pnpm build        # turbo build — compiles shared contracts first, then cli + web
pnpm test         # TS tests + TS↔Pydantic parity + pipeline tests, all offline
```

For the Python agent:

```bash
uv --directory apps/agent sync          # create the venv + install deps
uv --directory apps/agent run pytest    # agent tests (prep/live/post, mock adapters)
```

Scaffold your env file (copies `.env.example` → `.env`; fill keys in by hand for now):

```bash
pnpm deepinterview init        # requires `pnpm build` first (cli builds to cli/dist/)
```

### Running offline (the mock-first rule)

**You should never need a paid API key to develop or run the test suite.** When a provider key is absent, the agent resolves to **mock adapters** (`apps/agent/src/deepinterview_agent/core/adapters/mock.py`) that return minimal valid, schema-shaped data. This keeps CI hermetic and lets new contributors run the whole prep→live→post flow on day one.

If you add a feature that talks to a provider, it **must** degrade to a mock so the offline path stays green.

---

## 2. Monorepo map

pnpm + Turborepo. The TS **web** and Python **agent** are co-equal runtimes that share one cross-language contract.

| Path | What it owns | Language |
|---|---|---|
| `packages/shared` | **The contract.** `InterviewContext`, `QuestionPlan`, `ScoreCard`, REST + room contracts. TS source of truth, mirrored as Pydantic. **Build first; change carefully.** | TS (Zod) |
| `apps/web` | UI, auth, CV upload, LiveKit token endpoint, all screens (`/setup`, `/interview/[id]`, `/report/[id]`, `/prep`). Knows nothing about LLM/STT/TTS. | Next.js 16 / React 19 / TS |
| `apps/agent` | The live voice loop + LangGraph prep/post pipelines + avatar render util + skill distiller. Provider **adapters** live in `core/adapters/`. | Python 3.11 (uv) |
| `services/lightrag` | LightRAG + RAG-Anything knowledge sidecar (Docker, `:9621`) for the Prep Coach. | Python (Docker) |
| `cli/` | The `deepinterview` CLI / first-run init wizard — the adoption lever. | TS (tsup) |
| `skills/` | Versioned company playbooks + rubrics (Markdown + YAML frontmatter). | Markdown/YAML |
| `scripts/` | Setup / dev / release scripts, incl. `scripts/veo/` (avatar prompts + render). | mixed |
| `tests/` | Cross-cutting / e2e tests. | mixed |
| `docs/` | Architecture + deploy docs ([`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) is the entry point). | Markdown |

**Cross-language rule:** Python cannot import the TS package, so `packages/shared` is the TS source of truth and the Pydantic models mirror it **field-for-field**. A parity check test enforces this — if you change a contract, update both sides and the parity test will tell you if they drift.

---

## 3. The work-package model

The build is organized as **13 work packages (WP-0…WP-13)**. Each WP has deliverables, an interface contract, and acceptance criteria; the current status and per-package scope are tracked in the GitHub issues and [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

- **Scope a PR to one WP** (or a slice of one). Small, reviewable PRs merge faster.
- WP-0 (`packages/shared`) blocks everything — coordinate before changing a contract.
- Reference the WP in your PR title, e.g. `feat(wp-5): add Deepgram STT adapter`.

---

## 4. The provider-adapter pattern (mock-first)

Providers are pluggable behind small `Protocol` interfaces in `apps/agent/src/deepinterview_agent/core/adapters/base.py` (`LLMAdapter`, `SearchAdapter`, `EmbeddingsAdapter`; STT/TTS adapters arrive with the live loop). To add a provider:

1. Implement the relevant Protocol in a new module under `core/adapters/`.
2. Wire it into adapter selection so it's chosen by the matching `*_PROVIDER` env var.
3. Keep the **mock fallback** intact (no key set → mock).
4. Add a test that runs against the mock so CI stays offline.

This is the cleanest first contribution — see the good-first-issues for a worked example (Deepgram STT).

---

## 5. Conventions

### Commits & PRs

- **[Conventional Commits](https://www.conventionalcommits.org/):** `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:` — with the WP scope where it applies (`feat(wp-9): …`).
- **Small PRs, one concern.** Link the issue. Describe what you changed and how you verified it offline.
- Fill in the PR template (it's auto-applied).

### Code style

- **TS / web / cli:** Prettier formats everything. Run `pnpm format` (write) or `pnpm lint` (check) before pushing. TypeScript is **strict**.
- **Python / agent:** **Ruff** for lint + format. Run it via `uv --directory apps/agent run ruff check` and `… ruff format`. Type hints required on public functions.
- **i18n:** every user-facing string goes through the i18n layer (`apps/web/lib/i18n/messages/`), EN default. Don't hardcode display strings.
- **Keep the live loop lean:** no blocking network/RAG I/O on the turn path — all heavy work happens in prep or post (handoff §4.3).

### Tests

- Run `pnpm test` (TS) and `uv --directory apps/agent run pytest` (Python) before opening a PR. Both must pass **offline**.
- New contracts need a parity test; new pipelines need at least one mock-adapter test.

---

## 6. Contributing skill packs (question banks)

Interview playbooks live in [`skills/`](skills/) as Markdown + YAML frontmatter
and are injected straight into the question planner — the content you write
shapes real interviews. Model yours on the committed `generic-*.md` packs.

**Conventions** (full schema + how retrieval matches and ranks: [`skills/SCHEMA.md`](skills/SCHEMA.md)):

- `company: generic` for role-level packs that should serve any company; a real
  company name only for company-specific playbooks.
- `role` is a **kebab-case slug** (`backend-engineer`) — matched by token
  subset against live JD titles.
- `status: draft` on contributions; maintainers flip status on review.

**Validate before opening a PR:**

```bash
pnpm build                      # once, to build the CLI
pnpm deepinterview skills lint  # schema + convention checks on skills/
```

**Content policy (hard requirement).** Packs must be **recollection-based,
generalized, and de-identified**. Describe patterns and themes ("a system-design
round probing multi-region consistency"), never claimed-verbatim transcripts.
Do **not** contribute: question dumps from leaked or internal sources, anything
you're under NDA about, copyrighted interview-prep material, or personal data
about candidates or interviewers. PRs that can't credibly meet this bar are
rejected — provenance ("based on my onsite in 2026-06") helps us say yes.

---

## 7. Licensing, DCO sign-off & the `/ee` boundary

- **The project is [Apache-2.0](LICENSE).** By contributing you agree your contribution is licensed under Apache 2.0.
- **Sign off your commits (DCO).** We use the lightweight [Developer Certificate of Origin](https://developercertificate.org/) instead of a CLA — no paperwork, no bot. Just add a `Signed-off-by` line by committing with the `-s` flag:

  ```bash
  git commit -s -m "feat(wp-5): add Deepgram STT adapter"
  ```

  This certifies you wrote the change (or have the right to submit it) under the project's license. Forgot it on an existing commit? `git commit --amend -s` (or `git rebase --signoff` for a range), then force-push your branch.
- **Never commit secrets.** Keys live in `.env` only (gitignored). See [SECURITY.md](SECURITY.md).

---

## 8. Getting help

- 🗣️ [GitHub Discussions](https://github.com/ngoanpv/DeepInterview/discussions) for questions and design chat.
- 🐛 [Issues](https://github.com/ngoanpv/DeepInterview/issues) for bugs/features (use the templates).
- 📜 Be kind — we follow the [Code of Conduct](CODE_OF_CONDUCT.md).

Welcome aboard. 🌍
