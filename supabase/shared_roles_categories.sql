-- ============================================================
-- Shared, global Roles + Categories for live events AND
-- on-demand courses.
--
-- 1. New `catalog_roles` table — one global list of role options,
--    seeded from every role already used on events and courses.
-- 2. Ensures on_demand_courses has a `roles` column.
-- 3. Backfills the categories list with categories already used
--    on live events, so both catalogs offer the same options.
-- 4. Lets any admin (not just super admins) save new options, so
--    typing a new role/category in the events form persists it.
--
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once (idempotent). No data is removed.
-- ============================================================

-- ---- 1. roles table ----------------------------------------
create table if not exists public.catalog_roles (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  sort_order  int  not null default 0,
  created_at  timestamptz not null default now()
);

create unique index if not exists catalog_roles_name_key
  on public.catalog_roles (lower(name));

alter table public.catalog_roles enable row level security;

drop policy if exists "catalog_roles_read" on public.catalog_roles;
create policy "catalog_roles_read"
  on public.catalog_roles for select
  using ( true );

drop policy if exists "catalog_roles_write_admin" on public.catalog_roles;
create policy "catalog_roles_write_admin"
  on public.catalog_roles for all
  to authenticated
  using ( exists (select 1 from public.admins where user_id = auth.uid()) )
  with check ( exists (select 1 from public.admins where user_id = auth.uid()) );

-- ---- 2. make sure courses have a roles column --------------
alter table public.on_demand_courses
  add column if not exists roles text[] not null default '{}';

-- ---- 3. seed roles from what's already in use --------------
insert into public.catalog_roles (name, sort_order)
select distinct trim(r), 100
from (
  select unnest(roles) as r from public.events
  union all
  select unnest(roles) as r from public.on_demand_courses
) all_roles
where trim(coalesce(r, '')) <> ''
  and not exists (
    select 1 from public.catalog_roles x
    where lower(x.name) = lower(trim(r))
  );

-- ---- 4. share categories both ways -------------------------
-- Add every category already used on live events to the shared
-- categories list (the one on-demand courses use).
insert into public.on_demand_categories (name, sort_order)
select distinct trim(category), 100
from public.events
where trim(coalesce(category, '')) <> ''
  and not exists (
    select 1 from public.on_demand_categories x
    where lower(x.name) = lower(trim(category))
  );

-- ---- 5. let any admin save new categories ------------------
-- (was super-admin only; now any signed-in admin, so the events
-- form can persist a newly typed category)
drop policy if exists "od_categories_write_super" on public.on_demand_categories;
drop policy if exists "od_categories_write_admin" on public.on_demand_categories;
create policy "od_categories_write_admin"
  on public.on_demand_categories for all
  to authenticated
  using ( exists (select 1 from public.admins where user_id = auth.uid()) )
  with check ( exists (select 1 from public.admins where user_id = auth.uid()) );
