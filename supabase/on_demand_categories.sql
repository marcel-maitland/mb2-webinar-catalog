-- ============================================================
-- On-demand course categories — persistent, manageable taxonomy
--
-- Before this migration, the 5 preset categories were hardcoded in
-- src/admin/OnDemandForm.jsx and custom categories only lived on the
-- individual course row. This table makes every category a saved,
-- reusable option that super admins can add / rename / delete from
-- the admin UI ("Manage categories").
--
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once (idempotent).
-- ============================================================

-- ---- 1. table ----------------------------------------------
create table if not exists public.on_demand_categories (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

-- Unique, case-insensitive names so "Front Office" and "front office"
-- can't both sneak in.
create unique index if not exists on_demand_categories_name_key
  on public.on_demand_categories (lower(name));

-- ---- 2. super-admin helper ---------------------------------
-- (create or replace is a no-op if the multi-tenant migration
-- already defined the same function.)
create or replace function public.is_super_admin()
returns boolean language sql stable as $$
  select exists (
    select 1 from public.admins
    where user_id = auth.uid() and is_super_admin = true
  );
$$;

-- ---- 3. Row Level Security ---------------------------------
alter table public.on_demand_categories enable row level security;

-- Anyone (including the public catalog) can read the list.
drop policy if exists "od_categories_read" on public.on_demand_categories;
create policy "od_categories_read"
  on public.on_demand_categories for select
  using ( true );

-- Only super admins can add / rename / delete.
drop policy if exists "od_categories_write_super" on public.on_demand_categories;
create policy "od_categories_write_super"
  on public.on_demand_categories for all
  to authenticated
  using ( public.is_super_admin() )
  with check ( public.is_super_admin() );

-- ---- 4. Seed the original 5 presets ------------------------
insert into public.on_demand_categories (name, sort_order)
values
  ('Regulatory Compliance and Safety',          0),
  ('Clinical Excellence and Medical Knowledge', 10),
  ('Front Office',                              20),
  ('Leadership and Practice Management',        30),
  ('Professional Development',                  40)
on conflict do nothing;

-- ---- 5. Backfill custom categories already used on courses --
-- Any tag previously typed via "+ Add custom category" that is saved
-- on a course becomes a real, reusable option too.
insert into public.on_demand_categories (name, sort_order)
select distinct trim(c), 100
from public.on_demand_courses, unnest(categories) as c
where trim(c) <> ''
  and not exists (
    select 1 from public.on_demand_categories x
    where lower(x.name) = lower(trim(c))
  );
