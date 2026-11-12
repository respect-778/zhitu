---
id: generic-ios-engineer-senior
company: generic
role: ios-engineer
level: senior
competency:
  - swift
  - apple-platform
  - architecture
  - performance
  - app-quality
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Senior iOS Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on an iOS codebase they've owned (12m)
2. Architecture and concurrency design for a feature (18m)
3. Performance, memory and shipping practice (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Describe an iOS app you owned. What was the state of it when you arrived, and when you left?"
- "Design an image-heavy feed that scrolls smoothly on a five-year-old device."
- "How do you reason about concurrency in Swift today — where has it bitten you?"
- "When would you choose SwiftUI, UIKit, or both in one screen?"
- "Memory is climbing while the user scrolls. How do you find out why?"
- "How do you structure a module so it can be tested without a device?"
- "Tell me about an App Store rejection or a privacy requirement that changed your design."
- "How do you support two OS versions back without freezing your architecture?"

## Signals
- Reasons about the main thread as a scarce resource with a frame budget.
- Uses Instruments or equivalent tooling as a first response rather than a last resort.
- Understands Apple's constraints — review, privacy, deprecation — as design inputs.
- Can justify an architecture in terms of testability and team size, not fashion.

## Pitfalls
- Cargo-cults an architecture pattern with no account of what it cost.
- Treats retain cycles and memory as an occasional mystery rather than something to measure.
- Only knows the newest APIs, with no plan for supported older versions.
- Ignores accessibility and Dynamic Type on a consumer app.
