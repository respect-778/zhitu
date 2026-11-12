---
id: generic-data-engineer-mid
company: generic
role: data-engineer
level: mid
competency:
  - data-modeling
  - pipelines
  - sql
  - data-quality
version: 1
source_runs: 0
confidence: 0.5
last_verified: 2026-08-26
status: promoted
---

# Generic — Mid-level Data Engineer

> Company-agnostic playbook: matched as a fallback when no company-specific
> pack exists. Hand-curated (not distilled from runs), hence `source_runs: 0` and moderate confidence.

## Round structure
1. Deep-dive on a pipeline they own (12m)
2. Design a pipeline end to end — ingestion, transformation, serving (18m)
3. Data quality, backfills and debugging (10m)
4. Candidate questions + wrap (5m)

## Question bank
- "Describe a pipeline you own. What happens when it fails at 3am?"
- "Design a daily pipeline turning raw event logs into a table analysts query. Where does it break first?"
- "A dashboard number looks wrong. How do you trace it back to the source?"
- "How do you handle late-arriving data without corrupting yesterday's numbers?"
- "Write the query: for each user, their first and most recent purchase, plus lifetime total."
- "When do you choose ELT over ETL — and when has that been the wrong call?"
- "How do you make a backfill safe and repeatable?"

## Signals
- Designs for idempotency and re-runs, because pipelines always get re-run.
- Thinks about the consumer of the data, not just the mechanics of moving it.
- Has real data-quality checks with owners, not just a monitoring dashboard.
- Comfortable with SQL beyond joins — window functions, aggregation, and why a query is slow.

## Pitfalls
- Pipelines that cannot be re-run without duplicating or losing rows.
- Treats schema changes upstream as someone else's problem.
- No distinction between a pipeline that failed and one that quietly produced wrong data.
- Chooses tooling by popularity with no fit to the data volume at hand.
