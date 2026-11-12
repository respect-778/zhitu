---
id: generic-frontend-engineer-mid
company: generic
role: frontend-engineer
level: mid
competency:
  - web-fundamentals
  - state-management
  - performance
  - collaboration
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-07-25
status: promoted
---

# Generic — Frontend Engineer (mid)

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs).

## Round structure
1. Recent-work walkthrough — one feature they shipped (10m)
2. Applied fundamentals — rendering, state, data fetching (15m)
3. Performance & debugging scenario (15m)
4. Candidate questions + wrap (5m)

## Question bank
- "Take a feature you shipped recently. What was the hardest UI state to get right, and how did you model it?"
- "A page renders wrong data for a second, then corrects itself. What are the likely causes and how do you fix each?"
- "When does client-side state belong in a global store versus component state versus the URL? Give examples from your work."
- "A product page scores badly on Core Web Vitals. Walk me through how you'd diagnose it and the first three fixes you'd try."
- "How do you handle an API that is slow and occasionally fails, so the user still gets a decent experience?"
- "Tell me about a disagreement with a designer or PM about a UI behavior. How did it resolve?"
- "What do you test in frontend code, and what do you deliberately not test?"

## Signals
- Explains rendering and data-flow behavior mechanically, not by framework folklore.
- Reaches for measurement (profiler, web vitals, network panel) before proposing fixes.
- Talks about users and edge states (loading, empty, error, offline) unprompted.

## Pitfalls
- Framework-brand answers ("X handles that") with no grasp of the underlying mechanism.
- Optimizes bundle size or memoization without ever measuring.
- No opinion on accessibility or error states until asked directly.
