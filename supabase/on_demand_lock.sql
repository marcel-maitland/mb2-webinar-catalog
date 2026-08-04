-- ============================================================
-- On-demand courses — lock feature + client access
--
-- 1. Adds `is_locked` to courses. Locked courses are view-only
--    for client admins; only super admins can edit or unlock.
-- 2. LOCKS EVERY EXISTING COURSE (per Marcel, 2026-08-04).
-- 3. RLS: client admins can now READ all courses (so the On
--    Demand section works in their admin view) and UPDATE only
--    unlocked ones. Creating, deleting, and locking/unlocking
--    stay super-admin only.
--
-- Run this in Supabase: SQL Editor → New query → paste → Run.
-- Safe to run more than once (idempotent).
-- ============================================================

-- ---- 1. lock column (new courses default to unlocked) ------
alter table public.on_demand_courses
  add column if not exists is_locked boolean not null default false;

-- ---- 2. lock everything that exists today ------------------
update public.on_demand_courses
set is_locked = true
where is_locked = false;

-- ---- 3. RLS additions (existing policies stay in place) ----
-- Any signed-in admin can read every course (drafts included) so
-- the client admin On Demand list works.
drop policy if exists "od_courses_read_admin" on public.on_demand_courses;
create policy "od_courses_read_admin"
  on public.on_demand_courses for select
  to authenticated
  using ( exists (select 1 from public.admins where user_id = auth.uid()) );

-- Any signed-in admin can update UNLOCKED courses only — and cannot
-- use that update to lock/unlock or slip past the lock, because the
-- row must be unlocked both before AND after the write.
drop policy if exists "od_courses_update_admin_unlocked" on public.on_demand_courses;
create policy "od_courses_update_admin_unlocked"
  on public.on_demand_courses for update
  to authenticated
  using (
    is_locked = false
    and exists (select 1 from public.admins where user_id = auth.uid())
  )
  with check (
    is_locked = false
    and exists (select 1 from public.admins where user_id = auth.uid())
  );
