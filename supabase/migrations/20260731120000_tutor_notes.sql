-- =========================================================
-- tutor_notes — session notes for the tutor cockpit (upgrade plan §4.1)
-- =========================================================
-- Tutor-authored, student-scoped notes. Two jobs:
--   1. The "note" quick action on the session workspace — the running
--      record a tutor keeps about a student ("worked transitions,
--      still shaky on comma splices; bring quadratics Friday").
--   2. The session log: each note stamps session_at, and the prep
--      card's "since last session" window is anchored to the most
--      recent note for that (tutor, student) pair. Writing the
--      wrap-up note IS ending the session — no separate log table.
--
-- Deliberately not: the student's own notebook (student_notes,
-- owner-only RLS) or question annotations (question_notes,
-- question-scoped). This is the first tutor→student channel.
--
-- Visibility: staff only. can_view() alone would include the student
-- (it covers self); these are the tutor's private working notes, so
-- every policy requires is_teacher() too. A manager/admin with
-- transitive can_view reads their tutors' notes — that's the Phase 5
-- coaching surface reading the same table, not a leak.

create table if not exists public.tutor_notes (
  id         uuid primary key default gen_random_uuid(),
  student_id uuid not null references auth.users(id) on delete cascade,
  author_id  uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 8000),
  session_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tutor_notes is
  'Tutor-authored session notes about a student (§4.1). Staff-only '
  'visibility (is_teacher + can_view); the newest session_at per '
  'student anchors the prep card''s since-last-session window.';

-- Hot query: "this student''s notes, newest session first."
create index if not exists tutor_notes_student_session_idx
  on public.tutor_notes (student_id, session_at desc);

drop trigger if exists trg_tutor_notes_updated_at on public.tutor_notes;
create trigger trg_tutor_notes_updated_at
  before update on public.tutor_notes
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────

alter table public.tutor_notes enable row level security;
drop policy if exists tutor_notes_select on public.tutor_notes;
drop policy if exists tutor_notes_insert on public.tutor_notes;
drop policy if exists tutor_notes_update on public.tutor_notes;
drop policy if exists tutor_notes_delete on public.tutor_notes;

create policy tutor_notes_select on public.tutor_notes
  for select to authenticated
  using (is_teacher() and public.can_view(student_id));
create policy tutor_notes_insert on public.tutor_notes
  for insert to authenticated
  with check (is_teacher() and public.can_view(student_id) and author_id = auth.uid());
create policy tutor_notes_update on public.tutor_notes
  for update to authenticated
  using (author_id = auth.uid() or is_admin())
  with check (author_id = auth.uid() or is_admin());
create policy tutor_notes_delete on public.tutor_notes
  for delete to authenticated
  using (author_id = auth.uid() or is_admin());

grant select, insert, update, delete on public.tutor_notes to authenticated;
grant all on public.tutor_notes to service_role;
