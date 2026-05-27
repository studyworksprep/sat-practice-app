-- sat_test_registrations.test_date,
-- question_assignments.due_date,
-- lesson_assignments.due_date: timestamptz → date
--
-- Same fix as 20260517000002 (assignments_v2.due_date). These three
-- columns are calendar dates that were declared as timestamptz. The
-- input is a bare YYYY-MM-DD from an <input type="date"> and the
-- output is supposed to be the same calendar day. The timestamptz
-- type smuggles a "time" component (different paths landed on either
-- 00:00:00+00 or 08:00:00+00), and Supabase returns the column as an
-- ISO string with that suffix. lib/formatters.js parseLocalOrIso()
-- only special-cases bare YYYY-MM-DD, so the suffixed value falls
-- through to `new Date(iso)` → toLocaleDateString(), which renders
-- the previous day for any viewer west of UTC. The bug is most
-- visible for sat_test_registrations: a tutor enters "June 6" and
-- the student page shows "June 5".
--
-- The clean fix is to make the column type match the meaning. As a
-- `date`, Supabase returns bare "2026-06-06", which the helper
-- renders correctly as local midnight with no timezone shift.
--
-- Safety check before applying (verified on prod):
--   sat_test_registrations.test_date  — 31/31 non-null; 28 stored at
--     08:00:00+00, 3 at 00:00:00+00. (col AT TIME ZONE 'UTC')::date
--     preserves the calendar date the tutor originally entered for
--     every row.
--   question_assignments.due_date     — 97/97 non-null at 00:00:00+00.
--   lesson_assignments.due_date       — 0 rows.

alter table public.sat_test_registrations
  alter column test_date type date
  using (test_date at time zone 'UTC')::date;

alter table public.question_assignments
  alter column due_date type date
  using (due_date at time zone 'UTC')::date;

alter table public.lesson_assignments
  alter column due_date type date
  using (due_date at time zone 'UTC')::date;
