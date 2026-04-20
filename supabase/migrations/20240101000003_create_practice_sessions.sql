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
