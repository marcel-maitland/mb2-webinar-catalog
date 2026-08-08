-- ============================================================
-- On-demand courses — Featured flag
--
-- Featured courses automatically appear at the top of the public
-- catalog, ahead of the normal sort order.
--
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once (idempotent). No data is modified.
-- ============================================================

alter table public.on_demand_courses
  add column if not exists is_featured boolean not null default false;
