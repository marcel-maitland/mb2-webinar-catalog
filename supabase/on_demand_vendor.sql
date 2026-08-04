-- ============================================================
-- On-demand courses — Presenter / Vendor support
--
-- Adds the same vendor fields that live events already have, so
-- on-demand courses can share the existing vendors list (the
-- `vendors` table managed on the admin Vendors page).
--
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once (idempotent). No data is modified.
-- ============================================================

alter table public.on_demand_courses
  add column if not exists vendor text;

alter table public.on_demand_courses
  add column if not exists vendor_logo_url text;
