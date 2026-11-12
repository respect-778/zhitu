---
id: generic-devops-engineer-mid
company: generic
role: devops-engineer
level: mid
competency:
  - ci-cd
  - infrastructure-as-code
  - observability
  - automation
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level DevOps Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a pipeline or platform they maintain (12m)
2. Design a deployment path for a service, dev to production (18m)
3. Incident, observability and toil questions (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Describe the deployment pipeline you maintain. What's the slowest and least trusted part?"
- "Design the path a commit takes to production for a team of ten. Where are the gates?"
- "A deploy went out and errors spiked. What happens next, and how much of it is automatic?"
- "How do you manage secrets across environments?"
- "What's the most repetitive thing your team does, and what would it take to automate it away?"
- "How do you know a service is healthy beyond 'the process is running'?"
- "How do you handle infrastructure drift between what's in code and what's actually deployed?"

## Signals
- Optimizes for fast, safe rollback rather than preventing every bad deploy.
- Treats infrastructure as code seriously, including review and testing of that code.
- Measures the pipeline itself — lead time, failure rate, restore time.
- Reduces toil deliberately and can name what they removed.

## Pitfalls
- Manual steps in the critical path documented in a wiki nobody reads.
- Alerts on causes rather than symptoms, producing noise people ignore.
- Snowflake environments where staging doesn't predict production.
- Secrets in CI variables with no rotation story.
