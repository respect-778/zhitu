---
id: generic-security-engineer-senior
company: generic
role: security-engineer
level: senior
competency:
  - threat-modeling
  - secure-design
  - incident-response
  - risk-prioritization
  - communication
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Senior Security Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a security problem they owned (14m)
2. Threat-model a system and design mitigations (20m)
3. Risk prioritization and working with product teams (11m)
4. Candidate questions + wrap (5m)

## Question bank
- "Tell me about a security issue you found or fixed. How did you decide how urgent it was?"
- "Threat-model a file-sharing feature: who are the attackers, and what do they get?"
- "How do you prioritize a backlog of vulnerabilities that all look scary in the scanner?"
- "A team wants to ship something you think is risky, and the deadline is real. What do you do?"
- "Walk me through how you'd handle a credential leaked in a public repository."
- "How do you design authorization for a system with organizations, teams and roles?"
- "What's a security control your team adopted that turned out not to be worth it?"
- "How do you make secure defaults the easy path for engineers?"

## Signals
- Reasons about risk in terms of likelihood and blast radius, not severity labels alone.
- Designs controls engineers will actually adopt rather than ones that get bypassed.
- Distinguishes theoretical vulnerabilities from exploitable ones in this specific system.
- Communicates risk to non-security people without either alarmism or jargon.

## Pitfalls
- Blocks work without offering a viable path forward.
- Treats compliance checkboxes as equivalent to security outcomes.
- Fixates on exotic attacks while basics (authz, secrets, patching) go unaddressed.
- No incident story — only prevention in the abstract.
