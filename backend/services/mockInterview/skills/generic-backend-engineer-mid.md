---
id: generic-backend-engineer-mid
company: generic
role: backend-engineer
level: mid
competency:
  - api-design
  - data-modeling
  - testing
  - debugging
  - communication
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Backend Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a service they own day to day (12m)
2. Design a small system end to end — API surface, storage, failure handling (18m)
3. Debugging and operational judgment (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Describe a service you own. What does it do, who calls it, and what happens when it's down?"
- "Design a URL shortener. Now tell me what breaks when one link goes viral."
- "You need to add a required column to a table with 50 million rows, live. What's the plan?"
- "A background job silently stopped processing three days ago and nobody noticed. What went wrong beyond the job itself?"
- "How do you decide what to unit test versus integration test? Where have you gotten that balance wrong?"
- "Two services need the same data. When do you duplicate it, and when do you call across?"
- "Walk me through the last time you had to make an API change that would break a consumer."

## Signals
- Designs the failure path, not just the happy path — timeouts, retries, what the caller sees.
- Chooses boring, appropriate technology and can say why the exotic option is unnecessary here.
- Has opinions about testing formed by being burned, with a specific story attached.
- Distinguishes what they built from what they inherited.

## Pitfalls
- Adds a cache or a queue as a reflex, without a bottleneck to point at.
- Cannot describe how their service fails, only how it works.
- Describes 'we have tests' with no sense of what those tests actually protect.
- Skips the migration/rollout question — designs a finished state with no path to it.
