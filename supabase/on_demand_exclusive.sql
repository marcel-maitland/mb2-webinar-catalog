-- ============================================================
-- On-demand courses — MB2 Exclusive flag
--
-- Adds the same mb2_exclusive flag that live events have, so
-- on-demand courses can be marked MB2 Exclusive too.
--
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once (idempotent). No data is modified.
-- ============================================================

alter table public.on_demand_courses
  add column if not exists mb2_exclusive boolean not null default false;
