---
id: generic-android-engineer-mid
company: generic
role: android-engineer
level: mid
competency:
  - kotlin
  - android-platform
  - architecture
  - performance
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Android Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on an Android app they've worked on (12m)
2. Feature design with lifecycle and process-death constraints (18m)
3. Performance, fragmentation and release practice (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Tell me about an Android app you worked on. What was hardest about the device landscape?"
- "Design a screen that survives rotation, process death, and a cold start from a notification."
- "How do you keep work off the main thread in Kotlin, and what have you gotten wrong there?"
- "An ANR shows up only on low-end devices. How do you chase it?"
- "How do you decide what belongs in a ViewModel versus a repository?"
- "What's your approach to background work that must eventually run?"
- "How do you handle a permission the user has permanently denied?"

## Signals
- Treats the activity/process lifecycle as a first-class design input, not trivia.
- Tests on realistic hardware and knows what low-end actually means for their app.
- Uses structured concurrency deliberately, with cancellation in mind.
- Understands background execution limits rather than fighting them.

## Pitfalls
- Stores UI state where it cannot survive a configuration change, then patches symptoms.
- Assumes a flagship device and a fast network.
- Cannot explain what happens when the system kills their process.
- Requests permissions upfront with no context for the user.
