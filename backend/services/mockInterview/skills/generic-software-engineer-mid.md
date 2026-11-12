---
id: generic-software-engineer-mid
company: generic
role: software-engineer
level: mid
competency:
  - problem-solving
  - code-quality
  - testing
  - collaboration
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Software Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Project deep-dive on something they shipped (12m)
2. Coding: a problem with a naive answer and a better one (20m)
3. Design and code-quality discussion (8m)
4. Candidate questions + wrap (5m)

## Question bank
- "Tell me about something you shipped end to end. What did you own versus review?"
- "Given a stream of events, return the top K most frequent in the last hour. Talk me through your approach before coding."
- "How would you refactor a 500-line function you have to change next week?"
- "Describe a time your code caused a production problem. What happened next?"
- "How do you decide when a piece of code needs a test?"
- "You disagree with a code review comment from a more senior engineer. What do you do?"
- "What's a piece of feedback that changed how you write code?"

## Signals
- States the approach and its complexity before writing code, and revises it out loud.
- Handles the edge cases they identified rather than the ones they were prompted for.
- Talks about readability and the next person to touch the code.
- Owns a production mistake without either minimizing it or over-apologizing.

## Pitfalls
- Optimizes prematurely, or cannot say what the bottleneck would be.
- Writes code that works for the example and breaks on the empty case.
- Treats code review as approval rather than as a conversation.
- Cannot describe anything they'd do differently in a project they just called finished.
