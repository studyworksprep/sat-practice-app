-- =========================================================
-- Drop FKs to questions_v2 on shared tables (Phase 2 PR 4)
-- =========================================================
-- See docs/architecture-plan.md §3.4 "Cross-test data model."
--
-- The shared tables (student_notes, question_error_notes,
-- desmos_saved_states) carry a `test_type` discriminator added in
-- migration 20260513000000. The discriminator now tells readers
-- which questions table to join against — questions_v2 for SAT
-- rows, act_questions for ACT rows.
--
-- The legacy FK constraint pointed every question_id at
-- questions_v2.id. That constraint blocks any insert with an
-- act_questions UUID, which is exactly what PR 4 needs to start
-- enabling. Drop the FK; the application layer (loaders and write
-- actions) is the new source of integrity, branched on test_type.
--
-- A future hardening pass could add a row-level CHECK trigger that
-- validates the question_id against the right table per test_type,
-- but that's a database-level guard with a write-side cost; the
-- audit (PR 3) already enforces the read-side contract, and the
-- write-side is funneled through a small set of stamping mutations
-- (PR 2). The cost of the FK loosening is the loss of cascade
-- semantics on questions_v2 deletion — questions are soft-deleted
-- via deleted_at rather than hard-deleted, so cascade was rarely
-- exercised in practice.

alter table public.student_notes
  drop constraint if exists student_notes_question_id_fkey;

alter table public.question_error_notes
  drop constraint if exists question_error_notes_question_id_fkey;

alter table public.desmos_saved_states
  drop constraint if exists desmos_saved_states_question_id_fkey;

comment on column public.student_notes.question_id is
  'UUID of the question the note is attached to. Resolves against questions_v2 when test_type=''sat'', act_questions when test_type=''act''. FK was dropped in 20260514000000 to support both targets; integrity lives in the loader/write-action layer.';

comment on column public.question_error_notes.question_id is
  'UUID of the question this error-log entry is for. Same dual-target resolution as student_notes.question_id (see column comment). FK dropped in 20260514000000.';

comment on column public.desmos_saved_states.question_id is
  'UUID of the math question whose Desmos calculator state is saved. Same dual-target resolution as student_notes.question_id. FK dropped in 20260514000000.';
