-- =========================================================
-- Drop the v1-questions FK on question_notes
-- =========================================================
-- See migration 20260514000000 for the precedent on the other
-- shared notes tables (student_notes, question_error_notes,
-- desmos_saved_states). That migration loosened their FKs from
-- questions_v2 to support both SAT (questions_v2) and ACT
-- (act_questions) rows under a single `test_type` discriminator.
--
-- question_notes was the odd one out: its question_id FK still
-- pointed at the legacy v1 public.questions table. The new tree
-- (lib/practice/QuestionNotes.jsx + question-notes-actions.ts)
-- writes v2 question UUIDs, which do not appear in v1 (the two
-- tables have entirely disjoint id sets), so every insert from
-- the new tree fails with question_notes_question_id_fkey.
--
-- Drop the FK. Integrity now lives in the loader / write-action
-- layer, branched on test_type — same model the other three
-- notes-like tables adopted in 20260514000000.
--
-- We deliberately do NOT rewrite the existing rows from v1 ids to
-- v2 ids: the legacy tree (app/teacher, app/practice) still queries
-- question_notes by the v1 id it has in hand, and rewriting would
-- silently empty those panels until the legacy surfaces are
-- retired. A follow-up that bridges the two id namespaces in
-- lib/practice/load-question-notes.js (via question_id_map) can
-- unify the views without a destructive data migration.

alter table public.question_notes
  drop constraint if exists question_notes_question_id_fkey;

comment on column public.question_notes.question_id is
  'UUID of the question the note is attached to. Resolves against questions_v2 when test_type=''sat'' and the row was written by the new tree, questions (legacy v1) for rows written by the legacy tree, or act_questions when test_type=''act''. FK dropped in 20260515000001; integrity lives in the loader / write-action layer.';

comment on column public.question_notes.test_type is
  'Test the tutor is annotating. sat (questions_v2 in the new tree, legacy v1 questions for older rows) or act (act_questions).';
