---
id: generic-frontend-engineer-senior
company: generic
role: frontend-engineer
level: senior
competency:
  - architecture
  - performance
  - accessibility
  - state-management
  - communication
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Senior Frontend Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a front-end system they've owned (12m)
2. Architecture and state design for a non-trivial UI (18m)
3. Performance, accessibility and quality trade-offs (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Describe the most complex UI you've owned. What made it complex — the domain, the data, or the team?"
- "Design the front end for a dashboard with a dozen live-updating widgets. Where does the state live and why?"
- "Your app's largest contentful paint regressed 40% after a release. Walk me through the investigation."
- "How do you decide between server-side rendering, static generation, and client rendering for a given page?"
- "What's your approach to a design system that three teams contribute to?"
- "Tell me about an accessibility problem you found late. What would have caught it earlier?"
- "When is a global store the wrong answer?"
- "How do you keep a large front-end codebase from rotting — specifically?"

## Signals
- Reasons about rendering and data-fetching boundaries deliberately, not by framework default.
- Has real performance numbers and knows which metric matters for which user complaint.
- Treats accessibility as a build-time concern rather than an audit at the end.
- Can explain a front-end decision to a backend engineer or a designer without jargon.

## Pitfalls
- Reaches for a state library before establishing what state actually needs sharing.
- Optimizes bundle size while ignoring what the user actually waits on.
- Describes 'clean architecture' with no example of a decision it made easier.
- Blames designers or the backend for every constraint, with no collaboration story.
