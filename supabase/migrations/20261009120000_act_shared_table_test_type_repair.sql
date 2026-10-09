-- =========================================================
-- Repair test_type on shared-table rows keyed to ACT questions
-- =========================================================
-- The error-log, Desmos saved-state and tutor question-note write
-- actions stamped test_type = 'sat' unconditionally, while every
-- reader filters on the session's actual test type. A note saved
-- on an ACT question therefore vanished on reload. The writers now
-- derive the type from the question id (lib/practice/
-- question-test-type.ts); this one-off corrects the rows written
-- before that fix. Idempotent — re-running is a no-op.
--
-- Production census at authoring time (2026-10-09): 1 row in
-- question_error_notes, 0 in desmos_saved_states, 0 in
-- question_notes.

update public.question_error_notes n
   set test_type = 'act'
 where n.test_type = 'sat'
   and exists (select 1 from public.act_questions a where a.id = n.question_id);

update public.desmos_saved_states d
   set test_type = 'act'
 where d.test_type = 'sat'
   and exists (select 1 from public.act_questions a where a.id = d.question_id);

update public.question_notes q
   set test_type = 'act'
 where q.test_type = 'sat'
   and exists (select 1 from public.act_questions a where a.id = q.question_id);
