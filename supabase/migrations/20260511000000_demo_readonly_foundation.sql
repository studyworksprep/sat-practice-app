-- =========================================================
-- Demo accounts foundation: read-only lockdown at the DB layer
-- =========================================================
-- See docs/architecture-plan.md / demo-accounts plan for full
-- rationale. The short version:
--
--   * Two seeded accounts (a high-activity student, a manager
--     overseeing six students) browse the live product so the
--     marketing slideshow can screenshot real pages instead of
--     duplicating JSX.
--   * Read-only must be enforced where it actually matters:
--     the database. RLS denies INSERT/UPDATE/DELETE for any
--     session whose JWT carries `app_metadata.is_demo = true`,
--     so a network-tab attacker hitting the API directly fails
--     the same way the UI does.
--
-- This migration is the foundation: column, JWT plumbing, the
-- is_demo() helper, and a sweep that applies three restrictive
-- policies (insert / update / delete) to every existing public-
-- schema table with RLS enabled. The seed migrations that
-- create the demo users land later, after the lockdown is
-- verified in CI.
--
-- Note on restrictive policies. Postgres ANDs every restrictive
-- policy with the permissive policies on the same command. By
-- adding ONE restrictive policy per write command, we lock down
-- demo writes without touching the dozens of existing permissive
-- policies. SELECT is left alone, so the demo user can still
-- read everything the normal role-gated read policies would let
-- them see.
-- =========================================================

-- 1) Profile column ----------------------------------------

alter table public.profiles
  add column if not exists is_demo boolean not null default false;

comment on column public.profiles.is_demo is
  'When true, every write attempt by this user is denied at the database layer via the demo_readonly_* restrictive policies. Used by the marketing demo accounts (demo.student / demo.tutor) so the live product can be screenshotted and explored read-only without per-route guards. Synced to auth.users.raw_app_meta_data.is_demo by sync_role_to_auth_metadata().';

create index if not exists profiles_is_demo_idx
  on public.profiles(is_demo) where is_demo;

-- 2) JWT helper --------------------------------------------
-- Reads `app_metadata.is_demo` from the request JWT. STABLE so
-- the planner can fold it into RLS expressions without extra
-- evaluation per row. Returns false (not null) for sessions
-- that don't carry the field, so the restrictive policies
-- below compose cleanly.

create or replace function public.is_demo()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(auth.jwt() -> 'app_metadata' ->> 'is_demo', '')::boolean,
    false
  );
$$;

comment on function public.is_demo() is
  'True when the calling session''s JWT marks the user as a demo account. Used by the demo_readonly_* restrictive policies and by lib/api/auth.js''s requireWriter helper. Mirrors the pattern of public.is_admin() / public.is_teacher().';

-- 3) Sync trigger ------------------------------------------
-- Extend sync_role_to_auth_metadata() so is_demo lands in
-- auth.users.raw_app_meta_data alongside role + ui_version.
-- The trigger also widens its UPDATE OF clause to fire when
-- is_demo changes.

create or replace function public.sync_role_to_auth_metadata()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update auth.users
  set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
    || jsonb_build_object(
         'role',       new.role,
         'ui_version', new.ui_version,
         'is_demo',    new.is_demo
       )
  where id = new.id;
  return new;
end;
$$;

drop trigger if exists sync_role_trigger on public.profiles;
create trigger sync_role_trigger
  after insert or update of role, ui_version, is_demo on public.profiles
  for each row execute function public.sync_role_to_auth_metadata();

-- One-time backfill: every existing profile needs its is_demo
-- value (false for all current rows) written into auth metadata
-- so the JWT carries the field consistently.
update auth.users u
set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
  || jsonb_build_object('is_demo', p.is_demo)
from public.profiles p
where u.id = p.id;

-- 4) Restrictive write lockdown ----------------------------
-- For every public-schema base table that has RLS enabled,
-- add three restrictive policies that deny writes when the
-- caller's JWT carries is_demo=true. RLS is bypassed by
-- service-role clients, so seed migrations and the admin
-- back-channel still work; only end-user sessions are gated.
--
-- New tables added in future migrations MUST add the same
-- three policies (or the demo-readonly test in CI will fail).
-- The convention is documented in docs/database.md.

do $$
declare
  rec record;
begin
  for rec in
    select c.relname as tablename
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind = 'r'
      and c.relrowsecurity = true
  loop
    execute format($f$
      drop policy if exists demo_readonly_insert on public.%I;
      create policy demo_readonly_insert on public.%I
        as restrictive for insert
        to authenticated
        with check (not public.is_demo());

      drop policy if exists demo_readonly_update on public.%I;
      create policy demo_readonly_update on public.%I
        as restrictive for update
        to authenticated
        using      (not public.is_demo())
        with check (not public.is_demo());

      drop policy if exists demo_readonly_delete on public.%I;
      create policy demo_readonly_delete on public.%I
        as restrictive for delete
        to authenticated
        using (not public.is_demo());
    $f$,
      rec.tablename, rec.tablename,
      rec.tablename, rec.tablename,
      rec.tablename, rec.tablename
    );
  end loop;
end;
$$;
