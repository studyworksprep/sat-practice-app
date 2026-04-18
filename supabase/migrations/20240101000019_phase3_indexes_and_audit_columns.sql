-- Phase 3 — schema simplification: indexes + audit columns.
--
-- #6: Add missing indexes for common query patterns.
-- #5: question_availability is legacy-only (one API route);
--     marked for Phase 6 deletion, no action here.
-- #4: Standardize audit columns on v2 tables.

-- ============================================================
-- #6 — Missing indexes
-- ============================================================

-- profiles.role: admin pages frequently filter by role
-- (e.g., dropdown of all teachers, list of students).
create index if not exists idx_profiles_role
  on public.profiles (role);

-- attempts(user_id, question_id): the practice question page
-- checks "has this user already answered this question" on every
-- render. The existing indexes are (user_id, created_at) and
-- (question_id) separately — a composite is more efficient.
create index if not exists idx_attempts_user_question
  on public.attempts (user_id, question_id);

-- question_status(question_id): the unanswered filter and the
-- performance aggregation both look up by question_id. PK is
-- (user_id, question_id) which only helps when user_id is known.
create index if not exists idx_question_status_question
  on public.question_status (question_id);

-- ============================================================
-- #4 — Audit columns on v2 content tables
-- ============================================================

-- practice_tests_v2: add updated_at + created_by + updated_by.
-- deleted_at already exists.
alter table public.practice_tests_v2
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists created_by  uuid,
  add column if not exists updated_by  uuid;

-- practice_test_modules_v2: add updated_at + created_by + updated_by.
alter table public.practice_test_modules_v2
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists created_by  uuid,
  add column if not exists updated_by  uuid;

-- practice_test_module_items_v2: same.
alter table public.practice_test_module_items_v2
  add column if not exists updated_at  timestamptz not null default now(),
  add column if not exists created_by  uuid,
  add column if not exists updated_by  uuid;

-- questions_v2 already has created_at + updated_at. Add the
-- "by" columns and deleted_at for soft-delete.
alter table public.questions_v2
  add column if not exists created_by  uuid,
  add column if not exists updated_by  uuid,
  add column if not exists deleted_at  timestamptz;

-- User-data tables (practice_test_attempts_v2, module_attempts,
-- item_attempts) intentionally skip created_by/updated_by — the
-- user_id column already identifies who created the row, and
-- updates are always by the same user. Keeping them lean.

-- ============================================================
-- Auto-set updated_at on row change via a shared trigger function.
-- Re-use set_updated_at() if it already exists; create if not.
-- ============================================================

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Apply the trigger to tables that now have updated_at.
create or replace trigger trg_practice_tests_v2_updated_at
  before update on public.practice_tests_v2
  for each row execute function set_updated_at();

create or replace trigger trg_practice_test_modules_v2_updated_at
  before update on public.practice_test_modules_v2
  for each row execute function set_updated_at();

create or replace trigger trg_practice_test_module_items_v2_updated_at
  before update on public.practice_test_module_items_v2
  for each row execute function set_updated_at();

-- questions_v2 already has updated_at but may not have the trigger.
create or replace trigger trg_questions_v2_updated_at
  before update on public.questions_v2
  for each row execute function set_updated_at();
