-- ============================================================
-- MB2 Webinar Catalog — Supabase schema
-- Matches the fields used by src/App.jsx normalize() exactly
-- so the front-end keeps rendering with no code changes beyond
-- swapping the data loader.
--
-- Run this in your Supabase project: SQL Editor → New Query → paste → Run.
-- ============================================================

-- ---- 1. events table ---------------------------------------
create table if not exists public.events (
  id                           uuid primary key default gen_random_uuid(),
  -- Core
  title                        text          not null,
  description                  text,
  event_date                   timestamptz,                -- "Date of the Event"
  category                     text,
  ce_hours                     numeric(5,2),
  -- Presenter / branding
  vendor                       text,                       -- "Presenter / Vendor (Tag)"
  vendor_logo_url              text,
  thumb_url                    text,                       -- "Course Thumb"
  -- Format + targeting
  format                       text,                       -- "Online" | "In-Person" | ...
  cost                         text,                       -- "FREE", "$475", etc. — kept as text since sheet is messy
  roles                        text[]        default '{}', -- ["Doctor","Hygienist",...]
  -- Location / in-person
  location                     text,
  in_person_registration_url   text,
  -- Online sessions (up to 2)
  session1_label               text,                       -- "Time of the event"
  session1_url                 text,                       -- "Registration Link"
  session2_label               text,                       -- "2nd time of the Event"
  session2_url                 text,                       -- "Second Registration Link"
  -- Flags
  mb2_exclusive                boolean       not null default false,
  is_published                 boolean       not null default false,
  -- Audit
  created_at                   timestamptz   not null default now(),
  updated_at                   timestamptz   not null default now(),
  created_by                   uuid          references auth.users(id) on delete set null
);

create index if not exists events_event_date_idx     on public.events(event_date);
create index if not exists events_is_published_idx   on public.events(is_published);
create index if not exists events_mb2_exclusive_idx  on public.events(mb2_exclusive);

-- keep updated_at fresh
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists events_set_updated_at on public.events;
create trigger events_set_updated_at
before update on public.events
for each row execute function public.tg_set_updated_at();


-- ---- 2. admins table (who can write) -----------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text,
  created_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean language sql stable as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


-- ---- 3. Row Level Security ---------------------------------
alter table public.events enable row level security;
alter table public.admins enable row level security;

-- Anonymous + signed-in users can read PUBLISHED events
drop policy if exists "events_read_published" on public.events;
create policy "events_read_published"
  on public.events for select
  using ( is_published = true );

-- Admins can read everything (drafts + published)
drop policy if exists "events_read_admin" on public.events;
create policy "events_read_admin"
  on public.events for select
  to authenticated
  using ( public.is_admin() );

-- Admins can insert / update / delete
drop policy if exists "events_write_admin" on public.events;
create policy "events_write_admin"
  on public.events for all
  to authenticated
  using ( public.is_admin() )
  with check ( public.is_admin() );

-- Admins can see who else is an admin
drop policy if exists "admins_read" on public.admins;
create policy "admins_read"
  on public.admins for select
  to authenticated
  using ( public.is_admin() or user_id = auth.uid() );


-- ---- 4. Storage bucket for thumbnails + vendor logos -------
insert into storage.buckets (id, name, public)
values ('event-images', 'event-images', true)
on conflict (id) do nothing;

drop policy if exists "event_images_read" on storage.objects;
create policy "event_images_read"
  on storage.objects for select
  using ( bucket_id = 'event-images' );

drop policy if exists "event_images_write_admin" on storage.objects;
create policy "event_images_write_admin"
  on storage.objects for all
  to authenticated
  using ( bucket_id = 'event-images' and public.is_admin() )
  with check ( bucket_id = 'event-images' and public.is_admin() );


-- ---- 5. Seed your first admin ------------------------------
-- After you sign in once via the app's /admin page (magic link),
-- find your user_id in Supabase → Authentication → Users, then run:
--
--   insert into public.admins (user_id, email)
--   values ('PASTE-USER-UUID', 'you@dentlogics.com');
--
-- After that the app will let you in. From there you can add
-- teammates through the admin UI.
