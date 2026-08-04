-- ============================================================
-- On-demand courses — "External Link" flag
--
-- Courses marked external show a confirmation popup before the
-- visitor leaves for the outside platform ("completion and
-- certificates will not be recorded within MB2 Shield").
--
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once (idempotent). No data is modified.
-- ============================================================

alter table public.on_demand_courses
  add column if not exists is_external boolean not null default false;
