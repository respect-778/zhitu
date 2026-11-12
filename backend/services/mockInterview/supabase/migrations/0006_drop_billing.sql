-- 0006_drop_billing.sql — remove billing from the OSS schema.
--
-- The open-source build is self-host, bring-your-own-keys, and UNCAPPED: it has
-- no payments and no per-tier interview limit. Payments/plan-gating (WP-11) live
-- in the private cloud fork, not here. This migration drops the billing schema
-- that 0002 added (and the plan/usage columns 0001 carried), leaving a lean
-- profiles table: { id, email, locale, created_at, updated_at }.
--
-- Forward-only and idempotent (`if exists`): on a DB that applied 0002 it drops
-- the real objects; on a fresh DB (which applies 0002 then this) the drops are
-- no-ops. Destructive by design — any billing rows are discarded.

-- Defensive: an interim build shipped a `consume_interview` metering RPC; drop
-- it if present.
drop function if exists public.consume_interview(uuid);

-- Billing tables (0002).
drop table if exists public.credit_ledger;
drop table if exists public.subscriptions;

-- Monthly-usage reset helper (0002).
drop function if exists public.reset_usage_if_due(uuid);

-- Billing/plan columns on profiles (0002 + 0001).
alter table public.profiles drop column if exists credits;
alter table public.profiles drop column if exists usage_period_start;
alter table public.profiles drop column if exists plan_renews_at;
alter table public.profiles drop column if exists plan;
alter table public.profiles drop column if exists interviews_used;
