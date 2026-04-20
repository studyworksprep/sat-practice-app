-- =========================================================
-- Parallel-build infrastructure: ui_version + feature_flags
-- =========================================================
-- See docs/architecture-plan.md §3.6 for the full rationale.
--
-- `profiles.ui_version` routes each user to either the legacy
-- route tree (`app/`) or the new tree under `app/(next)/`. The
-- default is 'legacy' so no production user ever reaches the
-- new tree until we deliberately flip them over.
--
-- `feature_flags.force_ui_version` is the kill switch. Setting
-- its value to 'legacy' pins every user back to the old tree
-- instantly, regardless of their profile flag. Setting it to
-- 'next' promotes every user to the new tree. NULL means the
-- per-user flag wins.
--
-- The middleware consults these in this order on every request:
--   1) feature_flags.force_ui_version  (cached 5 seconds server-side)
--   2) profiles.ui_version              (for this user)
--   3) 'legacy' fallback                (if both missing)
-- =========================================================

-- 1) Add ui_version to profiles
alter table public.profiles
  add column if not exists ui_version text not null default 'legacy'
    check (ui_version in ('legacy', 'next'));

comment on column public.profiles.ui_version is
  'Which UI tree this user sees. Middleware routes legacy users to app/* and next users to app/(next)/*. Default legacy so no user reaches the new tree without a deliberate flip. Removed in Phase 6.';

create index if not exists profiles_ui_version_idx
  on public.profiles(ui_version);

-- 2) Create the feature_flags kill-switch table
create table if not exists public.feature_flags (
  key         text primary key,
  value       text,
  description text,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references auth.users(id)
);

comment on table public.feature_flags is
  'Single-row-per-key flag table. Read by middleware and API routes. Wraps the parallel-build kill switch and any future runtime flags.';

-- Seed the force_ui_version row. Value is NULL by default: per-user
-- flag wins. Set to 'legacy' to force every user back to the old
-- tree during the parallel-build window; set to 'next' to force
-- everyone forward during the Phase 6 verification window.
insert into public.feature_flags (key, value, description)
values (
  'force_ui_version',
  null,
  'Kill switch for the parallel-build rollout. null = per-user profiles.ui_version wins; ''legacy'' = pin every user to the old tree; ''next'' = pin every user to the new tree. See docs/architecture-plan.md §3.6.'
)
on conflict (key) do nothing;

-- 3) RLS: the table is readable by any authenticated user (the
-- middleware runs as the caller) and writable only by admins.
alter table public.feature_flags enable row level security;

drop policy if exists ff_select on public.feature_flags;
create policy ff_select on public.feature_flags
  for select using (auth.uid() is not null);

drop policy if exists ff_write on public.feature_flags;
create policy ff_write on public.feature_flags
  for all using (public.is_admin()) with check (public.is_admin());

-- Keep updated_at fresh on writes.
create or replace function public.feature_flags_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists feature_flags_updated_at on public.feature_flags;
create trigger feature_flags_updated_at
  before update on public.feature_flags
  for each row execute function public.feature_flags_set_updated_at();

-- 4) Extend the sync_role_to_auth_metadata trigger so `ui_version`
-- is mirrored into `auth.users.raw_app_meta_data` alongside `role`.
-- This lets the middleware read `auth.jwt().app_metadata.ui_version`
-- with zero DB hops on every request, the same way it reads `role`.
--
-- See fix_profiles_rls_infinite_recursion.sql for the original
-- role-only version. This rewrite adds ui_version to the merge and
-- fires on role OR ui_version updates.
create or replace function public.sync_role_to_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object('role', new.role, 'ui_version', new.ui_version)
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_role_trigger on public.profiles;
create trigger sync_role_trigger
  after insert or update of role, ui_version on public.profiles
  for each row execute function public.sync_role_to_auth_metadata();

-- One-time backfill: every existing profile needs its ui_version
-- written into auth.users metadata so the JWT carries it on next
-- token refresh.
update auth.users u
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('ui_version', p.ui_version)
from public.profiles p
where u.id = p.id;
