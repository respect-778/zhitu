---
id: generic-backend-engineer-senior
company: generic
role: backend-engineer
level: senior
competency:
  - system-design
  - distributed-systems
  - operational-maturity
  - communication
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-07-25
status: promoted
---

# Generic — Senior Backend Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0`
> and moderate confidence.

## Round structure
1. Experience deep-dive on one system they owned (10m)
2. System design grounded in their domain (20m)
3. Operational judgment — failure, on-call, trade-offs (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Pick the system you know best. What breaks first if traffic grows 10x, and what would you change ahead of that?"
- "Walk me through a production incident you owned end to end. What did the postmortem change?"
- "Design a job scheduler for delayed tasks (emails, retries) at tens of millions of jobs/day. Where does exactly-once break down?"
- "You inherit a service with p99 ten times worse than p50. How do you find out why, and what are the usual suspects?"
- "When did you argue against a rewrite — or for one? What made the difference?"
- "How do you make a schema migration safe on a table serving live traffic?"
- "Describe an API you designed that other teams consume. What would you change about it today?"

## Signals
- Quantifies scale and impact without being prompted; distinguishes measured facts from guesses.
- Names concrete failure modes (hot partitions, thundering herds, retry storms) rather than abstract "scalability".
- Reasons about operational cost and team ownership, not just architecture diagrams.

## Pitfalls
- Designs for imaginary scale before clarifying actual requirements.
- Cannot explain a debugging path — jumps from symptom to conclusion.
- Attributes team outcomes to themselves without naming their specific contribution.
