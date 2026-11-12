---
id: generic-site-reliability-engineer-senior
company: generic
role: site-reliability-engineer
level: senior
competency:
  - reliability-engineering
  - incident-response
  - observability
  - capacity-planning
  - systems-debugging
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Senior Site Reliability Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on the hardest incident they've run (14m)
2. Reliability design for a critical service — SLOs, failure domains, degradation (20m)
3. Capacity, cost and organizational reliability practice (11m)
4. Candidate questions + wrap (5m)

## Question bank
- "Walk me through the worst incident you've been on point for. What did you know and when?"
- "Define SLOs for a checkout service. What do you do when the error budget is spent?"
- "Design graceful degradation for a service whose main dependency is down."
- "Latency is fine at p50 and terrible at p99. Where do you look?"
- "How do you plan capacity for an event you know is coming — and one you don't?"
- "What makes a postmortem actually change something?"
- "How do you push back on a team that keeps shipping unreliable services?"
- "Tell me about a monitoring gap you only found because of an outage."

## Signals
- Separates mitigation from root cause and prioritizes restoring service.
- Uses error budgets as a shared language with product, not as a cudgel.
- Debugs distributed systems by narrowing failure domains methodically.
- Blameless in practice — talks about systems and defaults, not individuals.

## Pitfalls
- Heroics as a reliability strategy, with pride rather than concern.
- Every incident's action item is 'add more monitoring'.
- Cannot describe how a change is rolled out or rolled back.
- Treats reliability as an SRE-only responsibility.
