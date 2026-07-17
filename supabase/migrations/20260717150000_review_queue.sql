-- =========================================================
-- review_queue — spaced repetition, for real (upgrade plan §3.1)
-- =========================================================
-- One due-date-scheduled queue per student, unifying what already
-- exists: wrong answers enqueue question reviews (the weak-queue's
-- priority logic becomes the *intake* policy), "decayed" coverage
-- states (§1.3) enqueue skill-level micro-drills, and flashcard
-- ratings migrate from weighted-random to due-date scheduling.
-- Plan tasks of type 'review' (§2.x) draw from this queue, which
-- also gives them their automatic completion path (the review
-- session stamps plan_task_id like any other session).
--
-- Scheduling state is SM-2-lite (lib/review/schedule.ts is the one
-- home for the math): interval_days grows with ease on success,
-- resets on a lapse; due_at = last review + interval.
--
-- item_ref is text, not a FK: it holds a questions_v2 uuid for
-- 'question', a curriculum skill_code for 'skill', a flashcards
-- uuid for 'flashcard', and a sat_vocabulary id for 'vocab'
-- (reserved — no runtime vocab path exists yet). The app layer
-- owns referential cleanup (e.g. deleting a flashcard deletes its
-- queue row).

create table if not exists public.review_queue (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references auth.users(id) on delete cascade,
  item_type        text not null check (item_type in ('question', 'skill', 'flashcard', 'vocab')),
  item_ref         text not null,
  due_at           timestamptz not null default now(),
  interval_days    numeric not null default 1 check (interval_days > 0),
  ease             numeric not null default 2.5 check (ease >= 1.3 and ease <= 3.0),
  lapses           integer not null default 0 check (lapses >= 0),
  last_result      text check (last_result in ('again', 'good', 'easy')),
  last_reviewed_at timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, item_type, item_ref)
);

comment on table public.review_queue is
  'Per-student spaced-repetition queue (§3.1). SM-2-lite scheduling '
  'state per item; item_ref meaning depends on item_type (question '
  'uuid / skill_code / flashcard uuid / vocab id). Intake: wrong '
  'answers, decayed coverage, flashcard ratings. Consumed by plan '
  'review tasks and the Review hub.';

-- The hot query is "this student''s due items, oldest due first."
create index if not exists review_queue_student_due_idx
  on public.review_queue (student_id, due_at);

drop trigger if exists trg_review_queue_updated_at on public.review_queue;
create trigger trg_review_queue_updated_at
  before update on public.review_queue
  for each row execute function public.set_updated_at();

-- ── RLS ────────────────────────────────────────────────────────────
-- Same gate as study_plans: student-owned, tutor-visible. can_view()
-- covers the student themselves and their tutor/manager/admin — the
-- tutor cockpit (Phase 4) reads queue state, and a tutor clearing a
-- stale item for a student is legitimate management.

alter table public.review_queue enable row level security;
drop policy if exists review_queue_select on public.review_queue;
drop policy if exists review_queue_insert on public.review_queue;
drop policy if exists review_queue_update on public.review_queue;
drop policy if exists review_queue_delete on public.review_queue;

create policy review_queue_select on public.review_queue
  for select to authenticated using (public.can_view(student_id));
create policy review_queue_insert on public.review_queue
  for insert to authenticated with check (public.can_view(student_id));
create policy review_queue_update on public.review_queue
  for update to authenticated using (public.can_view(student_id)) with check (public.can_view(student_id));
create policy review_queue_delete on public.review_queue
  for delete to authenticated using (public.can_view(student_id));

grant select, insert, update, delete on public.review_queue to authenticated;
grant all on public.review_queue to service_role;
