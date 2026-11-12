---
id: generic-machine-learning-engineer-senior
company: generic
role: machine-learning-engineer
level: senior
competency:
  - ml-systems
  - experimentation
  - productionization
  - technical-leadership
  - cost-efficiency
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Senior Machine Learning Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on an ML system they own end to end (14m)
2. Architecture for training, serving and iteration at scale (20m)
3. Judgment: when ML is and isn't the answer (11m)
4. Candidate questions + wrap (5m)

## Question bank
- "Describe an ML system you own. How does a model get from an idea to serving traffic?"
- "Design the retraining and rollout path for a model where a bad version costs real money."
- "How do you evaluate a model whose ground truth arrives weeks later?"
- "When have you argued against using ML for something?"
- "Serving costs are dominating the model's value. What levers do you pull, in what order?"
- "How do you keep a team of ML engineers from producing five incompatible pipelines?"
- "Tell me about a model failure in production. What did the postmortem change structurally?"
- "How do you handle feedback loops where the model influences its own future training data?"

## Signals
- Designs the iteration loop — how fast can a hypothesis become a measured result.
- Treats rollback, shadow evaluation and guardrail metrics as required infrastructure.
- Reasons about unit economics of inference and where quality is worth paying for.
- Aware of feedback loops, degenerate optimization and the ways metrics get gamed.

## Pitfalls
- Optimizes benchmark numbers with no line to a business or user outcome.
- No plan for rolling back a bad model beyond redeploying the old one manually.
- Cannot explain how their system would be debugged by someone else.
- Ignores the label pipeline, which is usually where the real problem lives.
