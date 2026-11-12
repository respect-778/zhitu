---
id: generic-ai-engineer-senior
company: generic
role: ai-engineer
level: senior
competency:
  - llm-application-design
  - evaluation
  - retrieval
  - cost-and-latency
  - product-judgment
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Senior AI Engineer (LLM Applications)

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on an LLM feature they shipped to users (14m)
2. Design an LLM-backed product feature with evaluation and guardrails (20m)
3. Cost, latency and failure-mode judgment (11m)
4. Candidate questions + wrap (5m)

## Question bank
- "Tell me about an LLM feature you shipped. What did real users do that you didn't expect?"
- "Design a support assistant over a company's documentation. How do you know it's good enough to launch?"
- "How do you build an evaluation set when there's no ground truth to start from?"
- "Your assistant is confidently wrong 5% of the time. What are your options, and what do they cost?"
- "When is retrieval the answer, when is fine-tuning, and when is neither?"
- "How do you keep prompt changes from silently regressing behavior?"
- "Where do you put a human in the loop, and how do you decide?"
- "How do you handle latency when the model is the slow part of the request?"

## Signals
- Builds evaluation before scaling the feature, and treats evals as a product asset.
- Reasons about failure modes in user terms — wrong, refused, slow, unsafe — not just model metrics.
- Treats prompts and retrieval as versioned, tested artifacts rather than editable strings.
- Knows when a deterministic system beats a model and says so.

## Pitfalls
- Demo-driven development with no measurement of the failure rate.
- Adds retrieval reflexively without checking whether the model already knows the answer.
- No guardrails for the case where the model is wrong, only for where it's unsafe.
- Cannot say what the feature costs per request or what it would cost at 100x.
