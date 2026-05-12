-- Backfill assignment_students_v2.completed_at for practice-test
-- assignments completed before the auto-completion hook was added
-- in /next.
--
-- Until now, only question-assignment completions ran through
-- markAssignmentCompletedIfDone (lib/practice/session-actions.ts).
-- Practice-test assignments had no equivalent path, so every student
-- who finished a Bluebook-style practice test that was assigned to
-- them ended up with status='completed' on the attempt but
-- completed_at IS NULL on the assignment_students_v2 junction.
-- That meant practice-test assignments never appeared in the
-- student's "Recently finished" strip or the tutor's
-- recent-completions panel even though the work was clearly done.
--
-- Stamp completed_at = max(matching attempt's finished_at) for every
-- (student, assignment) pair where:
--   - the assignment is type='practice_test' and not deleted
--   - the student has at least one completed practice_test_attempts_v2
--     row for the assigned practice_test_id
--   - completed_at on the junction row is still NULL
--
-- Idempotent — re-running the migration is a no-op once the rows
-- are filled. RLS doesn't apply at migration time (we run as the
-- service role), so this updates everyone's history in one pass.

update public.assignment_students_v2 as as_v2
set completed_at = sub.latest_finished_at
from (
  select
    s.assignment_id,
    s.student_id,
    max(pta.finished_at) as latest_finished_at
  from public.assignment_students_v2 s
  join public.assignments_v2 a
    on a.id = s.assignment_id
   and a.assignment_type = 'practice_test'
   and a.deleted_at is null
  join public.practice_test_attempts_v2 pta
    on pta.user_id = s.student_id
   and pta.practice_test_id = a.practice_test_id
   and pta.status = 'completed'
   and pta.finished_at is not null
  where s.completed_at is null
  group by s.assignment_id, s.student_id
) sub
where as_v2.assignment_id = sub.assignment_id
  and as_v2.student_id    = sub.student_id
  and as_v2.completed_at  is null;
