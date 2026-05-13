-- =========================================================
-- Add test_type to shared tables for ACT integration (Phase 2)
-- =========================================================
-- See docs/architecture-plan.md §3.4 "Cross-test data model."
--
-- The next tree unifies SAT and ACT under shared URLs and shared
-- pages. The fork lives at the loader/write-action layer; tables
-- stay separate where shapes genuinely differ (questions, attempts,
-- answer options) and gain a `test_type` discriminator where they're
-- shared (sessions, notes, error log, Desmos states, assignments).
--
-- This migration adds the column only — zero behavior change, since
-- the NOT NULL DEFAULT 'sat' backfills every existing row to SAT,
-- and there are no ACT writers yet. Reader audits and write-side
-- stamping land in later PRs (see audit-greppability paragraph in
-- §3.4).
--
-- Tables that gain test_type here:
--   - student_notes              (student rich-text /notes hub)
--   - question_notes             (tutor-authored annotations)
--   - question_error_notes       (student "why I got this wrong")
--   - desmos_saved_states        (per-question calculator state)
--   - assignments_v2             (tutor-created assignments)
--   - assignment_students_v2     (junction; denormalized for query speed)
--
-- practice_sessions already carries test_type (see migration
-- 20240101000003); it is the canonical reference shape.
--
-- FKs are not changed in this migration. The FKs on
-- student_notes.question_id, question_error_notes.question_id, and
-- desmos_saved_states.question_id all point at questions_v2 today —
-- they will need loosening (drop, or replace with a runtime check)
-- when the first ACT row is written. Until then, the FKs keep
-- working for SAT inserts exactly as before.

alter table public.student_notes
  add column if not exists test_type text not null
    default 'sat'
    check (test_type in ('sat', 'act'));

alter table public.question_notes
  add column if not exists test_type text not null
    default 'sat'
    check (test_type in ('sat', 'act'));

alter table public.question_error_notes
  add column if not exists test_type text not null
    default 'sat'
    check (test_type in ('sat', 'act'));

alter table public.desmos_saved_states
  add column if not exists test_type text not null
    default 'sat'
    check (test_type in ('sat', 'act'));

alter table public.assignments_v2
  add column if not exists test_type text not null
    default 'sat'
    check (test_type in ('sat', 'act'));

alter table public.assignment_students_v2
  add column if not exists test_type text not null
    default 'sat'
    check (test_type in ('sat', 'act'));

-- Per-table notes. No data changes; the defaults backfill every
-- existing row to 'sat'.

comment on column public.student_notes.test_type is
  'Test the question_id belongs to. sat (questions_v2) or act (act_questions). FK on question_id still points at questions_v2 today; will be loosened when ACT writes land.';

comment on column public.question_notes.test_type is
  'Test the tutor is annotating. sat (questions, legacy v1) or act (act_questions).';

comment on column public.question_error_notes.test_type is
  'Test the question_id belongs to. FK still points at questions_v2; loosen on first ACT write.';

comment on column public.desmos_saved_states.test_type is
  'Test the question_id belongs to. ACT math accepts calculators; ACT reading/english/science do not.';

comment on column public.assignments_v2.test_type is
  'Test the assignment targets. When ACT assignments ship, the existing polymorphic target_type (questions | lesson | practice_test) is reused with this column distinguishing the two test types.';

comment on column public.assignment_students_v2.test_type is
  'Denormalized from assignments_v2 for query speed — students asking "what is pending?" can filter by test_type without joining.';
