---
id: generic-machine-learning-engineer-mid
company: generic
role: machine-learning-engineer
level: mid
competency:
  - ml-fundamentals
  - data-pipelines
  - evaluation
  - productionization
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Machine Learning Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a model they took to production (12m)
2. Design an ML system — data, training, serving, monitoring (18m)
3. Evaluation and debugging a misbehaving model (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Tell me about a model you put in production. What was different from the notebook?"
- "Design a recommendation system for a mid-size catalog. Start with what you'd ship first."
- "Your offline metrics improved but the online metric didn't move. What are the candidate explanations?"
- "How do you detect that a model in production has gone stale?"
- "What's your validation split strategy when the data is a time series?"
- "How do you choose a baseline, and when have you failed to beat one?"
- "Where does feature computation live at training time versus serving time, and how do you keep them consistent?"

## Signals
- Ships a simple baseline first and treats model complexity as a cost.
- Understands training/serving skew as a systems problem, not a modeling detail.
- Chooses metrics tied to the product outcome, and knows their failure modes.
- Monitors inputs, not just outputs — drift shows up in features first.

## Pitfalls
- Reports accuracy with no baseline and no class balance.
- Leaks future information into training and cannot spot it when walked through.
- Treats deployment as someone else's job.
- Chases model architecture where the data is the bottleneck.
