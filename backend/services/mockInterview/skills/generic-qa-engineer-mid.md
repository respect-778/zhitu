---
id: generic-qa-engineer-mid
company: generic
role: qa-engineer
level: mid
competency:
  - test-strategy
  - automation
  - exploratory-testing
  - quality-advocacy
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level QA / Test Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on how they test a product they know well (12m)
2. Design a test strategy for a feature end to end (18m)
3. Automation, flakiness and release judgment (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Take a product you know. How would you test a change to its checkout flow?"
- "Design the test strategy for a new payments feature. What's automated, what isn't, and why?"
- "Your suite has 30 flaky tests. What do you do this week, and what do you do about the cause?"
- "How do you decide a release is ready to go when a few known bugs remain?"
- "What's the most interesting bug you've found, and how did you find it?"
- "How do you test something that depends on a third-party service you don't control?"
- "How do you get developers to care about the tests you write?"

## Signals
- Thinks in terms of risk coverage rather than test count.
- Explores actively — hypothesis-driven, not just following a script.
- Treats flakiness as a defect in the test system, with a real fix.
- Advocates for quality by making problems visible early, not by gatekeeping at the end.

## Pitfalls
- Automates everything at the UI layer, producing a slow and brittle suite.
- Reports bugs without a reproduction or an assessment of impact.
- Sees quality as their exclusive responsibility rather than the team's.
- Cannot say what their tests would fail to catch.
