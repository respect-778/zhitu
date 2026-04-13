# Memory Bootstrap Prompt

## Mission

Bootstrap the repository memory docs so future agent runs start from grounded project context instead of scaffold placeholders.

## Read first

- .agent-workflow/project.json
- .agent-workflow/project-profile.md
- .agent-workflow/memory/product.md (still scaffold-like)
- .agent-workflow/memory/architecture.md (still scaffold-like)
- .agent-workflow/memory/domain-rules.md (still scaffold-like)
- .agent-workflow/memory/runbook.md (still scaffold-like)

## What to do

1. Inspect the repository shape, docs, and scripts described below.
2. Update the memory docs in place under `.agent-workflow/memory/`.
3. Replace scaffold placeholders with repo-specific notes.
4. Preserve anything that is already true and useful.
5. If something is unknown, write it under open questions instead of inventing facts.

## Hard rules

- Stay local-first and file-based.
- Do not add absolute machine paths.
- Do not fake verification, production state, or business context.
- Keep notes concise, durable, and handoff-friendly.
- Prefer explicit unknowns over confident guesses.

## Repository profile snapshot

### Top-level directories

- docs
- public
- src

### Docs

- README.md
- docs/useBeforeUnload-useBlocker-guide.md

### Scripts

- `dev`: `vite`
- `build`: `tsc -b && vite build`
- `lint`: `eslint .`
- `preview`: `vite preview`

### Scanner recommendations

- Add an agent-facing root document such as AGENTS.md or CLAUDE.md.

## Memory docs to update

- .agent-workflow/memory/product.md (still scaffold-like)
- .agent-workflow/memory/architecture.md (still scaffold-like)
- .agent-workflow/memory/domain-rules.md (still scaffold-like)
- .agent-workflow/memory/runbook.md (still scaffold-like)

## Current memory excerpts

## .agent-workflow/memory/product.md

- Placeholder-like: yes

```md
# Product Memory

## Product truth

- What user problem are we solving?
- What must never be faked?
- What business outcomes matter most?

## Current constraints

- Technical constraints:
- Compliance constraints:
- Operational constraints:

## Open questions

-
```

## .agent-workflow/memory/architecture.md

- Placeholder-like: yes

```md
# Architecture Memory

## Current architecture

- Core modules:
- Data flows:
- Key dependencies:

## Fragile areas

- 

## Invariants

-
```

## .agent-workflow/memory/domain-rules.md

- Placeholder-like: yes

```md
# Domain Rules

## Rules that must stay true

- 

## Contract assumptions

- 

## Forbidden shortcuts

- placeholder APIs
- fake verification
- hidden production toggles
```

## .agent-workflow/memory/runbook.md

- Placeholder-like: yes

```md
# Runbook

## Standard loops

1. scan
2. create or update task
3. compile prompt
4. execute
5. record evidence
6. checkpoint

## Verification expectations

- what must be tested?
- what can only be manually verified?
- what still lacks tooling?
```

## Expected output

- updated `product.md`, `architecture.md`, `domain-rules.md`, and `runbook.md`
- repo-grounded constraints and invariants
- explicit open questions where the repository does not provide enough evidence
- no fake certainty
