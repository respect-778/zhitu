---
id: generic-mobile-engineer-mid
company: generic
role: mobile-engineer
level: mid
competency:
  - mobile-platform
  - ui-implementation
  - offline-and-state
  - performance
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Mobile Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on an app they shipped to a store (12m)
2. Feature design under mobile constraints — offline, battery, lifecycle (18m)
3. Debugging, crashes and release practice (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Tell me about an app you shipped. What did the store review or launch teach you?"
- "Design an inbox that works offline and syncs when connectivity returns. What happens on conflict?"
- "Your crash rate jumped after a release. Walk me through the first hour."
- "How do you handle a screen whose data comes from three endpoints with different latencies?"
- "What does the OS do to your app in the background, and how have you had to work around it?"
- "How do you test something that only reproduces on a real device?"
- "You can't hotfix — the release is in review. How does that change how you ship?"

## Signals
- Designs for interruption: backgrounding, process death, restoration, flaky networks.
- Treats app size, battery and cold-start as real budgets with numbers.
- Has an actual crash-triage workflow, including how they get symbolicated stacks.
- Understands release trains and staged rollouts as risk management.

## Pitfalls
- Assumes connectivity and treats offline as an error state to show.
- Ignores platform lifecycle, then can't explain a class of state-loss bugs.
- Tests exclusively on the simulator and the newest flagship device.
- No plan for a bad release beyond 'ship a fix'.
