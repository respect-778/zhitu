---
id: generic-data-scientist-mid
company: generic
role: data-scientist
level: mid
competency:
  - statistics
  - experimentation
  - modeling
  - communication
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Data Scientist

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on an analysis or model that changed a decision (12m)
2. Experiment design and statistical reasoning (18m)
3. Modeling and practical trade-offs (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Tell me about an analysis that changed what your team did. How did you know it was right?"
- "Design an A/B test for a checkout change. What's your metric, and how long do you run it?"
- "The test is positive on the primary metric and negative on retention. What now?"
- "How do you handle a stakeholder who wants the result before the experiment is finished?"
- "You have a model at 95% accuracy on an imbalanced dataset. Why might that be worthless?"
- "How do you decide whether a problem needs a model at all?"
- "Walk me through how you'd investigate a sudden drop in a key metric."
- "What's a result you were confident in that turned out to be wrong?"

## Signals
- Starts from the decision the analysis is meant to inform, not the technique.
- Reasons about power, variance and duration before running anything.
- Interrogates data quality and selection effects before interpreting.
- Explains uncertainty to non-technical people without either false precision or hedging into uselessness.

## Pitfalls
- Reaches for a complex model where a well-chosen cut of the data answers the question.
- Reports point estimates with no interval and no sense of noise.
- Peeks at running experiments and stops on significance.
- Cannot say what would have changed their mind.
