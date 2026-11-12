---
id: generic-full-stack-engineer-mid
company: generic
role: full-stack-engineer
level: mid
competency:
  - end-to-end-delivery
  - api-design
  - ui-implementation
  - pragmatism
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Full-stack Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a feature they built across the stack (12m)
2. Design a feature end to end — data, API, UI (18m)
3. Trade-offs and debugging across boundaries (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Walk me through a feature you built from database to pixels. Where did the tricky part turn out to be?"
- "Design commenting with replies for an existing app. Schema, endpoints, and how the UI stays fast."
- "Something is slow. How do you work out whether it's the query, the API, the network, or the render?"
- "Where do you put validation — client, server, or database? Defend the duplication."
- "You need to ship a feature this week but doing it properly takes three. What do you actually do?"
- "How do you keep front-end and back-end types from drifting apart?"
- "Tell me about a bug that lived at a boundary between two systems."

## Signals
- Comfortable being specific on both sides rather than strong on one and vague on the other.
- Instruments and measures before deciding which layer is at fault.
- Makes an explicit, time-boxed shortcut and names the debt it creates.
- Thinks about the contract between layers as a real artifact.

## Pitfalls
- Claims full-stack but flattens into one side under follow-up questions.
- Validates only on the client, or only on the server, without a reason.
- Blames 'the API' or 'the frontend' for problems at the seam.
- No sense of what a feature costs to maintain after it ships.
