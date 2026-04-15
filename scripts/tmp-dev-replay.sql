-- ============================================================
-- TEMPORARY ARTIFACT — DO NOT MERGE TO MAIN
-- Full replay. Regenerated after fixing create_learning_content.
-- ============================================================


-- ============================================================
-- supabase/migrations/20240101000000_create_practice_tests_schema.sql
-- ============================================================
-- =========================================================
-- Practice tests schema — backfilled from production
-- =========================================================
-- These seven tables exist in the live database but were
-- never committed as a migration. This file matches the
-- production schema as of April 2026, verified against a
-- direct dump shared by the maintainer. Any future changes
-- to these tables go through new migration files, not edits
-- to this one.
--
-- RLS note: the only practice_test_* table with RLS policies
-- in production is `practice_test_attempts`, which gets three
-- policies (`pta_insert_self`, `pta_select`, `pta_update_self`)
-- created by the pre-existing non-timestamped migrations:
--
--   - add_teacher_student_assignments.sql creates the initial
--     three policies (owner + teacher_can_view_student).
--   - fix_manager_practice_test_visibility.sql replaces
--     `pta_select` with the expanded three-branch version that
--     adds manager→teacher and manager→student visibility.
--
-- Both of those files sort alphabetically after this timestamped
-- file, so a fresh `supabase db reset` replays in the correct
-- order: create table first, then add policies. `ENABLE ROW
-- LEVEL SECURITY` is called here for every table so no table is
-- briefly wide-open between creation and policy attachment.
--
-- The other six practice_test_* tables (practice_tests,
-- practice_test_modules, practice_test_module_items,
-- practice_test_module_attempts, practice_test_item_attempts,
-- practice_test_routing_rules) have NO policies in production.
-- They rely on service-role access from the API via
-- createServiceClient(). Phase 2 of the rebuild will audit each
-- of these and decide whether to add least-privilege policies
-- or keep them as service-role-only intentionally.
--
-- This file uses the YYYYMMDDHHMMSS_*.sql Supabase CLI naming
-- convention so it sorts before existing migrations (e.g.
-- add_teacher_student_assignments.sql) that already expect
-- `practice_test_attempts` to exist.
-- =========================================================

-- 1) practice_tests
create table if not exists public.practice_tests (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  name              text not null,
  is_published      boolean not null default false,
  is_adaptive       boolean not null default true,
  is_frozen         boolean not null default true,
  adaptive_version  text,
  created_at        timestamptz not null default now()
);

alter table public.practice_tests enable row level security;

-- 2) practice_test_modules
-- Note: prod has no FK on practice_test_id; we match that. FK hardening
-- moves to Phase 3 along with the rest of the schema discipline work.
-- `route_code` is NOT NULL in prod even though the application uses
-- an empty string (or sentinel) for module 1 — the code in
-- submit-module/route.js infers module-1 rows by `module_number = 1`,
-- not by null route_code.
create table if not exists public.practice_test_modules (
  id                  uuid primary key default gen_random_uuid(),
  practice_test_id    uuid not null,
  subject_code        text not null,
  module_number       integer not null,
  route_code          text not null,
  time_limit_seconds  integer not null,
  created_at          timestamptz not null default now()
);

alter table public.practice_test_modules enable row level security;

-- 3) practice_test_module_items
create table if not exists public.practice_test_module_items (
  id                        uuid primary key default gen_random_uuid(),
  practice_test_module_id   uuid not null references public.practice_test_modules(id),
  question_version_id       uuid not null references public.question_versions(id),
  ordinal                   integer not null,
  created_at                timestamptz not null default now()
);

alter table public.practice_test_module_items enable row level security;

-- 4) practice_test_attempts
-- Prod has no FK constraints on this table's `user_id` or
-- `practice_test_id` columns. We match prod. Composite/section scaled
-- scores are persisted here after grading so the results page can
-- render without re-running the scoring pipeline.
create table if not exists public.practice_test_attempts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null,
  practice_test_id  uuid not null,
  adaptive_version  text,
  started_at        timestamptz not null default now(),
  finished_at       timestamptz,
  status            text not null default 'in_progress',
  metadata          jsonb not null default '{}'::jsonb,
  composite_score   integer,
  rw_scaled         integer,
  math_scaled       integer
);

alter table public.practice_test_attempts enable row level security;

-- 5) practice_test_module_attempts
create table if not exists public.practice_test_module_attempts (
  id                         uuid primary key default gen_random_uuid(),
  practice_test_attempt_id   uuid not null references public.practice_test_attempts(id),
  practice_test_module_id    uuid not null references public.practice_test_modules(id),
  started_at                 timestamptz not null default now(),
  finished_at                timestamptz,
  correct_count              integer,
  raw_score                  integer,
  metadata                   jsonb not null default '{}'::jsonb
);

alter table public.practice_test_module_attempts enable row level security;

-- 6) practice_test_item_attempts
-- Note: prod has `attempt_id uuid NOT NULL`, not the ON DELETE SET NULL
-- pattern I originally guessed. The DELETE handler in
-- app/api/practice-tests/attempt/[attemptId]/route.js reflects this:
-- it collects the attempt_ids first, deletes item_attempts, then
-- deletes the attempts rows — a two-step because there's no cascade.
create table if not exists public.practice_test_item_attempts (
  id                                 uuid primary key default gen_random_uuid(),
  practice_test_module_attempt_id    uuid not null references public.practice_test_module_attempts(id),
  practice_test_module_item_id       uuid not null references public.practice_test_module_items(id),
  attempt_id                         uuid not null references public.attempts(id)
);

alter table public.practice_test_item_attempts enable row level security;

-- 7) practice_test_routing_rules
create table if not exists public.practice_test_routing_rules (
  id                    uuid primary key default gen_random_uuid(),
  practice_test_id      uuid not null,
  subject_code          text not null,
  from_module_number    integer not null,
  metric                text not null,
  operator              text not null,
  threshold             integer not null,
  to_route_code         text not null,
  created_at            timestamptz not null default now()
);

alter table public.practice_test_routing_rules enable row level security;

-- Useful indexes. None of these come from the prod schema dump
-- (which lists only tables/columns/constraints, not indexes), so
-- these are speculative additions sized to the query patterns in
-- app/api/practice-tests/*. They are safe to add — indexes only
-- make reads faster and writes marginally slower — but check
-- `select * from pg_indexes where tablename like 'practice_test%'`
-- against prod and reconcile any differences when convenient.
create index if not exists practice_tests_published_idx
  on public.practice_tests(is_published);
create index if not exists ptm_test_idx
  on public.practice_test_modules(practice_test_id);
create index if not exists ptm_lookup_idx
  on public.practice_test_modules(practice_test_id, subject_code, module_number);
create index if not exists ptmi_module_idx
  on public.practice_test_module_items(practice_test_module_id);
create index if not exists ptmi_version_idx
  on public.practice_test_module_items(question_version_id);
create index if not exists pta_user_idx
  on public.practice_test_attempts(user_id);
create index if not exists pta_user_status_idx
  on public.practice_test_attempts(user_id, status);
create index if not exists pta_test_idx
  on public.practice_test_attempts(practice_test_id);
create index if not exists ptma_attempt_idx
  on public.practice_test_module_attempts(practice_test_attempt_id);
create index if not exists ptma_module_idx
  on public.practice_test_module_attempts(practice_test_module_id);
create index if not exists ptia_module_attempt_idx
  on public.practice_test_item_attempts(practice_test_module_attempt_id);
create index if not exists ptia_module_item_idx
  on public.practice_test_item_attempts(practice_test_module_item_id);
create index if not exists ptia_attempt_idx
  on public.practice_test_item_attempts(attempt_id);
create index if not exists ptrr_lookup_idx
  on public.practice_test_routing_rules(practice_test_id, subject_code, from_module_number);


-- ============================================================
-- supabase/migrations/20240101000001_create_get_question_neighbors_rpc.sql
-- ============================================================
-- =========================================================
-- get_question_neighbors RPC — backfilled from production
-- =========================================================
-- Previously-uncommitted function referenced by
-- app/api/questions/[questionId]/neighbors/route.js. This file
-- matches the production function body as dumped via
-- pg_get_functiondef() on April 2026.
--
-- Call signature (from the route):
--   supabase.rpc('get_question_neighbors', {
--     current_question_id: uuid,
--     p_user_id:           uuid,
--     p_program:           text      -- 'SAT'
--     p_difficulty:        int | null,
--     p_score_bands:       int[] | null,
--     p_domain_name:       text | null,
--     p_skill_name:        text | null,
--     p_marked_only:       boolean,
--   })
-- Returns:
--   (prev_id uuid, next_id uuid)
--
-- Semantics:
--   Given a current question and a filter set, return the
--   "previous" and "next" questions in the filtered list
--   ordered by `created_at`. Note that "prev" means the
--   question with a LATER created_at (newer), and "next"
--   means the question with an EARLIER created_at (older) —
--   the UI walks the list backwards through history.
--
-- References the v1 question tables (`questions`,
-- `question_taxonomy`, `question_status`). Phase 3 of the
-- rebuild migrates this to questions_v2 along with the rest
-- of the v1 teardown.
--
-- LANGUAGE sql STABLE (not SECURITY DEFINER) — runs as the
-- calling user, which matches production. Permission grants
-- are not dumped from pg_get_functiondef; if production has
-- specific grants beyond the Supabase defaults we can add
-- them in a follow-up migration.
-- =========================================================

create or replace function public.get_question_neighbors(
  current_question_id uuid,
  p_user_id           uuid,
  p_program           text default 'SAT'::text,
  p_difficulty        integer default null::integer,
  p_score_bands       integer[] default null::integer[],
  p_domain_name       text default null::text,
  p_skill_name        text default null::text,
  p_marked_only       boolean default false
)
returns table (prev_id uuid, next_id uuid)
language sql
stable
as $function$
with me as (
  select
    q.id,
    q.created_at
  from questions q
  where q.id = current_question_id
  limit 1
),
eligible as (
  select
    q.id,
    q.created_at
  from questions q
  join question_taxonomy qt on qt.question_id = q.id
  where (p_program is null or qt.program = p_program)
    and (p_difficulty is null or qt.difficulty = p_difficulty)
    and (p_score_bands is null or qt.score_band = any(p_score_bands))
    and (p_domain_name is null or qt.domain_name = p_domain_name)
    and (p_skill_name is null or qt.skill_name = p_skill_name)
    and (
      p_marked_only = false
      or exists (
        select 1
        from question_status qs
        where qs.question_id = q.id
          and qs.user_id = p_user_id
          and qs.marked_for_review = true
      )
    )
),
prev_row as (
  select e.id
  from eligible e
  join me on true
  where (e.created_at > me.created_at)
     or (e.created_at = me.created_at and e.id > me.id)
  order by e.created_at asc, e.id asc
  limit 1
),
next_row as (
  select e.id
  from eligible e
  join me on true
  where (e.created_at < me.created_at)
     or (e.created_at = me.created_at and e.id < me.id)
  order by e.created_at desc, e.id desc
  limit 1
)
select
  (select id from prev_row) as prev_id,
  (select id from next_row) as next_id;
$function$;


-- ============================================================
-- supabase/migrations/20240101000002_add_ui_version_and_feature_flags.sql
-- ============================================================
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


-- ============================================================
-- supabase/migrations/20240101000003_create_practice_sessions.sql
-- ============================================================
-- =========================================================
-- practice_sessions — server-side session state
-- =========================================================
-- See docs/architecture-plan.md §3.7.
--
-- Replaces the `practice_session_*` localStorage caches with
-- a server-owned table. Every active practice run is one row
-- here; the client holds nothing but an opaque session_id and
-- uses URLs of the form:
--
--   /practice/s/[sessionId]/[position]
--
-- The server maps (session_id, position) -> question_id on
-- every request, scoped to the authenticated user. Iterating
-- sequential session ids or positions reveals nothing; the
-- row is RLS-scoped to its owner.
--
-- This table is DORMANT in Phase 1. Nothing reads or writes
-- to it yet. The content-protection rollout in Phase 2 wires
-- up the practice page under app/(next)/ to use it.
-- =========================================================

create table if not exists public.practice_sessions (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,

  -- 'sat' | 'act'. Which test tree the session belongs to.
  test_type         text not null default 'sat' check (test_type in ('sat', 'act')),

  -- Ordered list of question ids this session will serve. Stored as
  -- jsonb because the length varies and we never need to query
  -- individual elements from SQL — the server reads the whole array,
  -- slices by position, and serves one question at a time.
  question_ids      jsonb not null default '[]'::jsonb,

  -- Which position the user is currently on (0-indexed).
  current_position  integer not null default 0,

  -- Draft answers keyed by question_id. `{ "<uuid>": { "selected_option_id": ..., "response_text": ... } }`
  -- Persisted per keystroke/selection so reload doesn't lose state.
  draft_answers     jsonb not null default '{}'::jsonb,

  -- How this session was created; drives the filters/criteria shown
  -- to the user. Copied from the URL query params at start time.
  filter_criteria   jsonb not null default '{}'::jsonb,

  -- The mode the session is running in. 'practice' = regular student
  -- flow; 'training' = tutor practicing as if a student; 'review' =
  -- read-only walk through previous attempts. Kept here so the
  -- practice page server component can branch without a separate
  -- query.
  mode              text not null default 'practice' check (mode in ('practice', 'training', 'review')),

  -- Timestamps and expiry. Sessions older than expires_at can be
  -- garbage-collected by a nightly job (written in Phase 2). Having
  -- an explicit expiry in the row avoids the unbounded-growth failure
  -- mode that bit localStorage.
  created_at        timestamptz not null default now(),
  last_activity_at  timestamptz not null default now(),
  expires_at        timestamptz not null default now() + interval '30 days'
);

create index if not exists practice_sessions_user_idx
  on public.practice_sessions(user_id);
create index if not exists practice_sessions_user_activity_idx
  on public.practice_sessions(user_id, last_activity_at desc);
create index if not exists practice_sessions_expires_idx
  on public.practice_sessions(expires_at);

alter table public.practice_sessions enable row level security;

-- Owner-only access. Teachers and managers do NOT see another
-- user's practice sessions — session rows are ephemeral working
-- state, not the graded artifact. The attempts table remains the
-- canonical record of what a student did, and its policies use
-- the teacher_can_view_student / can_view hierarchy.
drop policy if exists practice_sessions_select on public.practice_sessions;
create policy practice_sessions_select on public.practice_sessions
  for select using (user_id = auth.uid());

drop policy if exists practice_sessions_insert on public.practice_sessions;
create policy practice_sessions_insert on public.practice_sessions
  for insert with check (user_id = auth.uid());

drop policy if exists practice_sessions_update on public.practice_sessions;
create policy practice_sessions_update on public.practice_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists practice_sessions_delete on public.practice_sessions;
create policy practice_sessions_delete on public.practice_sessions
  for delete using (user_id = auth.uid() or public.is_admin());


-- ============================================================
-- supabase/migrations/20240101000004_create_can_view_function.sql
-- ============================================================
-- =========================================================
-- can_view(target) — unified visibility model
-- =========================================================
-- See docs/architecture-plan.md §3.8 for the full rationale.
--
-- The current RLS implementation re-derives "can this user
-- see this row" independently on every user-owned table.
-- `teacher_can_view_student()` is called from seven migration
-- files; manager visibility has needed three separate
-- `fix_manager_*_visibility.sql` patches to chase drift; the
-- cross-tier `manager -> teacher -> student` path is
-- implemented differently in each policy that needs it.
--
-- `can_view(target_user_id)` collapses the whole thing into
-- one function. Every supervisory relationship — self, admin,
-- tutor -> student, manager -> tutor, manager -> student via
-- tutor — lives here, and RLS policies across the app reduce
-- to `using (can_view(user_id))`.
--
-- IMPORTANT: this migration only DEFINES the function and a
-- companion `list_visible_users(role_filter)` helper. It does
-- NOT rewrite any existing RLS policy. The Phase 1 back-test
-- script (scripts/can_view_backtest.js) runs a read-only
-- comparison of `can_view` against the current helper stack
-- across every (viewer, target) pair in the dev snapshot.
-- Zero diffs is the precondition for Phase 2 to start
-- switching policies over.
-- =========================================================

create or replace function public.can_view(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    -- Self: a user can always see their own rows.
    auth.uid() = target

    -- Admin: sees everything.
    or public.is_admin()

    -- Direct tutor -> student assignment.
    or exists (
      select 1
      from public.teacher_student_assignments tsa
      where tsa.teacher_id = auth.uid()
        and tsa.student_id = target
    )

    -- Direct manager -> tutor assignment.
    or exists (
      select 1
      from public.manager_teacher_assignments mta
      where mta.manager_id = auth.uid()
        and mta.teacher_id = target
    )

    -- Transitive manager -> student (via a tutor the manager oversees).
    or exists (
      select 1
      from public.manager_teacher_assignments mta
      join public.teacher_student_assignments tsa using (teacher_id)
      where mta.manager_id = auth.uid()
        and tsa.student_id = target
    )

    -- Class-based legacy path. Kept for backward compatibility with
    -- the existing teacher_can_view_student() helper until Phase 6
    -- retires class-based enrollments entirely.
    or exists (
      select 1
      from public.class_enrollments ce
      join public.classes c on c.id = ce.class_id
      where ce.student_id = target
        and c.teacher_id = auth.uid()
    );
$$;

comment on function public.can_view(uuid) is
  'Unified visibility check: returns true if the calling user can see rows owned by `target`. Replaces the seven-place re-derivation of teacher -> student / manager -> tutor / manager -> student visibility. See docs/architecture-plan.md §3.8.';

revoke all on function public.can_view(uuid) from public;
revoke all on function public.can_view(uuid) from anon;
grant execute on function public.can_view(uuid) to authenticated;

-- =========================================================
-- list_visible_users(role_filter) — companion helper
-- =========================================================
-- Returns every user id the caller can see, optionally
-- filtered to a single role. Drives the "my students" /
-- "my tutors" / "my teachers" list pages so they can fetch
-- the set once without re-deriving the hierarchy.
--
-- Passing NULL or the empty string returns every visible
-- user regardless of role.
-- =========================================================

create or replace function public.list_visible_users(role_filter text default null)
returns table (user_id uuid, role text)
language sql
stable
security definer
set search_path = public
as $$
  -- Union every path by which the caller could see another user,
  -- then filter by role. DISTINCT at the end dedupes when a user
  -- is visible via more than one path.
  with visible as (
    -- Self
    select id as user_id from public.profiles where id = auth.uid()

    union

    -- Admin sees everyone
    select id as user_id from public.profiles
    where public.is_admin()

    union

    -- Direct students
    select tsa.student_id as user_id
    from public.teacher_student_assignments tsa
    where tsa.teacher_id = auth.uid()

    union

    -- Direct tutors
    select mta.teacher_id as user_id
    from public.manager_teacher_assignments mta
    where mta.manager_id = auth.uid()

    union

    -- Students of managed tutors
    select tsa.student_id as user_id
    from public.manager_teacher_assignments mta
    join public.teacher_student_assignments tsa using (teacher_id)
    where mta.manager_id = auth.uid()

    union

    -- Class-based legacy path
    select ce.student_id as user_id
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where c.teacher_id = auth.uid()
  )
  select distinct p.id as user_id, p.role
  from visible v
  join public.profiles p on p.id = v.user_id
  where role_filter is null
     or role_filter = ''
     or p.role = role_filter;
$$;

comment on function public.list_visible_users(text) is
  'Returns every user id the caller can see, optionally filtered by role. Companion to can_view() for listing UIs. See docs/architecture-plan.md §3.8.';

revoke all on function public.list_visible_users(text) from public;
revoke all on function public.list_visible_users(text) from anon;
grant execute on function public.list_visible_users(text) to authenticated;


-- ============================================================
-- supabase/migrations/20240101000005_create_get_visible_students_with_stats.sql
-- ============================================================
-- =========================================================
-- get_visible_students_with_stats — hierarchy-aware RPC for
-- the tutor dashboard
-- =========================================================
-- Backstory: the tutor dashboard page at
-- app/next/(tutor)/tutor/dashboard/page.js was built to call
-- list_visible_users('student') to get the visible student set,
-- then do a second profiles query with `.in('id', studentIds)` to
-- get display details. That pattern worked for tutors (who get
-- students via teacher_can_view_student()) but broke for managers
-- looking at their tutors' students via the transitive
-- manager → tutor → student chain: list_visible_users correctly
-- returned those student ids, but the subsequent profiles query
-- was filtered by the `profiles` table RLS, which only allows the
-- direct teacher_can_view_student() path — the transitive manager
-- visibility wasn't wired into profiles RLS. Result: the
-- transitive students silently disappeared from the dashboard.
--
-- The proper long-term fix is to rewrite the profiles SELECT
-- policy to use can_view() from §3.8 instead of the narrower
-- teacher_can_view_student() helper. That work is part of
-- Phase 2 step 9 ("Fix the RLS drift using can_view()") and
-- touches policies across many tables, not just profiles.
-- Doing it as a one-off patch carries too much blast risk.
--
-- This RPC is a targeted workaround that avoids profiles RLS
-- entirely by doing the profile join and attempts aggregation
-- inside a SECURITY DEFINER function. The function owner
-- (postgres / supabase_admin) can see every row, and the
-- function's visibility clauses re-implement the exact same
-- union from list_visible_users() to enforce access control.
--
-- Phase 2 step 9 eventually makes this RPC redundant. When
-- profiles RLS uses can_view(user_id), the tutor dashboard can
-- go back to the simpler three-query pattern, and this RPC can
-- be dropped in Phase 6 decommission.
--
-- Returns one row per visible student with the aggregate stats
-- the dashboard needs. Ordered by last_activity_at descending,
-- students with no activity last.

create or replace function public.get_visible_students_with_stats()
returns table (
  user_id            uuid,
  email              text,
  first_name         text,
  last_name          text,
  target_sat_score   integer,
  high_school        text,
  graduation_year    integer,
  total_attempts     bigint,
  correct_attempts   bigint,
  week_attempts      bigint,
  last_activity_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_ids as (
    -- Self
    select id as uid from public.profiles where id = auth.uid()

    union

    -- Admin sees everyone
    select id as uid from public.profiles where public.is_admin()

    union

    -- Direct tutor → student
    select tsa.student_id
    from public.teacher_student_assignments tsa
    where tsa.teacher_id = auth.uid()

    union

    -- Transitive manager → tutor → student. THIS IS THE BRANCH
    -- that the original page's profiles-table query was silently
    -- dropping — the whole point of this RPC.
    select tsa.student_id
    from public.manager_teacher_assignments mta
    join public.teacher_student_assignments tsa using (teacher_id)
    where mta.manager_id = auth.uid()

    union

    -- Class-based legacy path
    select ce.student_id
    from public.class_enrollments ce
    join public.classes c on c.id = ce.class_id
    where c.teacher_id = auth.uid()
  ),
  attempts_agg as (
    select
      a.user_id,
      count(*) filter (where a.source = 'practice')                                    as total_attempts,
      count(*) filter (where a.source = 'practice' and a.is_correct)                   as correct_attempts,
      count(*) filter (where a.source = 'practice' and a.created_at >= now() - interval '7 days') as week_attempts,
      max(a.created_at) filter (where a.source = 'practice')                           as last_activity_at
    from public.attempts a
    where a.user_id in (select uid from visible_ids)
    group by a.user_id
  )
  select
    p.id                                                 as user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.target_sat_score,
    p.high_school,
    p.graduation_year,
    coalesce(agg.total_attempts, 0)                       as total_attempts,
    coalesce(agg.correct_attempts, 0)                     as correct_attempts,
    coalesce(agg.week_attempts, 0)                        as week_attempts,
    agg.last_activity_at
  from visible_ids v
  join public.profiles p on p.id = v.uid
  left join attempts_agg agg on agg.user_id = p.id
  where p.role = 'student'
  order by agg.last_activity_at desc nulls last;
$$;

comment on function public.get_visible_students_with_stats() is
  'Returns every student the caller can see (via the §3.8 unified hierarchy rules) plus basic practice stats. SECURITY DEFINER so it bypasses the narrower profiles RLS that only covers direct teacher_can_view_student() paths. Phase 2 step 9 rewrites profiles RLS to use can_view(), at which point this RPC becomes redundant and gets dropped in Phase 6. See docs/architecture-plan.md §3.8.';

revoke all on function public.get_visible_students_with_stats() from public;
revoke all on function public.get_visible_students_with_stats() from anon;
grant execute on function public.get_visible_students_with_stats() to authenticated;


-- ============================================================
-- supabase/migrations/20240101000006_update_get_visible_students_with_stats_to_delegate.sql
-- ============================================================
-- =========================================================
-- Update get_visible_students_with_stats to delegate to
-- list_visible_users() instead of inlining the visibility
-- clauses
-- =========================================================
-- Backstory: 20240101000005_create_get_visible_students_with_stats.sql
-- created this function as a targeted workaround for the narrow
-- profiles-table RLS (which doesn't cover the manager → tutor →
-- student transitive path). The original body re-implemented the
-- visibility union clauses inline — which worked but violated
-- §3.8's "one canonical place for hierarchy logic" principle:
-- we ended up with the visibility logic in three places
-- (can_view(), list_visible_users(), and this function).
--
-- This migration updates the function body to call
-- list_visible_users('student') instead of inlining the union.
-- The function is still SECURITY DEFINER — it still bypasses
-- profiles RLS, which is the point of the workaround — but now
-- the visibility logic lives in exactly one place. Any future
-- update to can_view() or list_visible_users() automatically
-- propagates here with no maintenance.
--
-- The eventual Phase 2 step 9 work (rewriting profiles RLS to
-- use can_view() directly) still makes this whole function
-- redundant; this migration just keeps us honest while we wait
-- for that work.
--
-- Only the function body changes. The signature, return shape,
-- security-definer-ness, search_path, and grants are all
-- identical to 20240101000005. No caller changes required —
-- app/next/(tutor)/tutor/dashboard/page.js continues to call
-- the same RPC with the same arguments.
-- =========================================================

create or replace function public.get_visible_students_with_stats()
returns table (
  user_id            uuid,
  email              text,
  first_name         text,
  last_name          text,
  target_sat_score   integer,
  high_school        text,
  graduation_year    integer,
  total_attempts     bigint,
  correct_attempts   bigint,
  week_attempts      bigint,
  last_activity_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with visible_ids as (
    -- Delegate to the §3.8 canonical hierarchy helper. This is
    -- the ONLY place the tutor dashboard page touches the
    -- visibility clauses, so any future update to can_view()
    -- or list_visible_users() propagates here automatically.
    -- list_visible_users already filters by role='student' when
    -- called with the 'student' arg, so no further role filter
    -- is needed below.
    select user_id
    from public.list_visible_users('student')
  ),
  attempts_agg as (
    select
      a.user_id,
      count(*) filter (where a.source = 'practice')                                    as total_attempts,
      count(*) filter (where a.source = 'practice' and a.is_correct)                   as correct_attempts,
      count(*) filter (where a.source = 'practice' and a.created_at >= now() - interval '7 days') as week_attempts,
      max(a.created_at) filter (where a.source = 'practice')                           as last_activity_at
    from public.attempts a
    where a.user_id in (select user_id from visible_ids)
    group by a.user_id
  )
  select
    p.id                                                 as user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.target_sat_score,
    p.high_school,
    p.graduation_year,
    coalesce(agg.total_attempts, 0)                       as total_attempts,
    coalesce(agg.correct_attempts, 0)                     as correct_attempts,
    coalesce(agg.week_attempts, 0)                        as week_attempts,
    agg.last_activity_at
  from visible_ids v
  join public.profiles p on p.id = v.user_id
  left join attempts_agg agg on agg.user_id = p.id
  order by agg.last_activity_at desc nulls last;
$$;

-- Grants unchanged from 20240101000005 (authenticated only).
-- Re-applying them here is idempotent and makes this file
-- self-sufficient for a fresh `supabase db reset`.
revoke all on function public.get_visible_students_with_stats() from public;
revoke all on function public.get_visible_students_with_stats() from anon;
grant execute on function public.get_visible_students_with_stats() to authenticated;


-- ============================================================
-- supabase/migrations/20240101000007_create_get_visible_student_by_id.sql
-- ============================================================
-- =========================================================
-- get_visible_student_by_id — one-student detail for the
-- tutor/manager student detail page
-- =========================================================
-- Companion to 20240101000006_update_get_visible_students_with_stats_to_delegate.
-- That function returns every visible student as a list; this one
-- returns a single student by id, gated on can_view(target) so the
-- caller can't look up a student they aren't allowed to see.
--
-- Used by app/next/(tutor)/tutor/students/[studentId]/page.js to
-- render the student detail view. Follows the same §3.8-respecting
-- delegation pattern as the list RPC: the visibility logic lives
-- in can_view(), not inlined here.
--
-- SECURITY DEFINER because the profiles-table RLS on this database
-- doesn't yet cover the transitive manager → tutor → student path.
-- Phase 2 step 9 rewrites profiles RLS to use can_view() directly,
-- at which point this RPC becomes redundant and gets dropped in
-- Phase 6 (same fate as get_visible_students_with_stats).

create or replace function public.get_visible_student_by_id(target_id uuid)
returns table (
  user_id           uuid,
  email             text,
  first_name        text,
  last_name         text,
  target_sat_score  integer,
  high_school       text,
  graduation_year   integer,
  sat_test_date     timestamptz,
  total_attempts    bigint,
  correct_attempts  bigint,
  week_attempts     bigint,
  last_activity_at  timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  -- Delegate visibility to the canonical §3.8 helper. Returns an
  -- empty set if the caller can't see this student, which the
  -- page translates to notFound().
  with permitted as (
    select target_id as uid
    where public.can_view(target_id)
  ),
  attempts_agg as (
    select
      count(*) filter (where a.source = 'practice')                                    as total_attempts,
      count(*) filter (where a.source = 'practice' and a.is_correct)                   as correct_attempts,
      count(*) filter (where a.source = 'practice' and a.created_at >= now() - interval '7 days') as week_attempts,
      max(a.created_at) filter (where a.source = 'practice')                           as last_activity_at
    from public.attempts a
    where a.user_id = target_id
  )
  select
    p.id                                                 as user_id,
    p.email,
    p.first_name,
    p.last_name,
    p.target_sat_score,
    p.high_school,
    p.graduation_year,
    p.sat_test_date,
    coalesce(agg.total_attempts, 0),
    coalesce(agg.correct_attempts, 0),
    coalesce(agg.week_attempts, 0),
    agg.last_activity_at
  from permitted v
  join public.profiles p on p.id = v.uid
  cross join attempts_agg agg;
$$;

comment on function public.get_visible_student_by_id(uuid) is
  'Returns a single student''s profile + practice stats if the caller can see them per can_view() from §3.8. SECURITY DEFINER so it bypasses the narrow profiles RLS. Becomes redundant when Phase 2 step 9 rewrites profiles RLS to use can_view() directly.';

revoke all on function public.get_visible_student_by_id(uuid) from public;
revoke all on function public.get_visible_student_by_id(uuid) from anon;
grant execute on function public.get_visible_student_by_id(uuid) to authenticated;


-- ============================================================
-- supabase/migrations/20240101000008_create_get_practice_volume_by_week.sql
-- ============================================================
-- =========================================================
-- get_practice_volume_by_week — 8-week activity aggregate
-- for the admin landing page
-- =========================================================
-- Returns one row per ISO week covering the last N weeks
-- (default 8). Each row has the total practice attempts and
-- total practice-test attempts in that week. Used by the
-- admin landing page to render the Practice Volume chart —
-- the same chart the legacy AdminDashboard had, but without
-- the db-max-rows silent-truncation bug that bit the legacy
-- /api/admin/platform-stats route.
--
-- Why this is an RPC rather than a plain query:
--   - The bucketing (date_trunc to week) is easier in SQL
--     than in JS, especially when we want empty weeks to
--     appear as zero rather than being missing from the
--     result entirely.
--   - The function can do the aggregation server-side in
--     one pass, returning ~8 rows instead of 8*N attempts
--     rows that would have to be aggregated client-side.
--   - SECURITY DEFINER so it can read across all users'
--     attempts without going through per-row RLS.
--
-- The function generates a calendar series with generate_series
-- so that weeks with zero activity still appear in the result,
-- ordered chronologically. Without this, the chart would silently
-- drop blank weeks and the x-axis would jump, hiding gaps.

create or replace function public.get_practice_volume_by_week(weeks integer default 8)
returns table (
  week_start     timestamptz,
  practice_count bigint,
  test_count     bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with week_series as (
    -- Generate exactly `weeks` consecutive weeks ending with the
    -- current week. date_trunc('week', ...) returns Monday UTC.
    select generate_series(
      date_trunc('week', now()) - make_interval(weeks => weeks - 1),
      date_trunc('week', now()),
      '1 week'::interval
    ) as wk
  ),
  practice_agg as (
    select
      date_trunc('week', created_at) as wk,
      count(*)::bigint as n
    from public.attempts
    where source = 'practice'
      and created_at >= date_trunc('week', now()) - make_interval(weeks => weeks - 1)
    group by 1
  ),
  test_agg as (
    select
      date_trunc('week', started_at) as wk,
      count(*)::bigint as n
    from public.practice_test_attempts
    where status = 'completed'
      and started_at >= date_trunc('week', now()) - make_interval(weeks => weeks - 1)
    group by 1
  )
  select
    ws.wk                                    as week_start,
    coalesce(pa.n, 0)                        as practice_count,
    coalesce(ta.n, 0)                        as test_count
  from week_series ws
  left join practice_agg pa on pa.wk = ws.wk
  left join test_agg ta on ta.wk = ws.wk
  order by ws.wk asc;
$$;

comment on function public.get_practice_volume_by_week(integer) is
  'Returns one row per ISO week for the last N weeks with practice-attempt and practice-test counts. Empty weeks appear as zero. Used by the admin landing page Practice Volume chart. Security-definer so it aggregates across all users.';

revoke all on function public.get_practice_volume_by_week(integer) from public;
revoke all on function public.get_practice_volume_by_week(integer) from anon;
grant execute on function public.get_practice_volume_by_week(integer) to authenticated;


-- ============================================================
-- supabase/migrations/20240101000009_create_get_visible_student_attempts.sql
-- ============================================================
-- =========================================================
-- get_visible_student_attempts — recent attempts for a single
-- student, gated on can_view()
-- =========================================================
-- Companion to get_visible_student_by_id (migration
-- 20240101000007). That function returns the student's
-- profile and aggregate stats; this one returns their recent
-- individual attempt rows.
--
-- Why this exists: the tutor student detail page originally
-- read attempts via a plain supabase.from('attempts').select()
-- query, under the assumption that the attempts table's SELECT
-- policy already included the manager → tutor → student
-- transitive path (from the pre-existing
-- fix_manager_practice_test_visibility.sql migration). It
-- turns out that policy either wasn't fully applied in
-- production or was later modified, so plain RLS queries
-- silently return zero rows for transitive students — the
-- direct-student path works fine but a manager viewing their
-- assigned tutor's student gets an empty attempts list even
-- though the stats (via the security-definer RPC) show
-- activity.
--
-- Fix: this RPC. SECURITY DEFINER bypasses the attempts RLS
-- entirely. Visibility is enforced by delegating to can_view()
-- — the §3.8 canonical hierarchy helper. One place for the
-- rules, no drift.
--
-- Phase 2 step 9 eventually makes this RPC redundant by
-- rewriting the attempts RLS policy to use can_view(user_id)
-- directly. At that point the detail page can go back to a
-- plain supabase.from('attempts').select() query and this
-- function gets dropped in Phase 6.

create or replace function public.get_visible_student_attempts(
  target_id uuid,
  p_limit integer default 50
)
returns table (
  id                 uuid,
  question_id        uuid,
  is_correct         boolean,
  selected_option_id uuid,
  response_text      text,
  time_spent_ms      integer,
  source             text,
  created_at         timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.question_id,
    a.is_correct,
    a.selected_option_id,
    a.response_text,
    a.time_spent_ms,
    a.source,
    a.created_at
  from public.attempts a
  where a.user_id = target_id
    and public.can_view(target_id)
  order by a.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 500));
$$;

comment on function public.get_visible_student_attempts(uuid, integer) is
  'Returns recent attempts for a single student if the caller can_view() them. SECURITY DEFINER because the attempts RLS policy does not cover the transitive manager → tutor → student path in this database (a gap Phase 2 step 9 fixes by rewriting the policy to use can_view). Used by /tutor/students/[id].';

revoke all on function public.get_visible_student_attempts(uuid, integer) from public;
revoke all on function public.get_visible_student_attempts(uuid, integer) from anon;
grant execute on function public.get_visible_student_attempts(uuid, integer) to authenticated;


-- ============================================================
-- supabase/migrations/add_act_questions_code_columns.sql
-- ============================================================
-- Add category_code and subcategory_code to act_questions
alter table act_questions add column if not exists category_code text;
alter table act_questions add column if not exists subcategory_code text;

-- Replace the name-based category index with code-based ones
drop index if exists idx_act_questions_category;
create index idx_act_questions_category on act_questions (section, category_code);
create index idx_act_questions_subcategory on act_questions (section, category_code, subcategory_code);


-- ============================================================
-- supabase/migrations/add_broken_audit_fields.sql
-- ============================================================
-- Add audit columns for tracking who flagged a question as broken and when.
alter table questions
  add column if not exists broken_by uuid references auth.users(id),
  add column if not exists broken_at timestamptz;

-- Update the RPC to record the caller and timestamp when flagging broken.
create or replace function set_question_broken(question_uuid uuid, broken boolean)
returns void
language plpgsql
security definer
as $$
declare
  caller_role text;
begin
  select coalesce(p.role, 'practice')
    into caller_role
    from profiles p
   where p.id = auth.uid();

  if caller_role = 'practice' then
    raise exception 'Practice accounts cannot flag questions as broken';
  end if;

  update questions
     set is_broken  = broken,
         broken_by  = case when broken then auth.uid() else null end,
         broken_at  = case when broken then now()      else null end
   where id = question_uuid;
end;
$$;


-- ============================================================
-- supabase/migrations/add_completed_at_to_question_assignments.sql
-- ============================================================
-- Allow teachers to mark assignments as complete
alter table public.question_assignments
  add column if not exists completed_at timestamptz;


-- ============================================================
-- supabase/migrations/add_domain_scores_to_official_scores.sql
-- ============================================================
-- Add domain score band columns to sat_official_scores
-- These store the 1-7 score band for each of the 8 SAT domains (4 R&W + 4 Math)
-- as reported on official score reports.

-- Reading & Writing domains
alter table sat_official_scores add column if not exists domain_ini integer check (domain_ini between 1 and 7);  -- Information and Ideas
alter table sat_official_scores add column if not exists domain_cas integer check (domain_cas between 1 and 7);  -- Craft and Structure
alter table sat_official_scores add column if not exists domain_eoi integer check (domain_eoi between 1 and 7);  -- Expression of Ideas
alter table sat_official_scores add column if not exists domain_sec integer check (domain_sec between 1 and 7);  -- Standard English Conventions

-- Math domains
alter table sat_official_scores add column if not exists domain_alg integer check (domain_alg between 1 and 7);  -- Algebra
alter table sat_official_scores add column if not exists domain_atm integer check (domain_atm between 1 and 7);  -- Advanced Math
alter table sat_official_scores add column if not exists domain_pam integer check (domain_pam between 1 and 7);  -- Problem-Solving and Data Analysis
alter table sat_official_scores add column if not exists domain_geo integer check (domain_geo between 1 and 7);  -- Geometry and Trigonometry


-- ============================================================
-- supabase/migrations/add_exempt_flag_to_teacher_codes.sql
-- ============================================================
-- Add exempt flag to teacher_codes to distinguish Studyworks codes
-- from external teacher codes. Only exempt codes grant free access.
ALTER TABLE public.teacher_codes
  ADD COLUMN IF NOT EXISTS exempt boolean NOT NULL DEFAULT false;

-- Mark all existing teacher codes as exempt (they're all Studyworks codes)
UPDATE public.teacher_codes SET exempt = true WHERE exempt = false;


-- ============================================================
-- supabase/migrations/add_flashcard_subsets.sql
-- ============================================================
-- Add parent_set_id to support sub-sets (e.g., "Common SAT Words" → 10 vocab sub-sets)
alter table public.flashcard_sets
  add column if not exists parent_set_id uuid references public.flashcard_sets(id) on delete cascade;

create index if not exists fs_parent_idx on public.flashcard_sets(parent_set_id);


-- ============================================================
-- supabase/migrations/add_highlight_ref_to_act_questions.sql
-- ============================================================
-- Add highlight_ref column to act_questions for English passage questions.
-- Stores the question reference number (e.g. the underline number) to highlight
-- in the shared stimulus_html passage when this question is displayed.
alter table act_questions add column if not exists highlight_ref integer;


-- ============================================================
-- supabase/migrations/add_is_active_to_profiles.sql
-- ============================================================
-- Add is_active flag to profiles (defaults to true)
-- Inactive students still have access but are hidden from the teacher panel.

alter table public.profiles
  add column if not exists is_active boolean not null default true;


-- ============================================================
-- supabase/migrations/add_is_broken_to_question_status.sql
-- ============================================================
-- Add is_broken flag to question_status
-- Run this in the Supabase SQL editor or via the Supabase CLI.
alter table question_status
  add column if not exists is_broken boolean not null default false;


-- ============================================================
-- supabase/migrations/add_manager_role.sql
-- ============================================================
-- Add 'manager' to the profiles role check constraint
-- Manager has Teacher permissions + access to the Teachers tab

-- The constraint may be named profiles_role_check or use the ANY(ARRAY[...]) syntax.
-- Drop whichever exists, then recreate.
DO $$
BEGIN
  -- Try dropping named constraint first
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check;
  EXCEPTION WHEN undefined_object THEN
    NULL; -- constraint doesn't exist by this name
  END;

  -- Try dropping the auto-generated check constraint name
  BEGIN
    ALTER TABLE public.profiles DROP CONSTRAINT profiles_role_check1;
  EXCEPTION WHEN undefined_object THEN
    NULL;
  END;
END$$;

-- Drop any remaining check constraints on role column and recreate
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check
  CHECK (role = ANY (ARRAY['practice'::text, 'student'::text, 'teacher'::text, 'manager'::text, 'admin'::text]));

-- Update the is_teacher() helper function to include manager
CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
  );
$$;


-- ============================================================
-- supabase/migrations/add_performance_optimizations.sql
-- ============================================================
-- 1. Question availability summary table
-- Precomputed counts of available questions by domain, skill, and difficulty.
-- This is static data that only changes when questions are added/removed.
-- Replaces full question_taxonomy table scans in teacher student dashboard.
CREATE TABLE IF NOT EXISTS public.question_availability (
  domain_name text NOT NULL,
  skill_name text NOT NULL,
  difficulty integer NOT NULL DEFAULT 0,
  question_count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (domain_name, skill_name, difficulty)
);

-- Populate from question_taxonomy
INSERT INTO public.question_availability (domain_name, skill_name, difficulty, question_count)
SELECT
  COALESCE(domain_name, 'Unknown') AS domain_name,
  COALESCE(skill_name, 'Unknown') AS skill_name,
  COALESCE(difficulty, 0) AS difficulty,
  COUNT(DISTINCT question_id) AS question_count
FROM public.question_taxonomy
GROUP BY COALESCE(domain_name, 'Unknown'), COALESCE(skill_name, 'Unknown'), COALESCE(difficulty, 0)
ON CONFLICT (domain_name, skill_name, difficulty) DO UPDATE
  SET question_count = EXCLUDED.question_count;

-- Also store a total row per domain+skill (difficulty=0 means "all")
INSERT INTO public.question_availability (domain_name, skill_name, difficulty, question_count)
SELECT
  COALESCE(domain_name, 'Unknown') AS domain_name,
  COALESCE(skill_name, 'Unknown') AS skill_name,
  0 AS difficulty,
  COUNT(DISTINCT question_id) AS question_count
FROM public.question_taxonomy
WHERE difficulty IS NOT NULL AND difficulty > 0
GROUP BY COALESCE(domain_name, 'Unknown'), COALESCE(skill_name, 'Unknown')
ON CONFLICT (domain_name, skill_name, difficulty) DO UPDATE
  SET question_count = EXCLUDED.question_count;

-- RLS: allow all authenticated users to read
ALTER TABLE public.question_availability ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read question_availability"
  ON public.question_availability FOR SELECT
  TO authenticated
  USING (true);

-- 2. Cache computed scores on practice_test_attempts
-- Store composite and section scores when a test is completed,
-- so dashboard routes don't need to recompute from module data + score_conversion.
ALTER TABLE public.practice_test_attempts
  ADD COLUMN IF NOT EXISTS composite_score integer,
  ADD COLUMN IF NOT EXISTS rw_scaled integer,
  ADD COLUMN IF NOT EXISTS math_scaled integer;


-- ============================================================
-- supabase/migrations/add_question_version_accuracy_counters.sql
-- ============================================================
-- Add attempt tracking columns to question_versions
-- so per-question accuracy can be read without aggregating attempts.

alter table public.question_versions
  add column if not exists attempt_count  integer not null default 0,
  add column if not exists correct_count  integer not null default 0;

-- Atomic RPC to bump counters after a student submits an answer.
-- Accepts an array of version_id / is_correct pairs for bulk use.
create or replace function public.increment_version_accuracy(
  entries jsonb  -- array of { "version_id": uuid, "is_correct": bool }
) returns void language plpgsql security definer as $$
begin
  update public.question_versions qv
  set
    attempt_count = qv.attempt_count + 1,
    correct_count = qv.correct_count + (case when (e.val->>'is_correct')::boolean then 1 else 0 end)
  from jsonb_array_elements(entries) as e(val)
  where qv.id = (e.val->>'version_id')::uuid;
end;
$$;


-- ============================================================
-- supabase/migrations/add_rationale_html_to_question_versions.sql
-- ============================================================
-- Add rationale_html to question_versions for per-question explanations
-- Run in the Supabase SQL editor or via the Supabase CLI.
alter table question_versions
  add column if not exists rationale_html text;


-- ============================================================
-- supabase/migrations/add_sat_test_date.sql
-- ============================================================
-- Add sat_test_date column to profiles for upcoming registered SAT date
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS sat_test_date timestamptz;


-- ============================================================
-- supabase/migrations/add_set_question_broken_rpc.sql
-- ============================================================
-- RPC function to set is_broken on a question, bypassing RLS.
-- Only non-practice authenticated users may call this.
create or replace function set_question_broken(question_uuid uuid, broken boolean)
returns void
language plpgsql
security definer
as $$
declare
  caller_role text;
begin
  -- Look up the caller's role
  select coalesce(p.role, 'practice')
    into caller_role
    from profiles p
   where p.id = auth.uid();

  if caller_role = 'practice' then
    raise exception 'Practice accounts cannot flag questions as broken';
  end if;

  update questions
     set is_broken = broken
   where id = question_uuid;
end;
$$;


-- ============================================================
-- supabase/migrations/add_signup_profile_fields.sql
-- ============================================================
-- =========================================================
-- Extended signup fields on profiles + teacher registration codes
-- =========================================================

-- 1) Add new columns to profiles
alter table public.profiles
  add column if not exists first_name text,
  add column if not exists last_name text,
  add column if not exists user_type text check (user_type in ('student','teacher','exploring')),
  add column if not exists high_school text,
  add column if not exists graduation_year int,
  add column if not exists target_sat_score int,
  add column if not exists tutor_name text;

-- 2) Teacher registration codes (one-time use)
create table if not exists public.teacher_codes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  used_by uuid references public.profiles(id),
  used_at timestamptz,
  created_at timestamptz default now()
);

alter table public.teacher_codes enable row level security;

-- Only admins can manage teacher codes
create policy teacher_codes_admin_all on public.teacher_codes
  for all using (public.is_admin());

-- 3) Update handle_new_user to pull metadata from auth signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  v_meta jsonb;
  v_user_type text;
  v_role text;
begin
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_user_type := v_meta->>'user_type';

  -- Map user_type to role
  case v_user_type
    when 'student' then v_role := 'student';
    when 'teacher' then v_role := 'teacher';
    else v_role := 'practice';
  end case;

  insert into public.profiles (
    id, email, role, first_name, last_name, user_type,
    high_school, graduation_year, target_sat_score, tutor_name
  )
  values (
    new.id,
    new.email,
    v_role,
    v_meta->>'first_name',
    v_meta->>'last_name',
    v_user_type,
    v_meta->>'high_school',
    (v_meta->>'graduation_year')::int,
    (v_meta->>'target_sat_score')::int,
    v_meta->>'tutor_name'
  )
  on conflict (id) do update set
    email = excluded.email,
    role = coalesce(excluded.role, profiles.role),
    first_name = coalesce(excluded.first_name, profiles.first_name),
    last_name = coalesce(excluded.last_name, profiles.last_name),
    user_type = coalesce(excluded.user_type, profiles.user_type),
    high_school = coalesce(excluded.high_school, profiles.high_school),
    graduation_year = coalesce(excluded.graduation_year, profiles.graduation_year),
    target_sat_score = coalesce(excluded.target_sat_score, profiles.target_sat_score),
    tutor_name = coalesce(excluded.tutor_name, profiles.tutor_name);

  return new;
end;
$$;


-- ============================================================
-- supabase/migrations/add_skill_learnability.sql
-- ============================================================
-- Skill learnability ratings (admin-assigned, 1-10).
-- Used to compute the Opportunity Index on practice test score reports.
create table if not exists skill_learnability (
  skill_code text primary key,
  learnability integer not null default 5 check (learnability between 1 and 10),
  updated_at timestamptz not null default now()
);

-- Allow all authenticated users to read; only admins/managers write (enforced in API).
alter table skill_learnability enable row level security;

create policy "Anyone can read skill_learnability"
  on skill_learnability for select
  using (true);

create policy "Admins can manage skill_learnability"
  on skill_learnability for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'manager')
    )
  );


-- ============================================================
-- supabase/migrations/add_source_to_attempts.sql
-- ============================================================
-- Add source column to attempts table to distinguish where attempts come from.
-- Values: 'practice' (filter page / assignments), 'practice_test', 'review' (dashboard replay / review page)
-- Defaults to 'practice' for backwards compatibility with existing rows.
alter table public.attempts
  add column if not exists source text not null default 'practice';


-- ============================================================
-- supabase/migrations/add_subscription_system.sql
-- ============================================================
-- Phase 1: Subscription database setup
-- Creates the subscriptions table, adds subscription_exempt to profiles,
-- grandfathers all existing users, and updates signup trigger logic.

-- ═══════════════════════════════════════════════════════════════════
-- 1. Subscriptions table
-- ═══════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  stripe_customer_id text NOT NULL,
  stripe_subscription_id text UNIQUE,
  plan text NOT NULL DEFAULT 'free',
  status text NOT NULL DEFAULT 'trialing',
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  CONSTRAINT valid_plan CHECK (plan IN ('free', 'student', 'teacher', 'school')),
  CONSTRAINT valid_status CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'unpaid'))
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- RLS: users can read their own subscription
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "subscriptions_select_own" ON public.subscriptions
  FOR SELECT USING (auth.uid() = user_id);

-- Service role handles all writes (via webhook handler), no user write policies needed.

-- ═══════════════════════════════════════════════════════════════════
-- 2. Add subscription_exempt to profiles
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS subscription_exempt boolean NOT NULL DEFAULT false;

-- Grandfather all existing users
UPDATE public.profiles SET subscription_exempt = true WHERE subscription_exempt = false;

-- ═══════════════════════════════════════════════════════════════════
-- 3. Update handle_new_user trigger to set subscription_exempt
--    Teachers (via teacher code) and students (via teacher invite code)
--    are exempt. The signup API route sets a metadata flag.
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_meta jsonb;
  v_user_type text;
  v_role text;
  v_exempt boolean;
BEGIN
  v_meta := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_user_type := v_meta->>'user_type';
  v_exempt := coalesce((v_meta->>'subscription_exempt')::boolean, false);

  -- Map user_type to role
  CASE v_user_type
    WHEN 'student' THEN v_role := 'student';
    WHEN 'teacher' THEN v_role := 'teacher';
    ELSE v_role := 'practice';
  END CASE;

  INSERT INTO public.profiles (
    id, email, role, first_name, last_name, user_type,
    high_school, graduation_year, target_sat_score, tutor_name,
    subscription_exempt
  )
  VALUES (
    new.id,
    new.email,
    v_role,
    v_meta->>'first_name',
    v_meta->>'last_name',
    v_user_type,
    v_meta->>'high_school',
    (v_meta->>'graduation_year')::int,
    (v_meta->>'target_sat_score')::int,
    v_meta->>'tutor_name',
    v_exempt
  )
  ON CONFLICT (id) DO UPDATE SET
    email = excluded.email,
    role = coalesce(excluded.role, profiles.role),
    first_name = coalesce(excluded.first_name, profiles.first_name),
    last_name = coalesce(excluded.last_name, profiles.last_name),
    user_type = coalesce(excluded.user_type, profiles.user_type),
    high_school = coalesce(excluded.high_school, profiles.high_school),
    graduation_year = coalesce(excluded.graduation_year, profiles.graduation_year),
    target_sat_score = coalesce(excluded.target_sat_score, profiles.target_sat_score),
    tutor_name = coalesce(excluded.tutor_name, profiles.tutor_name),
    subscription_exempt = coalesce(excluded.subscription_exempt, profiles.subscription_exempt);

  RETURN new;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════
-- 4. Auto-exempt students when assigned to an exempt teacher
-- ═══════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.exempt_student_on_teacher_assignment()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  -- If the teacher is exempt, make the student exempt too
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.teacher_id AND subscription_exempt = true
  ) THEN
    UPDATE public.profiles
    SET subscription_exempt = true
    WHERE id = NEW.student_id AND subscription_exempt = false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_exempt_student_on_assignment ON public.teacher_student_assignments;
CREATE TRIGGER trg_exempt_student_on_assignment
  AFTER INSERT ON public.teacher_student_assignments
  FOR EACH ROW EXECUTE FUNCTION public.exempt_student_on_teacher_assignment();

-- ═══════════════════════════════════════════════════════════════════
-- 5. Updated_at trigger for subscriptions
-- ═══════════════════════════════════════════════════════════════════
CREATE TRIGGER set_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- supabase/migrations/add_subscriptions_user_id_unique.sql
-- ============================================================
-- Add unique constraint on user_id for subscriptions table
-- Required for upsert operations in the webhook handler
ALTER TABLE public.subscriptions
  ADD CONSTRAINT subscriptions_user_id_unique UNIQUE (user_id);


-- ============================================================
-- supabase/migrations/add_teacher_invite_code.sql
-- ============================================================
-- Add a unique invite code to teacher profiles.
-- Students can enter this code during signup to be auto-assigned to the teacher.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_invite_code text UNIQUE;

-- Index for fast lookup during student signup
CREATE INDEX IF NOT EXISTS idx_profiles_teacher_invite_code
  ON public.profiles (teacher_invite_code)
  WHERE teacher_invite_code IS NOT NULL;


-- ============================================================
-- supabase/migrations/add_teacher_student_assignments.sql
-- ============================================================
-- =========================================================
-- Direct teacher-student assignments
-- Simpler than class-based enrollments for admin-managed assignments
-- =========================================================

create table if not exists public.teacher_student_assignments (
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (teacher_id, student_id)
);

create index if not exists tsa_teacher_idx on public.teacher_student_assignments(teacher_id);
create index if not exists tsa_student_idx on public.teacher_student_assignments(student_id);

alter table public.teacher_student_assignments enable row level security;

-- Admins can do everything; teachers can view their own assignments
drop policy if exists tsa_select on public.teacher_student_assignments;
create policy tsa_select on public.teacher_student_assignments
  for select using (
    public.is_admin()
    or teacher_id = auth.uid()
    or student_id = auth.uid()
  );

drop policy if exists tsa_insert on public.teacher_student_assignments;
create policy tsa_insert on public.teacher_student_assignments
  for insert with check (public.is_admin());

drop policy if exists tsa_delete on public.teacher_student_assignments;
create policy tsa_delete on public.teacher_student_assignments
  for delete using (public.is_admin());

-- Update teacher_can_view_student to also check direct assignments
create or replace function public.teacher_can_view_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or exists (
           select 1 from public.class_enrollments ce
           join public.classes c on c.id = ce.class_id
           where ce.student_id = target_student_id
             and c.teacher_id = auth.uid()
         )
      or exists (
           select 1 from public.teacher_student_assignments tsa
           where tsa.student_id = target_student_id
             and tsa.teacher_id = auth.uid()
         );
$$;

-- Allow teachers to view practice_test_attempts for their students
alter table public.practice_test_attempts enable row level security;

drop policy if exists pta_select on public.practice_test_attempts;
create policy pta_select on public.practice_test_attempts
  for select using (
    user_id = auth.uid()
    or public.teacher_can_view_student(user_id)
  );

drop policy if exists pta_insert_self on public.practice_test_attempts;
create policy pta_insert_self on public.practice_test_attempts
  for insert with check (user_id = auth.uid() or public.is_admin());

drop policy if exists pta_update_self on public.practice_test_attempts;
create policy pta_update_self on public.practice_test_attempts
  for update
  using  (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());


-- ============================================================
-- supabase/migrations/add_test_type_to_official_scores.sql
-- ============================================================
-- Add test_type column to sat_official_scores (SAT, PSAT, or NULL for legacy rows)
ALTER TABLE public.sat_official_scores
  ADD COLUMN IF NOT EXISTS test_type text DEFAULT 'SAT';


-- ============================================================
-- supabase/migrations/allow_students_to_view_teacher_profile.sql
-- ============================================================
-- Allow students to view the profile of their assigned teacher.
-- Without this, students cannot resolve their teacher's name or email
-- because the profiles_select RLS policy only allows teacher→student visibility.

DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR teacher_can_view_student(id)
    OR is_admin()
    -- Manager can see their assigned teachers
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = profiles.id
    )
    -- Manager can see students of their assigned teachers
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      JOIN teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = profiles.id
    )
    -- Student can see their assigned teacher
    OR EXISTS (
      SELECT 1 FROM teacher_student_assignments tsa
      WHERE tsa.student_id = auth.uid() AND tsa.teacher_id = profiles.id
    )
  );


-- ============================================================
-- supabase/migrations/allow_teachers_to_read_concept_tags.sql
-- ============================================================
-- Allow teachers to read concept_tags and question_concept_tags
-- (they were previously restricted to manager/admin only)
drop policy if exists "concept_tags_select" on public.concept_tags;
create policy "concept_tags_select" on public.concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );

drop policy if exists "question_concept_tags_select" on public.question_concept_tags;
create policy "question_concept_tags_select" on public.question_concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );


-- ============================================================
-- supabase/migrations/cleanup_sat_flashcards.sql
-- ============================================================
-- Remove all "Common SAT Words" flashcards and flashcard_sets created under the old design.
-- This deletes the per-user copies of SAT vocabulary cards.
-- User-created cards in "My Math", "My Reading", and custom sets are NOT affected.

-- Step 1: Delete flashcards belonging to any "Common SAT Words" sub-sets
delete from public.flashcards
where set_id in (
  select id from public.flashcard_sets
  where parent_set_id in (
    select id from public.flashcard_sets
    where name = 'Common SAT Words' and parent_set_id is null
  )
);

-- Step 2: Delete the sub-sets themselves
delete from public.flashcard_sets
where parent_set_id in (
  select id from public.flashcard_sets
  where name = 'Common SAT Words' and parent_set_id is null
);

-- Step 3: Delete the "Common SAT Words" parent sets
delete from public.flashcard_sets
where name = 'Common SAT Words' and parent_set_id is null;


-- ============================================================
-- supabase/migrations/create_account_tiers.sql
-- ============================================================
-- =========================================================
-- Account Tier System: profiles, classes, enrollments, invites
-- Roles: practice (default), student, teacher, admin
-- =========================================================

-- 0) PROFILES
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text unique,
  role       text not null check (role in ('practice','student','teacher','admin')) default 'practice',
  created_at timestamptz default now()
);

alter table public.profiles enable row level security;

-- 1) Helper functions for RLS
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role = 'admin'
  );
$$;

create or replace function public.is_teacher()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.role in ('teacher','admin')
  );
$$;

-- 2) Roster tables

create table if not exists public.classes (
  id         uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  created_at timestamptz default now()
);
create index if not exists classes_teacher_id_idx on public.classes(teacher_id);

create table if not exists public.class_enrollments (
  class_id   uuid not null references public.classes(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (class_id, student_id)
);
create index if not exists class_enrollments_student_id_idx on public.class_enrollments(student_id);

create table if not exists public.class_invites (
  id         uuid primary key default gen_random_uuid(),
  class_id   uuid not null references public.classes(id) on delete cascade,
  code       text not null unique,
  expires_at timestamptz,
  max_uses   int,
  uses       int not null default 0,
  created_at timestamptz default now()
);
create index if not exists class_invites_class_id_idx on public.class_invites(class_id);

alter table public.classes enable row level security;
alter table public.class_enrollments enable row level security;
alter table public.class_invites enable row level security;

-- 3) Teacher can view student helper
create or replace function public.teacher_can_view_student(target_student_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select public.is_admin()
      or exists (
           select 1 from public.class_enrollments ce
           join public.classes c on c.id = ce.class_id
           where ce.student_id = target_student_id
             and c.teacher_id = auth.uid()
         );
$$;

-- 4) Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, role)
  values (new.id, new.email, 'practice')
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 5) Profiles policies
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;

create policy profiles_select on public.profiles
  for select using (
    id = auth.uid()
    or public.teacher_can_view_student(id)
    or public.is_admin()
  );

create policy profiles_update_self on public.profiles
  for update
  using  (id = auth.uid() or public.is_admin())
  with check (id = auth.uid() or public.is_admin());

-- 6) Classes policies
drop policy if exists classes_select on public.classes;
drop policy if exists classes_insert on public.classes;
drop policy if exists classes_update on public.classes;
drop policy if exists classes_delete on public.classes;

create policy classes_select on public.classes
  for select using (teacher_id = auth.uid() or public.is_admin());

create policy classes_insert on public.classes
  for insert with check (public.is_teacher() and teacher_id = auth.uid());

create policy classes_update on public.classes
  for update
  using  (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

create policy classes_delete on public.classes
  for delete using (teacher_id = auth.uid() or public.is_admin());

-- 7) Enrollments policies
drop policy if exists enrollments_select on public.class_enrollments;
drop policy if exists enrollments_insert_teacher on public.class_enrollments;
drop policy if exists enrollments_delete_teacher on public.class_enrollments;

create policy enrollments_select on public.class_enrollments
  for select using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    or student_id = auth.uid()
  );

create policy enrollments_insert_teacher on public.class_enrollments
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy enrollments_delete_teacher on public.class_enrollments
  for delete using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
    or student_id = auth.uid()
  );

-- 8) Invites policies
drop policy if exists invites_select on public.class_invites;
drop policy if exists invites_insert on public.class_invites;
drop policy if exists invites_update on public.class_invites;

create policy invites_select on public.class_invites
  for select using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy invites_insert on public.class_invites
  for insert with check (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

create policy invites_update on public.class_invites
  for update using (
    public.is_admin()
    or exists (select 1 from public.classes c where c.id = class_id and c.teacher_id = auth.uid())
  );

-- 9) Invite redemption RPC (transaction-safe)
create or replace function public.redeem_class_invite(invite_code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_inv public.class_invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;

  select * into v_inv
  from public.class_invites
  where code = invite_code
  for update;

  if not found then raise exception 'invalid_code'; end if;

  if v_inv.expires_at is not null and v_inv.expires_at < now() then
    raise exception 'expired_code';
  end if;

  if v_inv.max_uses is not null and v_inv.uses >= v_inv.max_uses then
    raise exception 'code_used_up';
  end if;

  insert into public.class_enrollments (class_id, student_id)
  values (v_inv.class_id, auth.uid())
  on conflict do nothing;

  update public.class_invites set uses = uses + 1 where id = v_inv.id;

  return v_inv.class_id;
end;
$$;

-- =========================================================
-- RLS for existing tables
-- =========================================================

alter table public.attempts enable row level security;
alter table public.question_status enable row level security;

-- Attempts policies
drop policy if exists attempts_select on public.attempts;
drop policy if exists attempts_insert_self on public.attempts;
drop policy if exists attempts_update_self on public.attempts;
drop policy if exists attempts_delete_self on public.attempts;

create policy attempts_select on public.attempts
  for select using (user_id = auth.uid() or public.teacher_can_view_student(user_id));

create policy attempts_insert_self on public.attempts
  for insert with check (user_id = auth.uid() or public.is_admin());

create policy attempts_update_self on public.attempts
  for update
  using  (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy attempts_delete_self on public.attempts
  for delete using (user_id = auth.uid() or public.is_admin());

-- Question_status policies
drop policy if exists qs_select on public.question_status;
drop policy if exists qs_insert_self on public.question_status;
drop policy if exists qs_update_self on public.question_status;
drop policy if exists qs_delete_self on public.question_status;

create policy qs_select on public.question_status
  for select using (user_id = auth.uid() or public.teacher_can_view_student(user_id));

create policy qs_insert_self on public.question_status
  for insert with check (user_id = auth.uid() or public.is_admin());

create policy qs_update_self on public.question_status
  for update
  using  (user_id = auth.uid() or public.is_admin())
  with check (user_id = auth.uid() or public.is_admin());

create policy qs_delete_self on public.question_status
  for delete using (user_id = auth.uid() or public.is_admin());


-- ============================================================
-- supabase/migrations/create_act_tables.sql
-- ============================================================
-- ACT Questions: single flat table with content + taxonomy (no versioning)
create table if not exists act_questions (
  id uuid primary key default gen_random_uuid(),
  external_id text unique,
  section text not null check (section in ('english', 'math', 'reading', 'science')),
  category_code text,
  category text not null,
  subcategory_code text,
  subcategory text,
  is_modeling boolean not null default false,
  difficulty integer,
  question_type text not null default 'mcq',
  stimulus_html text,
  stem_html text not null,
  rationale_html text,
  source_test text,
  source_ordinal integer,
  is_broken boolean not null default false,
  created_at timestamptz not null default now()
);

create index idx_act_questions_section on act_questions (section);
create index idx_act_questions_category on act_questions (section, category_code);
create index idx_act_questions_subcategory on act_questions (section, category_code, subcategory_code);
create index idx_act_questions_source on act_questions (source_test);

-- Answer options keyed directly to question (no version indirection)
create table if not exists act_answer_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references act_questions (id) on delete cascade,
  ordinal integer not null,
  label text not null,
  content_html text not null,
  is_correct boolean not null default false
);

create index idx_act_answer_options_question on act_answer_options (question_id);

-- Immutable attempt log
create table if not exists act_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references act_questions (id) on delete cascade,
  selected_option_id uuid references act_answer_options (id),
  is_correct boolean not null,
  time_spent_ms integer,
  source text not null default 'practice',
  created_at timestamptz not null default now()
);

create index idx_act_attempts_user on act_attempts (user_id);
create index idx_act_attempts_user_question on act_attempts (user_id, question_id);
create index idx_act_attempts_created on act_attempts (user_id, created_at desc);

-- RLS
alter table act_questions enable row level security;
alter table act_answer_options enable row level security;
alter table act_attempts enable row level security;

-- All authenticated users can read questions and options
create policy "act_questions_read" on act_questions
  for select to authenticated using (true);

create policy "act_answer_options_read" on act_answer_options
  for select to authenticated using (true);

-- Users can read their own attempts
create policy "act_attempts_select_own" on act_attempts
  for select to authenticated
  using (user_id = auth.uid());

-- Users can insert their own attempts
create policy "act_attempts_insert_own" on act_attempts
  for insert to authenticated
  with check (user_id = auth.uid());

-- Teachers can view attempts of their assigned students
create policy "act_attempts_teacher_read" on act_attempts
  for select to authenticated
  using (
    exists (
      select 1 from teacher_student_assignments tsa
      where tsa.student_id = act_attempts.user_id
        and tsa.teacher_id = auth.uid()
    )
  );


-- ============================================================
-- supabase/migrations/create_answer_choice_tags.sql
-- ============================================================
-- Answer-choice tags: a tagging system specifically for WRONG answer choices.
-- Mirrors the concept_tags system but scopes tags to individual options on a
-- question (e.g. "Opposite answer", "Eye-catcher", "Sign error"). Tags are
-- visible to teachers/managers/admins only and addable by managers/admins only.
--
-- Keyed by (question_id, option_label) so it survives the planned
-- questions → questions_v2 migration (where options become JSONB rows without
-- stable per-option UUIDs). option_label is the 'A'/'B'/'C'/'D' letter.

-- ─── Tag vocabulary ────────────────────────────────────────────────────
create table if not exists public.answer_choice_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- ─── Junction: which options carry which tags ─────────────────────────
create table if not exists public.option_answer_choice_tags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  option_label text not null,
  tag_id uuid not null references public.answer_choice_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(question_id, option_label, tag_id)
);

create index if not exists idx_answer_choice_tags_name
  on public.answer_choice_tags(name);
create index if not exists idx_option_answer_choice_tags_question
  on public.option_answer_choice_tags(question_id);
create index if not exists idx_option_answer_choice_tags_tag
  on public.option_answer_choice_tags(tag_id);

-- ─── RLS ───────────────────────────────────────────────────────────────
alter table public.answer_choice_tags enable row level security;
alter table public.option_answer_choice_tags enable row level security;

-- Tag vocabulary: teachers, managers, admins can read
create policy "answer_choice_tags_select" on public.answer_choice_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );

-- Tag vocabulary: managers and admins can create
create policy "answer_choice_tags_insert" on public.answer_choice_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- Tag vocabulary: only admins can rename
create policy "answer_choice_tags_update" on public.answer_choice_tags
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Tag vocabulary: only admins can delete
create policy "answer_choice_tags_delete" on public.answer_choice_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- Assignments: teachers/managers/admins can read
create policy "option_answer_choice_tags_select" on public.option_answer_choice_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('teacher', 'manager', 'admin')
    )
  );

-- Assignments: managers and admins can add
create policy "option_answer_choice_tags_insert" on public.option_answer_choice_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- Assignments: only admins can remove
create policy "option_answer_choice_tags_delete" on public.option_answer_choice_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- updated_at trigger for the vocabulary table
create trigger set_answer_choice_tags_updated_at
  before update on public.answer_choice_tags
  for each row execute function public.set_updated_at();

-- ─── Seed a starter list of common SAT wrong-answer traps ──────────────
-- Admins and managers can grow this list from the UI later.
insert into public.answer_choice_tags (name) values
  ('Opposite answer'),
  ('Extreme language'),
  ('Out of scope'),
  ('Half right, half wrong'),
  ('Eye-catcher'),
  ('True but irrelevant'),
  ('Misread stem'),
  ('Common misconception'),
  ('Sign error'),
  ('Wrong operation')
on conflict (name) do nothing;


-- ============================================================
-- supabase/migrations/create_bug_reports.sql
-- ============================================================
-- Bug reports table for tracking issues and underperforming elements
-- Run this in the Supabase SQL editor or via the Supabase CLI.

create table if not exists bug_reports (
  id          uuid primary key default gen_random_uuid(),
  title       text not null default 'Bug Report',
  description text not null,
  image_url   text,
  status      text not null default 'open' check (status in ('open', 'in_progress', 'resolved', 'closed')),
  created_by  text,
  created_at  timestamptz not null default now()
);

-- Index for listing by date
create index if not exists idx_bug_reports_created_at
  on bug_reports (created_at desc);

-- RLS: only admins can read/write
alter table bug_reports enable row level security;

create policy "Admins can do everything on bug_reports"
  on bug_reports for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );


-- ============================================================
-- supabase/migrations/create_concept_tags.sql
-- ============================================================
-- Concept tags: a global list of reusable tags
create table if not exists public.concept_tags (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

-- Junction table: many-to-many between questions and concept_tags
create table if not exists public.question_concept_tags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  tag_id uuid not null references public.concept_tags(id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id),
  unique(question_id, tag_id)
);

-- Indexes
create index if not exists idx_question_concept_tags_question on public.question_concept_tags(question_id);
create index if not exists idx_question_concept_tags_tag on public.question_concept_tags(tag_id);
create index if not exists idx_concept_tags_name on public.concept_tags(name);

-- RLS
alter table public.concept_tags enable row level security;
alter table public.question_concept_tags enable row level security;

-- concept_tags: managers and admins can read
create policy "concept_tags_select" on public.concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- concept_tags: managers and admins can insert
create policy "concept_tags_insert" on public.concept_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- concept_tags: only admins can update
create policy "concept_tags_update" on public.concept_tags
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- concept_tags: only admins can delete
create policy "concept_tags_delete" on public.concept_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- question_concept_tags: managers and admins can read
create policy "question_concept_tags_select" on public.question_concept_tags
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- question_concept_tags: managers and admins can insert
create policy "question_concept_tags_insert" on public.question_concept_tags
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('manager', 'admin')
    )
  );

-- question_concept_tags: admins can delete (remove tag from question)
create policy "question_concept_tags_delete" on public.question_concept_tags
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- updated_at trigger for concept_tags
create trigger set_concept_tags_updated_at
  before update on public.concept_tags
  for each row execute function public.set_updated_at();


-- ============================================================
-- supabase/migrations/create_desmos_saved_states.sql
-- ============================================================
-- =========================================================
-- Saved Desmos calculator states for questions
-- Managers/admins can save reference calculator states that
-- teachers can load as guidance material
-- =========================================================

create table if not exists public.desmos_saved_states (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  state_json jsonb not null,
  saved_by uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (question_id)
);

create index if not exists idx_desmos_saved_states_question_id on public.desmos_saved_states(question_id);

alter table public.desmos_saved_states enable row level security;

-- Teachers, managers, and admins can view saved states
create policy desmos_saved_states_select on public.desmos_saved_states
  for select using (public.is_teacher());

-- Only managers and admins can insert
create policy desmos_saved_states_insert on public.desmos_saved_states
  for insert with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );

-- Only managers and admins can update
create policy desmos_saved_states_update on public.desmos_saved_states
  for update using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );

-- Only managers and admins can delete
create policy desmos_saved_states_delete on public.desmos_saved_states
  for delete using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('manager', 'admin')
    )
  );


-- ============================================================
-- supabase/migrations/create_flashcards.sql
-- ============================================================
-- Flashcard sets: each student has their own sets
create table if not exists public.flashcard_sets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  is_default boolean not null default false,
  created_at timestamptz default now()
);

create index if not exists fs_user_idx on public.flashcard_sets(user_id);

-- Flashcards: belong to a set
create table if not exists public.flashcards (
  id uuid primary key default gen_random_uuid(),
  set_id uuid not null references public.flashcard_sets(id) on delete cascade,
  front text not null,
  back text not null,
  mastery integer not null default 0 check (mastery >= 0 and mastery <= 5),
  created_at timestamptz default now(),
  reviewed_at timestamptz
);

create index if not exists fc_set_idx on public.flashcards(set_id);

-- RLS
alter table public.flashcard_sets enable row level security;
alter table public.flashcards enable row level security;

-- Users manage their own sets
create policy "Users manage own flashcard sets" on public.flashcard_sets
  for all using (user_id = auth.uid());

-- Users manage cards in their own sets
create policy "Users manage own flashcards" on public.flashcards
  for all using (
    exists (select 1 from public.flashcard_sets where id = flashcards.set_id and user_id = auth.uid())
  );


-- ============================================================
-- supabase/migrations/create_learning_content.sql
-- ============================================================
-- =========================================================
-- Learning Content System
-- Lessons with ordered blocks (rich text, video, knowledge
-- checks, question bank links), topic tagging, assignments,
-- and student progress tracking.
-- =========================================================

-- 1) LESSONS — the top-level content container
create table if not exists public.lessons (
  id          uuid primary key default gen_random_uuid(),
  author_id   uuid not null references public.profiles(id) on delete cascade,
  title       text not null,
  description text,
  visibility  text not null default 'shared'
    check (visibility in ('shared', 'private')),
  status      text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists lessons_author_idx on public.lessons(author_id);
create index if not exists lessons_status_idx on public.lessons(status);

-- 2) LESSON BLOCKS — ordered content blocks within a lesson
create table if not exists public.lesson_blocks (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  sort_order  integer not null default 0,
  block_type  text not null
    check (block_type in ('text', 'video', 'check', 'question_link')),
  content     jsonb not null default '{}',
  created_at  timestamptz default now()
);

create index if not exists lesson_blocks_lesson_idx on public.lesson_blocks(lesson_id);

-- Block content JSONB shapes:
--   text:          { "html": "<p>...</p>" }
--   video:         { "url": "https://...", "caption": "..." }
--   check:         { "prompt": "...", "choices": ["A","B","C","D"],
--                    "correct_index": 2, "explanation": "..." }
--   question_link: { "question_id": "abc-123" }

-- 3) LESSON TOPICS — many-to-many tagging by SAT domain/skill
-- Uses a surrogate uuid primary key plus a unique index over
-- the (lesson_id, domain_name, coalesce(skill_code, '')) expression.
-- PostgreSQL doesn't allow function expressions in a PRIMARY KEY
-- constraint (only bare column names are legal), but a UNIQUE
-- INDEX can use expressions, which gives us the desired semantics:
-- NULL and empty-string skill_code are treated as equivalent, so a
-- single lesson can't be tagged twice with the same domain + skill.
create table if not exists public.lesson_topics (
  id          uuid primary key default gen_random_uuid(),
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  domain_name text not null,
  skill_code  text  -- null = domain-level tag only
);

create unique index if not exists lesson_topics_unique_idx
  on public.lesson_topics (lesson_id, domain_name, coalesce(skill_code, ''));

create index if not exists lesson_topics_domain_idx on public.lesson_topics(domain_name);

-- 4) LESSON ASSIGNMENTS — teacher assigns lessons to students
create table if not exists public.lesson_assignments (
  id          uuid primary key default gen_random_uuid(),
  teacher_id  uuid not null references public.profiles(id) on delete cascade,
  lesson_id   uuid not null references public.lessons(id) on delete cascade,
  due_date    timestamptz,
  created_at  timestamptz default now()
);

create index if not exists lesson_assignments_teacher_idx on public.lesson_assignments(teacher_id);
create index if not exists lesson_assignments_lesson_idx on public.lesson_assignments(lesson_id);

-- 5) LESSON ASSIGNMENT STUDENTS — junction table
create table if not exists public.lesson_assignment_students (
  assignment_id uuid not null references public.lesson_assignments(id) on delete cascade,
  student_id    uuid not null references public.profiles(id) on delete cascade,
  created_at    timestamptz default now(),
  primary key (assignment_id, student_id)
);

create index if not exists las_student_idx on public.lesson_assignment_students(student_id);
create index if not exists las_assignment_idx on public.lesson_assignment_students(assignment_id);

-- 6) LESSON PROGRESS — tracks student progress through a lesson
create table if not exists public.lesson_progress (
  lesson_id       uuid not null references public.lessons(id) on delete cascade,
  student_id      uuid not null references public.profiles(id) on delete cascade,
  completed_blocks text[] not null default '{}',  -- block IDs the student has completed
  check_answers   jsonb not null default '{}',    -- { blockId: { selected: 1, correct: true } }
  started_at      timestamptz default now(),
  completed_at    timestamptz,                    -- null until all blocks done
  primary key (lesson_id, student_id)
);

create index if not exists lp_student_idx on public.lesson_progress(student_id);

-- =========================================================
-- RLS
-- =========================================================

alter table public.lessons enable row level security;
alter table public.lesson_blocks enable row level security;
alter table public.lesson_topics enable row level security;
alter table public.lesson_assignments enable row level security;
alter table public.lesson_assignment_students enable row level security;
alter table public.lesson_progress enable row level security;

-- Helper: check if a student is assigned to a lesson assignment
create or replace function public.is_lesson_assignment_student(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_assignment_students
    where assignment_id = p_assignment_id and student_id = p_student_id
  );
$$;

-- Helper: check if user is the teacher who owns a lesson assignment
create or replace function public.is_lesson_assignment_teacher(p_assignment_id uuid, p_teacher_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_assignments
    where id = p_assignment_id and teacher_id = p_teacher_id
  );
$$;

-- Helper: check if a student has been assigned a specific lesson (by any teacher)
create or replace function public.student_has_lesson_assignment(p_lesson_id uuid, p_student_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lesson_assignments la
    join public.lesson_assignment_students las on las.assignment_id = la.id
    where la.lesson_id = p_lesson_id and las.student_id = p_student_id
  );
$$;

-- ---- LESSONS policies ----

-- Everyone can browse published+shared lessons; authors see their own; admins see all
create policy lessons_select on public.lessons
  for select using (
    (visibility = 'shared' and status = 'published')
    or author_id = auth.uid()
    or public.is_admin()
    or public.student_has_lesson_assignment(id, auth.uid())
  );

create policy lessons_insert on public.lessons
  for insert with check (
    public.is_teacher() and author_id = auth.uid()
  );

create policy lessons_update on public.lessons
  for update
  using  (author_id = auth.uid() or public.is_admin())
  with check (author_id = auth.uid() or public.is_admin());

create policy lessons_delete on public.lessons
  for delete using (author_id = auth.uid() or public.is_admin());

-- ---- LESSON BLOCKS policies ----
-- Blocks follow their parent lesson's visibility

create or replace function public.can_view_lesson(p_lesson_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lessons
    where id = p_lesson_id
      and (
        (visibility = 'shared' and status = 'published')
        or author_id = auth.uid()
        or public.is_admin()
        or public.student_has_lesson_assignment(id, auth.uid())
      )
  );
$$;

create or replace function public.is_lesson_author(p_lesson_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lessons
    where id = p_lesson_id and author_id = auth.uid()
  );
$$;

create policy lesson_blocks_select on public.lesson_blocks
  for select using (public.can_view_lesson(lesson_id));

create policy lesson_blocks_insert on public.lesson_blocks
  for insert with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_blocks_update on public.lesson_blocks
  for update
  using  (public.is_lesson_author(lesson_id) or public.is_admin())
  with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_blocks_delete on public.lesson_blocks
  for delete using (public.is_lesson_author(lesson_id) or public.is_admin());

-- ---- LESSON TOPICS policies ----

create policy lesson_topics_select on public.lesson_topics
  for select using (public.can_view_lesson(lesson_id));

create policy lesson_topics_insert on public.lesson_topics
  for insert with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_topics_update on public.lesson_topics
  for update
  using  (public.is_lesson_author(lesson_id) or public.is_admin())
  with check (public.is_lesson_author(lesson_id) or public.is_admin());

create policy lesson_topics_delete on public.lesson_topics
  for delete using (public.is_lesson_author(lesson_id) or public.is_admin());

-- ---- LESSON ASSIGNMENTS policies ----

create policy lesson_assignments_select on public.lesson_assignments
  for select using (
    teacher_id = auth.uid()
    or public.is_admin()
    or public.is_lesson_assignment_student(id, auth.uid())
  );

create policy lesson_assignments_insert on public.lesson_assignments
  for insert with check (
    public.is_teacher() and teacher_id = auth.uid()
  );

create policy lesson_assignments_update on public.lesson_assignments
  for update
  using  (teacher_id = auth.uid() or public.is_admin())
  with check (teacher_id = auth.uid() or public.is_admin());

create policy lesson_assignments_delete on public.lesson_assignments
  for delete using (teacher_id = auth.uid() or public.is_admin());

-- ---- LESSON ASSIGNMENT STUDENTS policies ----

create policy las_select on public.lesson_assignment_students
  for select using (
    student_id = auth.uid()
    or public.is_lesson_assignment_teacher(assignment_id, auth.uid())
    or public.is_admin()
  );

create policy las_insert on public.lesson_assignment_students
  for insert with check (
    public.is_lesson_assignment_teacher(assignment_id, auth.uid())
    or public.is_admin()
  );

create policy las_delete on public.lesson_assignment_students
  for delete using (
    public.is_lesson_assignment_teacher(assignment_id, auth.uid())
    or public.is_admin()
  );

-- ---- LESSON PROGRESS policies ----

create policy lesson_progress_select on public.lesson_progress
  for select using (
    student_id = auth.uid()
    or public.teacher_can_view_student(student_id)
  );

create policy lesson_progress_insert on public.lesson_progress
  for insert with check (student_id = auth.uid());

create policy lesson_progress_update on public.lesson_progress
  for update
  using  (student_id = auth.uid())
  with check (student_id = auth.uid());


-- ============================================================
-- supabase/migrations/create_manager_teacher_assignments.sql
-- ============================================================
-- Manager-teacher assignments: managers oversee specific groups of teachers
-- Mirrors the teacher_student_assignments pattern

CREATE TABLE IF NOT EXISTS public.manager_teacher_assignments (
  manager_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  teacher_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT manager_teacher_assignments_pkey PRIMARY KEY (manager_id, teacher_id)
);

CREATE INDEX IF NOT EXISTS mta_manager_idx ON public.manager_teacher_assignments(manager_id);
CREATE INDEX IF NOT EXISTS mta_teacher_idx ON public.manager_teacher_assignments(teacher_id);

-- RLS
ALTER TABLE public.manager_teacher_assignments ENABLE ROW LEVEL SECURITY;

-- Admins can do anything
CREATE POLICY "Admins manage all manager-teacher assignments"
  ON public.manager_teacher_assignments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Managers can view their own assignments
CREATE POLICY "Managers can view own assignments"
  ON public.manager_teacher_assignments
  FOR SELECT USING (manager_id = auth.uid());


-- ============================================================
-- supabase/migrations/create_platform_stats_rpcs.sql
-- ============================================================
-- RPCs used by /api/admin/platform-stats. Before this migration, the
-- API referenced count_distinct_users_since() via supabase.rpc() but
-- the function did not exist — the call always returned an error and
-- the code fell through to a JS fallback that did `.limit(50000)` on
-- the attempts table with no `.order()`, silently truncating recent
-- activity once volume passed 50k rows in the 30-day window. Adding
-- the RPC here makes the admin dashboard stats a single aggregate SQL
-- query instead of a 100-page pagination loop.
--
-- SECURITY DEFINER is required because the API route runs as the
-- calling admin user (via RLS-scoped supabase client) and needs to
-- count rows across all users. The function is only callable by
-- admins — see the GRANT at the bottom.

create or replace function public.count_distinct_users_since(since timestamptz)
returns integer
language sql
security definer
set search_path = public
as $$
  select count(distinct user_id)::integer
  from public.attempts
  where created_at >= since;
$$;

-- Lock down who can call it. The API route checks profile.role = 'admin'
-- at the application layer, but we defense-in-depth at the function
-- level too: revoke from the default authenticated role and grant
-- only to the service role + an admin-gated wrapper.
revoke all on function public.count_distinct_users_since(timestamptz) from public;
revoke all on function public.count_distinct_users_since(timestamptz) from anon;
grant execute on function public.count_distinct_users_since(timestamptz) to authenticated;

-- Note: granting to `authenticated` is safe because the function only
-- returns a single integer (a count) — no row data leaks. If you want
-- to tighten further, wrap the call in a SECURITY INVOKER view that
-- checks profiles.role = 'admin' first. For now the application-level
-- gate in the /api/admin/platform-stats route is sufficient.


-- ============================================================
-- supabase/migrations/create_question_assignments.sql
-- ============================================================
-- Question assignments: teacher creates an assignment with a set of questions for students
create table if not exists public.question_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  due_date timestamptz,
  filter_criteria jsonb, -- { domains, topics, difficulties, score_bands } used to generate question set
  question_ids text[] not null default '{}', -- array of question UUIDs as text
  created_at timestamptz default now()
);

create index if not exists qa_teacher_idx on public.question_assignments(teacher_id);

-- Which students are assigned to each assignment
create table if not exists public.question_assignment_students (
  assignment_id uuid not null references public.question_assignments(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz default now(),
  primary key (assignment_id, student_id)
);

create index if not exists qas_student_idx on public.question_assignment_students(student_id);
create index if not exists qas_assignment_idx on public.question_assignment_students(assignment_id);

-- RLS
alter table public.question_assignments enable row level security;
alter table public.question_assignment_students enable row level security;

-- Teachers can manage their own assignments; admins can manage all
create policy "Teachers manage own assignments" on public.question_assignments
  for all using (
    teacher_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Helpers to break RLS circular dependency between question_assignments
-- and question_assignment_students (each policy references the other table).
-- SECURITY DEFINER functions run as the owner and bypass RLS.

-- Used by question_assignments policy to check student membership
create or replace function public.is_student_assigned(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_assignment_students
    where assignment_id = p_assignment_id and student_id = p_student_id
  );
$$;

-- Used by question_assignment_students policies to check teacher ownership
create or replace function public.is_assignment_teacher(p_assignment_id uuid, p_teacher_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_assignments
    where id = p_assignment_id and teacher_id = p_teacher_id
  );
$$;

-- Students can view assignments they are assigned to
create policy "Students view assigned assignments" on public.question_assignments
  for select using (
    public.is_student_assigned(id, auth.uid())
  );

-- Students can view assignments they're assigned to; teachers/admins see theirs
create policy "View assignment students" on public.question_assignment_students
  for select using (
    student_id = auth.uid()
    or public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Teachers and admins can insert/delete assignment students
create policy "Teachers manage assignment students" on public.question_assignment_students
  for all using (
    public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ============================================================
-- supabase/migrations/create_question_notes.sql
-- ============================================================
-- =========================================================
-- Question notes: shared notes on questions for teachers/managers/admins
-- =========================================================

create table if not exists public.question_notes (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_question_notes_question_id on public.question_notes(question_id);
create index if not exists idx_question_notes_author_id on public.question_notes(author_id);

alter table public.question_notes enable row level security;

-- Teachers, managers, and admins can view all notes
create policy question_notes_select on public.question_notes
  for select using (public.is_teacher());

-- Teachers, managers, and admins can insert notes
create policy question_notes_insert on public.question_notes
  for insert with check (public.is_teacher() and auth.uid() = author_id);

-- Authors can update their own notes; admins can update any
create policy question_notes_update on public.question_notes
  for update using (
    auth.uid() = author_id or public.is_admin()
  );

-- Authors can delete their own notes; admins can delete any
create policy question_notes_delete on public.question_notes
  for delete using (
    auth.uid() = author_id or public.is_admin()
  );


-- ============================================================
-- supabase/migrations/create_questions_v2_fix_suggestions.sql
-- ============================================================
-- Staging table for Claude-generated HTML cleanup suggestions on
-- questions_v2 rows. Populated by the async batch scripts in
-- scripts/v2-batch-fix-*.mjs and drained by the Bulk Review panel in
-- the admin dashboard. Nothing in this table is ever read by the live
-- practice flow — it exists purely to separate "Claude thinks you
-- should change X" from "questions_v2 actually contains X".
--
-- Keeping suggestions in their own table (instead of writing directly
-- to questions_v2) means:
--   - admins can review, bulk-accept, or reject without ever touching
--     the canonical row
--   - we keep a full snapshot of the row at submit time so we can
--     diff after the fact and roll back if needed
--   - we can store the batch_id from Anthropic's Batches API and poll
--     it asynchronously instead of holding an HTTP connection open
--
-- Apply with:  supabase sql < supabase/migrations/create_questions_v2_fix_suggestions.sql
-- (or paste into the SQL editor on the dev project).

create table if not exists public.questions_v2_fix_suggestions (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.questions_v2(id) on delete cascade,

  -- Anthropic Batches API metadata. batch_id + custom_id together
  -- identify the individual request inside a submitted batch.
  batch_id text,
  custom_id text,

  -- Lifecycle:
  --   pending    — submitted to Anthropic, waiting on batch completion
  --   collected  — results downloaded, ready for admin review
  --   applied    — suggestion merged into questions_v2 by an admin
  --   rejected   — admin marked the suggestion as not worth applying
  --   failed     — Claude errored or returned malformed output
  --   superseded — a newer suggestion exists for the same question
  status text not null default 'pending'
    check (status in ('pending', 'collected', 'applied', 'rejected', 'failed', 'superseded')),

  -- Which model produced this suggestion. Useful for debugging cost
  -- and quality differences between Haiku and Sonnet runs.
  model text,

  -- Snapshot of the source row at submit time. These three columns
  -- let us diff against whatever questions_v2 looks like when the
  -- admin eventually reviews the suggestion — so even if the row was
  -- edited in the meantime, the review UI can tell the difference
  -- between "the source moved" and "Claude changed something".
  source_stimulus_html text,
  source_stem_html text,
  source_options jsonb,

  -- Claude's proposed output.
  suggested_stimulus_html text,
  suggested_stem_html text,
  suggested_options jsonb,

  -- Classification computed by the collect script:
  --   identical    — Claude returned the same thing we sent
  --   trivial      — only whitespace / entity / class changes
  --   non_trivial  — math rewriting, table restructuring, content shifts
  --   error        — Claude failed or returned unusable output
  -- The Bulk Review UI filters on this so admins can one-click-accept
  -- all trivial changes and focus their attention on the non-trivial
  -- ones.
  diff_classification text
    check (diff_classification in ('identical', 'trivial', 'non_trivial', 'error')),
  error_message text,

  -- Audit
  submitted_at timestamptz not null default now(),
  collected_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz
);

create index if not exists idx_qv2_fix_suggestions_question
  on public.questions_v2_fix_suggestions(question_id);
create index if not exists idx_qv2_fix_suggestions_status
  on public.questions_v2_fix_suggestions(status);
create index if not exists idx_qv2_fix_suggestions_batch
  on public.questions_v2_fix_suggestions(batch_id);
create index if not exists idx_qv2_fix_suggestions_classification
  on public.questions_v2_fix_suggestions(diff_classification);

-- RLS: admin-only, top to bottom. No teacher, manager, or student
-- should ever see this table — it's infrastructure for the migration
-- cleanup, not user-facing content.
alter table public.questions_v2_fix_suggestions enable row level security;

create policy "qv2_fix_suggestions_admin_select"
  on public.questions_v2_fix_suggestions
  for select using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_insert"
  on public.questions_v2_fix_suggestions
  for insert with check (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_update"
  on public.questions_v2_fix_suggestions
  for update using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

create policy "qv2_fix_suggestions_admin_delete"
  on public.questions_v2_fix_suggestions
  for delete using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid() and profiles.role = 'admin'
    )
  );

-- The batch scripts use the service role key and bypass RLS anyway,
-- but these policies keep the UI-facing API honest: only admins can
-- call /api/admin/questions-v2/suggestions even if someone wires it
-- up without the right role check.


-- ============================================================
-- supabase/migrations/create_sat_registrations_and_scores.sql
-- ============================================================
-- SAT test registrations (multiple per student)
CREATE TABLE IF NOT EXISTS public.sat_test_registrations (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_date timestamptz NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.sat_test_registrations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own registrations"
  ON public.sat_test_registrations FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view assigned student registrations"
  ON public.sat_test_registrations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_student_assignments tsa
      WHERE tsa.teacher_id = auth.uid() AND tsa.student_id = sat_test_registrations.student_id
    )
  );

CREATE POLICY "Teachers can insert registrations for assigned students"
  ON public.sat_test_registrations FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "Teachers can delete registrations for assigned students"
  ON public.sat_test_registrations FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

-- Official SAT test scores
CREATE TABLE IF NOT EXISTS public.sat_official_scores (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  student_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  test_date date NOT NULL,
  rw_score integer NOT NULL,
  math_score integer NOT NULL,
  composite_score integer NOT NULL,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

ALTER TABLE public.sat_official_scores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students can view own scores"
  ON public.sat_official_scores FOR SELECT
  USING (auth.uid() = student_id);

CREATE POLICY "Teachers can view assigned student scores"
  ON public.sat_official_scores FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.teacher_student_assignments tsa
      WHERE tsa.teacher_id = auth.uid() AND tsa.student_id = sat_official_scores.student_id
    )
  );

CREATE POLICY "Teachers can insert scores for assigned students"
  ON public.sat_official_scores FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );

CREATE POLICY "Teachers can delete scores"
  ON public.sat_official_scores FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('teacher', 'admin')
    )
  );


-- ============================================================
-- supabase/migrations/create_sat_vocabulary.sql
-- ============================================================
-- Static shared SAT vocabulary table (seeded once via CSV import)
create table if not exists public.sat_vocabulary (
  id serial primary key,
  set_number integer not null check (set_number >= 1 and set_number <= 10),
  word text not null,
  definition text not null,
  example text
);

create index if not exists sv_set_idx on public.sat_vocabulary(set_number);

-- Per-user progress on SAT vocabulary cards
create table if not exists public.sat_vocabulary_progress (
  user_id uuid not null references public.profiles(id) on delete cascade,
  vocabulary_id integer not null references public.sat_vocabulary(id) on delete cascade,
  mastery integer not null default 0 check (mastery >= 0 and mastery <= 5),
  last_reviewed_at timestamptz default now(),
  primary key (user_id, vocabulary_id)
);

create index if not exists svp_user_idx on public.sat_vocabulary_progress(user_id);

-- RLS: sat_vocabulary is readable by all authenticated users (static data)
alter table public.sat_vocabulary enable row level security;

create policy "Authenticated users can read SAT vocabulary" on public.sat_vocabulary
  for select using (auth.uid() is not null);

-- RLS: users manage their own progress rows
alter table public.sat_vocabulary_progress enable row level security;

create policy "Users manage own SAT vocabulary progress" on public.sat_vocabulary_progress
  for all using (user_id = auth.uid());


-- ============================================================
-- supabase/migrations/create_score_conversion.sql
-- ============================================================
-- Create score_conversion lookup table
-- Maps (test, section, module1_correct, module2_correct) → scaled_score
-- Both module scores are needed because adaptive routing affects scoring:
-- e.g. 19 right in M1 + 4 right in M2 scores differently than 4 right in M1 + 19 right in M2
-- Run this in the Supabase SQL editor or via the Supabase CLI.

create table if not exists score_conversion (
  id              uuid primary key default gen_random_uuid(),
  test_id         text    not null,
  test_name       text    not null,
  section         text    not null check (section in ('reading_writing', 'math')),
  module1_correct integer not null check (module1_correct >= 0),
  module2_correct integer not null check (module2_correct >= 0),
  scaled_score    integer not null check (scaled_score between 200 and 800),

  constraint score_conversion_unique
    unique (test_id, section, module1_correct, module2_correct)
);

-- Index for fast lookups by test + section + both module scores
create index if not exists idx_score_conversion_lookup
  on score_conversion (test_id, section, module1_correct, module2_correct);


-- ============================================================
-- supabase/migrations/fix_manager_practice_test_visibility.sql
-- ============================================================
-- Fix: Managers cannot view practice test results for their assigned teachers.
-- The pta_select policy on practice_test_attempts only allows the owner or
-- teacher_can_view_student(), which doesn't cover the manager→teacher chain.
-- Similarly, the attempts table has the same gap.
-- This adds manager visibility for both their teachers' own attempts AND
-- their teachers' students' attempts.

-- 1) practice_test_attempts: managers can view attempts by their assigned teachers
--    or by students of their assigned teachers
DROP POLICY IF EXISTS pta_select ON public.practice_test_attempts;
CREATE POLICY pta_select ON public.practice_test_attempts
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.teacher_can_view_student(user_id)
    -- Manager can see their assigned teachers' own attempts
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = practice_test_attempts.user_id
    )
    -- Manager can see attempts by students of their assigned teachers
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      JOIN public.teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = practice_test_attempts.user_id
    )
  );

-- 2) attempts: managers can view question attempts by their assigned teachers
--    or by students of their assigned teachers
DROP POLICY IF EXISTS attempts_select ON public.attempts;
CREATE POLICY attempts_select ON public.attempts
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.teacher_can_view_student(user_id)
    -- Manager can see their assigned teachers' own attempts
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = attempts.user_id
    )
    -- Manager can see attempts by students of their assigned teachers
    OR EXISTS (
      SELECT 1 FROM public.manager_teacher_assignments mta
      JOIN public.teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = attempts.user_id
    )
  );


-- ============================================================
-- supabase/migrations/fix_manager_student_visibility.sql
-- ============================================================
-- Fix: Managers cannot see student profiles, scores, or registrations
-- The profiles_select policy only allowed managers to see their assigned teachers,
-- but not the students of those teachers. The scores/registrations SELECT policies
-- only checked teacher_student_assignments directly, which managers aren't in.
-- This adds the manager→teacher→student chain to all three tables.

-- 1) profiles: managers can see students of their assigned teachers
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR teacher_can_view_student(id)
    OR is_admin()
    -- Manager can see their assigned teachers
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = profiles.id
    )
    -- Manager can see students of their assigned teachers
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      JOIN teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = profiles.id
    )
  );

-- 2) sat_test_registrations: managers can view registrations for their teachers' students
DROP POLICY IF EXISTS "Managers can view assigned student registrations" ON sat_test_registrations;
CREATE POLICY "Managers can view assigned student registrations" ON sat_test_registrations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      JOIN teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = sat_test_registrations.student_id
    )
  );

-- 3) sat_official_scores: managers can view scores for their teachers' students
DROP POLICY IF EXISTS "Managers can view assigned student scores" ON sat_official_scores;
CREATE POLICY "Managers can view assigned student scores" ON sat_official_scores
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      JOIN teacher_student_assignments tsa ON tsa.teacher_id = mta.teacher_id
      WHERE mta.manager_id = auth.uid() AND tsa.student_id = sat_official_scores.student_id
    )
  );


-- ============================================================
-- supabase/migrations/fix_profiles_rls_infinite_recursion.sql
-- ============================================================
-- =========================================================
-- Fix infinite recursion in profiles RLS policy
-- =========================================================
-- Problem: Several RLS policies on other tables directly query the profiles
-- table (e.g., EXISTS (SELECT 1 FROM profiles WHERE ...)), which triggers
-- the profiles_select RLS policy, which in turn queries those tables,
-- causing infinite recursion (PostgreSQL error 42P17).
--
-- Solution: Replace all direct profiles queries in RLS policies with
-- JWT-based checks using auth.jwt() -> 'app_metadata' ->> 'role'.
-- This requires syncing the role from profiles to auth.users.raw_app_meta_data.

-- 1) Sync existing users' roles to JWT app_metadata
UPDATE auth.users u
SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', p.role)
FROM public.profiles p
WHERE u.id = p.id;

-- 2) Keep roles synced via trigger on profiles
CREATE OR REPLACE FUNCTION public.sync_role_to_auth_metadata()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) || jsonb_build_object('role', NEW.role)
  WHERE id = NEW.id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_role_trigger ON public.profiles;
CREATE TRIGGER sync_role_trigger
AFTER INSERT OR UPDATE OF role ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.sync_role_to_auth_metadata();

-- 3) Rewrite is_admin() and is_teacher() to use JWT instead of querying profiles
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin';
$$;

CREATE OR REPLACE FUNCTION public.is_teacher()
RETURNS boolean
LANGUAGE sql STABLE SET search_path = public
AS $$
  SELECT COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin');
$$;

-- 4) Fix manager_teacher_assignments admin policy (was directly querying profiles)
DROP POLICY IF EXISTS "Admins manage all manager-teacher assignments" ON public.manager_teacher_assignments;
CREATE POLICY "Admins manage all manager-teacher assignments"
  ON public.manager_teacher_assignments
  FOR ALL USING (public.is_admin());

-- 5) Fix sat_test_registrations policies (were directly querying profiles)
DROP POLICY IF EXISTS "Teachers can insert registrations for assigned students" ON public.sat_test_registrations;
CREATE POLICY "Teachers can insert registrations for assigned students" ON public.sat_test_registrations
  FOR INSERT WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "Teachers can delete registrations for assigned students" ON public.sat_test_registrations;
CREATE POLICY "Teachers can delete registrations for assigned students" ON public.sat_test_registrations
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

-- 6) Fix sat_official_scores policies (were directly querying profiles)
DROP POLICY IF EXISTS "Teachers can insert scores for assigned students" ON public.sat_official_scores;
CREATE POLICY "Teachers can insert scores for assigned students" ON public.sat_official_scores
  FOR INSERT WITH CHECK (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );

DROP POLICY IF EXISTS "Teachers can delete scores" ON public.sat_official_scores;
CREATE POLICY "Teachers can delete scores" ON public.sat_official_scores
  FOR DELETE USING (
    COALESCE(auth.jwt() -> 'app_metadata' ->> 'role', '') IN ('teacher', 'manager', 'admin')
  );


-- ============================================================
-- supabase/migrations/fix_question_assignments_rls_recursion.sql
-- ============================================================
-- Fix infinite recursion in RLS policies between question_assignments
-- and question_assignment_students. The original policies had direct
-- cross-table subqueries that triggered each other's RLS evaluation.
-- Replace them with SECURITY DEFINER helper functions that bypass RLS.

-- 1. Drop the old policies that cause recursion
drop policy if exists "Teachers manage own assignments" on public.question_assignments;
drop policy if exists "Students view assigned assignments" on public.question_assignments;
drop policy if exists "View assignment students" on public.question_assignment_students;
drop policy if exists "Teachers manage assignment students" on public.question_assignment_students;

-- 2. Create SECURITY DEFINER helpers to break the circular dependency

-- Check if a student is assigned to an assignment (bypasses RLS)
create or replace function public.is_student_assigned(p_assignment_id uuid, p_student_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_assignment_students
    where assignment_id = p_assignment_id and student_id = p_student_id
  );
$$;

-- Check if a teacher owns an assignment (bypasses RLS)
create or replace function public.is_assignment_teacher(p_assignment_id uuid, p_teacher_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.question_assignments
    where id = p_assignment_id and teacher_id = p_teacher_id
  );
$$;

-- 3. Recreate policies using the helper functions

-- Teachers manage their own assignments; admins manage all
create policy "Teachers manage own assignments" on public.question_assignments
  for all using (
    teacher_id = auth.uid()
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Students can view assignments they are assigned to
create policy "Students view assigned assignments" on public.question_assignments
  for select using (
    public.is_student_assigned(id, auth.uid())
  );

-- Students see their own rows; teachers/admins see rows for their assignments
create policy "View assignment students" on public.question_assignment_students
  for select using (
    student_id = auth.uid()
    or public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Teachers and admins can insert/update/delete assignment students
create policy "Teachers manage assignment students" on public.question_assignment_students
  for all using (
    public.is_assignment_teacher(assignment_id, auth.uid())
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );


-- ============================================================
-- supabase/migrations/fix_rls_for_manager_role.sql
-- ============================================================
-- Fix RLS policies for manager role
-- Managers need to: view assigned teacher profiles, manage scores/registrations for their students

-- 1) profiles SELECT: managers need to see their assigned teachers' profiles
DROP POLICY IF EXISTS "profiles_select" ON profiles;
CREATE POLICY "profiles_select" ON profiles
  FOR SELECT USING (
    id = auth.uid()
    OR teacher_can_view_student(id)
    OR is_admin()
    OR EXISTS (
      SELECT 1 FROM manager_teacher_assignments mta
      WHERE mta.manager_id = auth.uid() AND mta.teacher_id = profiles.id
    )
  );

-- 2) sat_official_scores: add 'manager' to teacher role checks
DROP POLICY IF EXISTS "Teachers can insert scores for assigned students" ON sat_official_scores;
CREATE POLICY "Teachers can insert scores for assigned students" ON sat_official_scores
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete scores" ON sat_official_scores;
CREATE POLICY "Teachers can delete scores" ON sat_official_scores
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

-- 3) sat_test_registrations: add 'manager' to teacher role checks
DROP POLICY IF EXISTS "Teachers can insert registrations for assigned students" ON sat_test_registrations;
CREATE POLICY "Teachers can insert registrations for assigned students" ON sat_test_registrations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );

DROP POLICY IF EXISTS "Teachers can delete registrations for assigned students" ON sat_test_registrations;
CREATE POLICY "Teachers can delete registrations for assigned students" ON sat_test_registrations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role IN ('teacher', 'manager', 'admin')
    )
  );


-- ============================================================
-- supabase/migrations/move_is_broken_to_questions.sql
-- ============================================================
-- Move is_broken from per-user question_status to global questions table.
-- This makes the broken flag shared across all users.

-- 1) Add the column to questions
alter table questions
  add column if not exists is_broken boolean not null default false;

-- 2) Migrate existing flags: if ANY user flagged a question as broken, mark it globally
update questions q
set is_broken = true
where exists (
  select 1 from question_status qs
  where qs.question_id = q.id
    and qs.is_broken = true
);

-- 3) (Optional) Drop the per-user column once migration is verified.
-- Uncomment when ready:
-- alter table question_status drop column if exists is_broken;


-- ============================================================
-- supabase/migrations/questions_v2_phase1_schema.sql
-- ============================================================
-- =========================================================
-- Phase 1: Simplified questions schema (questions_v2)
-- =========================================================
-- Creates the new simplified schema alongside existing tables.
-- No existing data is modified. No application code changes yet.
-- Safe to run at any time.

-- ─── Main questions table (flat, no versioning) ────────────
CREATE TABLE IF NOT EXISTS public.questions_v2 (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Content
  question_type text NOT NULL CHECK (question_type IN ('mcq', 'spr')),
  stem_html text NOT NULL,
  stimulus_html text,
  rationale_html text,
  options jsonb,          -- [{label, ordinal, content_html}]
  correct_answer jsonb,   -- {option_label, option_labels, text, number, tolerance}

  -- Taxonomy (inline, no join needed)
  domain_code text,
  domain_name text,
  skill_code text,
  skill_name text,
  difficulty int CHECK (difficulty IS NULL OR difficulty BETWEEN 1 AND 3),
  score_band int CHECK (score_band IS NULL OR score_band BETWEEN 1 AND 7),

  -- Metadata
  source text NOT NULL DEFAULT 'generated'
    CHECK (source IN ('collegeboard', 'generated', 'custom')),
  source_id text,             -- Collegeboard question_id / external ref
  source_external_id text,    -- secondary external ref
  is_published boolean NOT NULL DEFAULT true,
  is_broken boolean NOT NULL DEFAULT false,

  -- Precomputed stats
  attempt_count int NOT NULL DEFAULT 0,
  correct_count int NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_questions_v2_source ON questions_v2(source);
CREATE INDEX IF NOT EXISTS idx_questions_v2_domain ON questions_v2(domain_code);
CREATE INDEX IF NOT EXISTS idx_questions_v2_skill ON questions_v2(skill_code);
CREATE INDEX IF NOT EXISTS idx_questions_v2_difficulty ON questions_v2(difficulty);
CREATE INDEX IF NOT EXISTS idx_questions_v2_score_band ON questions_v2(score_band);
CREATE INDEX IF NOT EXISTS idx_questions_v2_published ON questions_v2(is_published) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_questions_v2_source_id ON questions_v2(source_id) WHERE source_id IS NOT NULL;

-- ─── Mapping table: old question IDs → new question IDs ──
-- Lets us preserve all existing user progress (question_status,
-- attempts, practice_test_module_items) while adopting the new schema.
CREATE TABLE IF NOT EXISTS public.question_id_map (
  old_question_id uuid NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  old_version_id uuid REFERENCES question_versions(id) ON DELETE CASCADE,
  new_question_id uuid NOT NULL REFERENCES questions_v2(id) ON DELETE CASCADE,
  migrated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (old_question_id)
);

CREATE INDEX IF NOT EXISTS idx_question_id_map_new ON question_id_map(new_question_id);
CREATE INDEX IF NOT EXISTS idx_question_id_map_old_version ON question_id_map(old_version_id);

-- ─── RLS policies ─────────────────────────────────────────
ALTER TABLE public.questions_v2 ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read published, non-broken questions
CREATE POLICY "questions_v2_select_all" ON public.questions_v2
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete
CREATE POLICY "questions_v2_admin_all" ON public.questions_v2
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- Mapping table: readable by authenticated users, admin-only writes
ALTER TABLE public.question_id_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "question_id_map_select_all" ON public.question_id_map
  FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "question_id_map_admin_all" ON public.question_id_map
  FOR ALL USING (is_admin()) WITH CHECK (is_admin());

-- ─── Updated_at trigger ───────────────────────────────────
CREATE TRIGGER set_questions_v2_updated_at
  BEFORE UPDATE ON public.questions_v2
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();


-- ============================================================
-- supabase/migrations/questions_v2_phase2_migrate_function.sql
-- ============================================================
-- =========================================================
-- Phase 2: Batch migration function
-- =========================================================
-- Creates a function to migrate existing questions into questions_v2
-- in batches. Safe to run multiple times — only migrates questions
-- that haven't been mapped yet.
--
-- Usage (in Supabase SQL editor):
--   SELECT * FROM migrate_questions_batch(100);  -- migrate next 100
--
-- Returns: (migrated_count int, total_remaining int)

CREATE OR REPLACE FUNCTION public.migrate_questions_batch(batch_size int DEFAULT 100)
RETURNS TABLE (migrated_count int, total_remaining int)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  migrated int := 0;
  remaining int;
  q RECORD;
  v RECORD;
  new_id uuid;
  options_json jsonb;
  correct_json jsonb;
BEGIN
  -- No auth check: this function is only callable via SQL editor
  -- (which requires Supabase project admin access)

  -- Get the next batch of unmigrated questions.
  -- NB: alias the source table as `qs` (not `q`) to avoid colliding with
  -- the declared RECORD variable `q` — PL/pgSQL would otherwise resolve
  -- `q.id` to the (not-yet-assigned) record variable and raise
  -- "record \"q\" is not assigned yet".
  FOR q IN
    SELECT qs.id, qs.question_id AS source_id, qs.source_external_id, qs.is_broken
    FROM questions qs
    LEFT JOIN question_id_map m ON m.old_question_id = qs.id
    WHERE m.old_question_id IS NULL
    ORDER BY qs.id
    LIMIT batch_size
  LOOP
    -- Get the current version for this question
    SELECT qv.id, qv.question_type, qv.stem_html, qv.stimulus_html,
           qv.rationale_html, qv.attempt_count, qv.correct_count
    INTO v
    FROM question_versions qv
    WHERE qv.question_id = q.id AND qv.is_current = true
    LIMIT 1;

    -- Skip if no current version
    IF v.id IS NULL THEN
      CONTINUE;
    END IF;

    -- Build options JSON (for MCQ)
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'label', label,
          'ordinal', ordinal,
          'content_html', content_html
        ) ORDER BY ordinal
      ),
      NULL
    )
    INTO options_json
    FROM answer_options
    WHERE question_version_id = v.id;

    -- Build correct_answer JSON.
    -- Resolve option UUIDs → labels so the new schema is self-contained
    -- (the options jsonb only carries {label, ordinal, content_html} and
    -- does not preserve the old answer_options UUIDs).
    SELECT jsonb_build_object(
      'option_label', (
        SELECT ao.label FROM answer_options ao
        WHERE ao.id = ca.correct_option_id
      ),
      'option_labels', (
        SELECT coalesce(jsonb_agg(ao.label ORDER BY ao.ordinal), NULL)
        FROM answer_options ao
        WHERE ao.id = ANY (ca.correct_option_ids)
      ),
      'text', ca.correct_text,
      'number', ca.correct_number,
      'tolerance', ca.numeric_tolerance
    )
    INTO correct_json
    FROM correct_answers ca
    WHERE ca.question_version_id = v.id
    LIMIT 1;

    -- Insert into questions_v2
    INSERT INTO questions_v2 (
      question_type, stem_html, stimulus_html, rationale_html,
      options, correct_answer,
      domain_code, domain_name, skill_code, skill_name, difficulty, score_band,
      source, source_id, source_external_id,
      is_broken, attempt_count, correct_count
    )
    SELECT
      v.question_type, v.stem_html, v.stimulus_html, v.rationale_html,
      options_json, correct_json,
      t.domain_code, t.domain_name, t.skill_code, t.skill_name, t.difficulty, t.score_band,
      'collegeboard', q.source_id, q.source_external_id,
      q.is_broken, coalesce(v.attempt_count, 0), coalesce(v.correct_count, 0)
    FROM question_taxonomy t
    WHERE t.question_id = q.id
    RETURNING id INTO new_id;

    -- If no taxonomy row existed, insert without taxonomy fields
    IF new_id IS NULL THEN
      INSERT INTO questions_v2 (
        question_type, stem_html, stimulus_html, rationale_html,
        options, correct_answer,
        source, source_id, source_external_id,
        is_broken, attempt_count, correct_count
      ) VALUES (
        v.question_type, v.stem_html, v.stimulus_html, v.rationale_html,
        options_json, correct_json,
        'collegeboard', q.source_id, q.source_external_id,
        q.is_broken, coalesce(v.attempt_count, 0), coalesce(v.correct_count, 0)
      )
      RETURNING id INTO new_id;
    END IF;

    -- Record the mapping
    INSERT INTO question_id_map (old_question_id, old_version_id, new_question_id)
    VALUES (q.id, v.id, new_id);

    migrated := migrated + 1;
  END LOOP;

  -- Count how many questions still need migration.
  -- Same aliasing note as above: use `qs` to avoid colliding with the
  -- declared RECORD variable `q`.
  SELECT COUNT(*) INTO remaining
  FROM questions qs
  LEFT JOIN question_id_map m ON m.old_question_id = qs.id
  WHERE m.old_question_id IS NULL;

  RETURN QUERY SELECT migrated, remaining;
END;
$$;

-- Helper: preview what would be migrated without actually migrating
CREATE OR REPLACE FUNCTION public.migration_status()
RETURNS TABLE (
  total_questions bigint,
  migrated_questions bigint,
  remaining_questions bigint,
  questions_without_current_version bigint
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (SELECT COUNT(*) FROM questions) AS total_questions,
    (SELECT COUNT(*) FROM question_id_map) AS migrated_questions,
    (SELECT COUNT(*) FROM questions q LEFT JOIN question_id_map m ON m.old_question_id = q.id WHERE m.old_question_id IS NULL) AS remaining_questions,
    (SELECT COUNT(*) FROM questions q WHERE NOT EXISTS (SELECT 1 FROM question_versions qv WHERE qv.question_id = q.id AND qv.is_current = true)) AS questions_without_current_version;
$$;

-- =========================================================
-- Backfill: convert legacy correct_answer shape to labels
-- =========================================================
-- The first version of migrate_questions_batch() stored the correct
-- MCQ answer as answer_options UUID(s) under keys `option_id` /
-- `option_ids`.  The options jsonb on questions_v2 only carries
-- {label, ordinal, content_html}, so those UUIDs can't be matched
-- against the options array and the admin preview can't highlight
-- the correct choice.
--
-- This one-shot backfill rewrites any row whose correct_answer still
-- has the old shape into the new shape using `option_label` /
-- `option_labels`, looking up labels in answer_options via the
-- old_version_id preserved in question_id_map.
--
-- Safe to run multiple times: rows that already have `option_label`
-- are skipped.  Returns the number of rows updated.
--
-- Usage:
--   SELECT public.backfill_questions_v2_correct_labels();

CREATE OR REPLACE FUNCTION public.backfill_questions_v2_correct_labels()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  single_label text;
  label_arr jsonb;
  opt_id uuid;
  updated_count int := 0;
BEGIN
  FOR rec IN
    SELECT q2.id AS new_id, q2.correct_answer AS ca, m.old_version_id
    FROM questions_v2 q2
    JOIN question_id_map m ON m.new_question_id = q2.id
    WHERE q2.question_type = 'mcq'
      AND NOT (q2.correct_answer ? 'option_label')
      AND (q2.correct_answer ? 'option_id' OR q2.correct_answer ? 'option_ids')
  LOOP
    single_label := NULL;
    label_arr := NULL;

    -- Resolve a single-answer option_id → label.
    IF jsonb_typeof(rec.ca->'option_id') = 'string' THEN
      BEGIN
        opt_id := (rec.ca->>'option_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        opt_id := NULL;
      END;
      IF opt_id IS NOT NULL THEN
        SELECT ao.label INTO single_label
        FROM answer_options ao
        WHERE ao.question_version_id = rec.old_version_id
          AND ao.id = opt_id
        LIMIT 1;
      END IF;
    END IF;

    -- Resolve a multi-answer option_ids jsonb array → label array.
    IF jsonb_typeof(rec.ca->'option_ids') = 'array' THEN
      SELECT coalesce(jsonb_agg(ao.label ORDER BY ao.ordinal), NULL)
      INTO label_arr
      FROM answer_options ao
      WHERE ao.question_version_id = rec.old_version_id
        AND ao.id IN (
          SELECT (elem)::uuid
          FROM jsonb_array_elements_text(rec.ca->'option_ids') AS elem
        );
    END IF;

    UPDATE questions_v2
    SET correct_answer =
          (correct_answer - 'option_id' - 'option_ids')
          || jsonb_build_object(
               'option_label', single_label,
               'option_labels', label_arr
             )
    WHERE id = rec.new_id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;


-- ============================================================
-- supabase/migrations/questions_v2_phase3_display_code.sql
-- ============================================================
-- =========================================================
-- Phase 3: user-friendly display codes for questions_v2
-- =========================================================
-- Adds a `display_code` column to questions_v2 that gives every
-- question a short, human-readable id such as `M-00153` (Math) or
-- `RW-00042` (Reading & Writing).  Format:  <prefix>-<5-digit zero-
-- padded sequence>.  5 digits means up to 99,999 questions per
-- section.
--
-- Prefix is derived from the SAT domain code already stored in
-- questions_v2.domain_code.  The same mapping is used throughout the
-- app (see app/practice/[questionId]/page.js, app/dashboard/*).
--
--   Math  ('H','P','S','Q')         → M
--   R & W ('EOI','INI','CAS','SEC') → RW
--
-- Numbers are handed out by two Postgres sequences so inserts are
-- atomic and race-free.  A BEFORE INSERT trigger populates
-- display_code on every new row (unless the caller already set one),
-- so migrate_questions_batch() does NOT need to change.  A separate
-- helper function backfills any rows that already exist.
--
-- Safe to run multiple times.  After running this file, call:
--   SELECT public.backfill_questions_v2_display_codes();
-- to assign codes to rows migrated under phase 2.

-- ─── 1. Column ────────────────────────────────────────────
ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS display_code text;

COMMENT ON COLUMN public.questions_v2.display_code IS
  'User-friendly id in the form <M|RW>-NNNNN (e.g. M-00153). Unique, assigned automatically on insert via a BEFORE INSERT trigger.';

-- ─── 2. Per-section sequences ─────────────────────────────
-- int is 2^31-1 ≈ 2.1 billion, comfortably more than the 99,999
-- ceiling implied by the 5-digit format.
CREATE SEQUENCE IF NOT EXISTS public.questions_v2_math_seq AS int START WITH 1 MINVALUE 1;
CREATE SEQUENCE IF NOT EXISTS public.questions_v2_rw_seq   AS int START WITH 1 MINVALUE 1;

-- ─── 3. Helper: domain_code → section prefix ──────────────
CREATE OR REPLACE FUNCTION public.questions_v2_section_prefix(domain_code text)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE upper(coalesce(domain_code, ''))
    WHEN 'H'   THEN 'M'
    WHEN 'P'   THEN 'M'
    WHEN 'S'   THEN 'M'
    WHEN 'Q'   THEN 'M'
    WHEN 'EOI' THEN 'RW'
    WHEN 'INI' THEN 'RW'
    WHEN 'CAS' THEN 'RW'
    WHEN 'SEC' THEN 'RW'
    ELSE NULL
  END;
$$;

-- ─── 4. BEFORE INSERT trigger ─────────────────────────────
-- Populates NEW.display_code if it's NULL. Questions with no
-- recognised section prefix (e.g. domain_code is NULL) are left
-- with display_code = NULL and can be backfilled later once the
-- taxonomy is set.
CREATE OR REPLACE FUNCTION public.questions_v2_set_display_code()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  prefix text;
  num int;
BEGIN
  IF NEW.display_code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  prefix := public.questions_v2_section_prefix(NEW.domain_code);
  IF prefix IS NULL THEN
    RETURN NEW;
  END IF;

  IF prefix = 'M' THEN
    num := nextval('public.questions_v2_math_seq');
  ELSIF prefix = 'RW' THEN
    num := nextval('public.questions_v2_rw_seq');
  ELSE
    RETURN NEW;
  END IF;

  NEW.display_code := prefix || '-' || lpad(num::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_questions_v2_set_display_code ON public.questions_v2;
CREATE TRIGGER trg_questions_v2_set_display_code
  BEFORE INSERT ON public.questions_v2
  FOR EACH ROW
  EXECUTE FUNCTION public.questions_v2_set_display_code();

-- ─── 5. Backfill existing rows ────────────────────────────
-- Rows migrated under phase 2 pre-date the trigger, so their
-- display_code is NULL.  Assign codes in created_at order (then id
-- as a tiebreaker) so the numbering tracks migration order.
-- Idempotent: rows that already have a display_code are skipped.
CREATE OR REPLACE FUNCTION public.backfill_questions_v2_display_codes()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  rec RECORD;
  prefix text;
  num int;
  updated_count int := 0;
BEGIN
  FOR rec IN
    SELECT id, domain_code
    FROM questions_v2
    WHERE display_code IS NULL
      AND questions_v2_section_prefix(domain_code) IS NOT NULL
    ORDER BY created_at, id
  LOOP
    prefix := questions_v2_section_prefix(rec.domain_code);
    IF prefix = 'M' THEN
      num := nextval('questions_v2_math_seq');
    ELSIF prefix = 'RW' THEN
      num := nextval('questions_v2_rw_seq');
    ELSE
      CONTINUE;
    END IF;

    UPDATE questions_v2
    SET display_code = prefix || '-' || lpad(num::text, 5, '0')
    WHERE id = rec.id;

    updated_count := updated_count + 1;
  END LOOP;

  RETURN updated_count;
END;
$$;

-- ─── 6. Uniqueness and lookup index ───────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_questions_v2_display_code_unique
  ON public.questions_v2 (display_code)
  WHERE display_code IS NOT NULL;


-- ============================================================
-- supabase/migrations/questions_v2_phase4_fix_audit.sql
-- ============================================================
-- =========================================================
-- Phase 4: Claude-fix audit columns for questions_v2
-- =========================================================
-- Adds two audit columns used by the "Fix with Claude" flow in the
-- admin Questions V2 Preview tab:
--
--   last_fixed_at  timestamptz  -- when Claude-cleaned HTML was saved
--   last_fixed_by  uuid         -- which admin saved it (→ auth.users)
--
-- Both are nullable.  A partial index on last_fixed_at IS NULL lets
-- the preview efficiently surface the backlog of unfixed questions.
--
-- Safe to run multiple times.

ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS last_fixed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_fixed_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.questions_v2.last_fixed_at IS
  'Timestamp of the most recent Claude-driven HTML cleanup saved for this row.';
COMMENT ON COLUMN public.questions_v2.last_fixed_by IS
  'auth.users.id of the admin who saved the most recent Claude-driven HTML cleanup.';

-- Partial index: fast "unfixed first" ordering in the admin preview.
CREATE INDEX IF NOT EXISTS idx_questions_v2_unfixed
  ON public.questions_v2 (created_at)
  WHERE last_fixed_at IS NULL;


-- ============================================================
-- supabase/migrations/questions_v2_phase5_approval.sql
-- ============================================================
-- =========================================================
-- Phase 5: approval audit columns for questions_v2
-- =========================================================
-- Adds two audit columns the admin Questions V2 Preview tab uses to
-- track which questions have been reviewed and signed off:
--
--   approved_at  timestamptz  -- when the admin approved this row
--   approved_by  uuid         -- which admin approved it (→ auth.users)
--
-- Both are nullable; NULL means "not approved yet".  The preview
-- defaults to showing ONLY unapproved rows so admins can work
-- through a shrinking backlog, and exposes a counter of approved
-- rows at the top of the page.
--
-- Safe to run multiple times.

ALTER TABLE public.questions_v2
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

COMMENT ON COLUMN public.questions_v2.approved_at IS
  'Timestamp of the most recent admin approval for this row. NULL = not approved.';
COMMENT ON COLUMN public.questions_v2.approved_by IS
  'auth.users.id of the admin who approved this row.';

-- Partial index so the preview can efficiently list unapproved rows
-- in display_code order (the default view).
CREATE INDEX IF NOT EXISTS idx_questions_v2_unapproved
  ON public.questions_v2 (display_code)
  WHERE approved_at IS NULL;

