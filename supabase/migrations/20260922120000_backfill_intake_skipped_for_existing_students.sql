-- Backfill: mark the onboarding intake as set aside for students who
-- predate it (docs/student-onboarding-and-plan-redesign-2026-09.md §3.1).
--
-- The intake wizard shipped 2026-09-15 with an empty student_intake
-- table and a login gate of "no active plan AND no completed/skipped
-- intake". Every account created before that date with no plan matched
-- the gate exactly like a fresh signup and was bounced into the wizard
-- on its next login. The code gate now also requires no practice
-- history; this backfill closes the gap for existing accounts that
-- have never practiced (and makes the fix independent of the code
-- deploy for everyone else).
--
-- Inserts a bare row with skipped_at only where no row exists. Rows
-- created by students who already tapped through the welcome screen
-- are left alone: they resume the wizard, or their practice history
-- keeps them off it. Idempotent. Reversible with:
--   delete from public.student_intake
--   where skipped_at = '2026-09-22T12:00:00Z'::timestamptz;

insert into public.student_intake (student_id, skipped_at)
select p.id, '2026-09-22T12:00:00Z'::timestamptz
from public.profiles p
where p.role = 'student'
  and p.created_at < '2026-09-15T00:00:00Z'
  and not exists (
    select 1 from public.study_plans sp
    where sp.student_id = p.id and sp.status = 'active'
  )
  and not exists (
    select 1 from public.student_intake si where si.student_id = p.id
  );
