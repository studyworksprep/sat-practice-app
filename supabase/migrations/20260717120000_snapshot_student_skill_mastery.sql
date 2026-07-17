-- =========================================================
-- snapshot_student_skill_mastery — on-demand, single-student (§6.4)
-- =========================================================
-- The nightly job snapshots every student (snapshot_all_skill_mastery,
-- service-role only). The first-run wizard needs mastery to be CURRENT
-- the moment a student finishes their diagnostic, so the plan generated
-- seconds later reflects what they just got right and wrong — waiting
-- for the nightly job would hand every new student a mastery-blind
-- first plan. This is the same upsert as one iteration of the nightly
-- loop, exposed per-student.
--
-- SECURITY DEFINER because skill_mastery_snapshots has no
-- student-write RLS (snapshots are system-written), with an explicit
-- guard: a student may refresh their own snapshot; staff may refresh
-- any student they can_view. Uses the same get_skill_mastery_asof
-- compute path as the nightly job, so the two can never disagree.

create or replace function public.snapshot_student_skill_mastery(
  p_student   uuid,
  p_asof      date default current_date,
  p_test_type text default 'sat'
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  if auth.uid() is null or not (p_student = auth.uid() or public.can_view(p_student)) then
    raise exception 'Not allowed to snapshot this student';
  end if;

  insert into public.skill_mastery_snapshots
    (student_id, test_type, domain_code, skill_code, snapshot_date,
     mastery, attempts_count, correct_count, avg_difficulty)
  select
    p_student, m.test_type, m.domain_code, m.skill_code, p_asof,
    m.mastery, m.attempts_count, m.correct_count, m.avg_difficulty
  from public.get_skill_mastery_asof(p_student, p_asof, p_test_type) m
  on conflict (student_id, test_type, domain_code, skill_code, snapshot_date)
  do update set
    mastery        = excluded.mastery,
    attempts_count = excluded.attempts_count,
    correct_count  = excluded.correct_count,
    avg_difficulty = excluded.avg_difficulty;
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

comment on function public.snapshot_student_skill_mastery(uuid, date, text) is
  'Refresh one student''s skill-mastery snapshot on demand (§6.4 first-run '
  'wizard: diagnostic -> snapshot -> generate plan). Same compute path as '
  'the nightly snapshot_all_skill_mastery. Caller must be the student or '
  'staff with can_view.';

revoke execute on function public.snapshot_student_skill_mastery(uuid, date, text) from public;
grant execute on function public.snapshot_student_skill_mastery(uuid, date, text) to authenticated;
grant execute on function public.snapshot_student_skill_mastery(uuid, date, text) to service_role;
