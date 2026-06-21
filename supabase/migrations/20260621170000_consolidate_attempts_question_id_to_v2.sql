-- Stage E-4: consolidate attempts.question_id onto v2 ids.
--
-- attempts.question_id has been bimodal since the v1→v2 question
-- migration: 14,004 rows (71%) hold a v1 question_id, 5,666 rows
-- (29%) hold a v2 question_id. The mix forced every read path
-- that joins attempts → questions_v2 to first walk question_id_map
-- and widen the IN list with v1 counterparts (resolveLegacyQuestionIds,
-- expandToAttemptIds, resolveQuestionV2Meta). Several DB functions
-- encode the same union at the SQL level.
--
-- This migration normalizes the column: every v1 id is rewritten
-- to its v2 counterpart. After this, attempts is exclusively
-- v2-keyed; the translation helpers become no-ops (and can be
-- removed in follow-up commits along with the surfaces that still
-- carry v1 ids — assignments_v2.question_ids,
-- question_concept_tags.question_id).
--
-- Safety:
--   * question_id_map has a 1:1 row for every v1 question (3,428 /
--     3,428), so 0 attempts rows are left unmapped.
--   * attempts.question_id carries no FK, so the UPDATE has no
--     constraint reorganization to do.
--   * 0 orphan rows (every attempts.question_id resolves to either
--     v1 or v2) — nothing is silently dropped.
--   * The v1 ids are preserved in question_id_map.old_question_id,
--     so the operation is reversible in case of recovery.
--   * ACT lives in act_attempts (separate table); this migration
--     touches only the SAT attempts table.

update public.attempts a
set question_id = m.new_question_id
from public.question_id_map m
where a.question_id = m.old_question_id;
