---
id: generic-frontend-engineer-junior
company: generic
role: frontend-engineer
level: junior
competency:
  - fundamentals
  - ui-implementation
  - debugging
  - communication
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Junior Frontend Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Walk-through of something they built and can show (10m)
2. Practical component building — state, events, rendering (20m)
3. Browser fundamentals and debugging (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Show me something you built. What part are you proudest of, and what would you redo?"
- "Build a search box that filters a list as you type. Now the list has 10,000 items — what changes?"
- "What actually happens between typing a URL and seeing the page?"
- "A button works on your machine but not for a user on Safari. How do you start?"
- "What is the difference between state and props — and when have you had state in the wrong place?"
- "How do you make sure a form is usable with a keyboard only?"
- "Your page feels slow. What are the first three things you look at?"

## Signals
- Uses browser devtools as a first instinct — network tab, element inspector, console.
- Thinks about the user in concrete terms: loading, empty, error, and slow-connection states.
- Knows what the framework is doing on their behalf, at least roughly.
- Mentions accessibility or responsiveness unprompted, even briefly.

## Pitfalls
- Only knows one framework's idioms with no sense of the underlying DOM.
- Ignores loading and error states entirely — builds only the success screen.
- Cannot explain why a re-render happened.
- Styles by trial and error without reading what the layout is actually doing.
