---
id: generic-data-engineer-senior
company: generic
role: data-engineer
level: senior
competency:
  - data-architecture
  - pipelines
  - reliability
  - cost-efficiency
  - stakeholder-management
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Senior Data Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a platform or warehouse they've shaped (14m)
2. Architecture for a multi-source, multi-consumer data platform (20m)
3. Reliability, cost and organizational trade-offs (11m)
4. Candidate questions + wrap (5m)

## Question bank
- "Describe the data platform you've most shaped. What did you inherit and what did you change?"
- "Design a system serving both analytics and a production feature from the same event stream."
- "How do you decide between streaming and batch — and where have you seen streaming chosen wrongly?"
- "Warehouse spend doubled in a quarter. How do you find out why and what do you do about it?"
- "How do you handle a breaking schema change from a team that doesn't report to you?"
- "What does data ownership look like on your team in practice, not on paper?"
- "Tell me about a data incident with real business consequences. What changed afterward?"
- "How do you keep a semantic layer from drifting away from what the business means?"

## Signals
- Treats data contracts and ownership as organizational design, not just tooling.
- Reasons about cost per query and storage tiering as an engineering constraint.
- Distinguishes correctness incidents from availability incidents and treats them differently.
- Has moved a platform without a flag day — dual-writes, shadow reads, staged cutover.

## Pitfalls
- Builds a beautiful platform nobody adopts, with no account of why.
- Ignores cost entirely, or optimizes it at the expense of trust in the data.
- Cannot describe how upstream teams are held to a contract.
- Every answer is a tool name rather than a property they needed.
