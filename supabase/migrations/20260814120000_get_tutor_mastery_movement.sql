-- =========================================================
-- get_tutor_mastery_movement — per-tutor mastery movement (§5.2)
-- =========================================================
-- The manager layer's effectiveness signal: for each tutor, how much
-- did their rostered students' mastery move over the window? The
-- orthogonal cut to get_roster_skill_trend (which aggregates per skill
-- across a roster): here the unit is the tutor, aggregating per-student
-- movement across their teacher_student_assignments roster.
--
-- Same skeleton as get_roster_skill_trend: a set-wise wrapper over
-- get_skill_mastery_asof evaluated at today and today - p_days, so the
-- signal is live from attempts (the nightly snapshot job still hasn't
-- landed) and the mastery math keeps its one home.
--
-- Only (student, skill) pairs that saw NEW first-attempts inside the
-- window count (attempts_count grew) — otherwise every untouched skill
-- contributes a zero delta and dilutes the tutor average toward 0.
-- A student first touching a skill inside the window counts as
-- movement from 0, matching get_roster_skill_trend's convention.
-- avg_mastery_now is the average over those same worked skills, not
-- the roster's whole mastery surface.
--
-- SECURITY INVOKER: teacher_student_assignments and the attempts read
-- inside get_skill_mastery_asof stay under the caller's RLS. A teacher
-- id whose roster the caller cannot see contributes no rows, so the
-- function grants nothing can_view() doesn't already grant.

create or replace function public.get_tutor_mastery_movement(
  p_teachers uuid[],
  p_days integer default 28,
  p_test_type text default 'sat'
)
returns table (
  teacher_id uuid,
  students_measured integer,
  skills_worked integer,
  avg_mastery_delta numeric,
  avg_mastery_now numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with roster as (
    select distinct tsa.teacher_id, tsa.student_id
    from teacher_student_assignments tsa
    where tsa.teacher_id = any(p_teachers)
  ),
  now_side as (
    select r.teacher_id, r.student_id,
           m.domain_code, m.skill_code, m.mastery, m.attempts_count
    from roster r
    cross join lateral public.get_skill_mastery_asof(
      r.student_id, current_date, p_test_type) m
  ),
  then_side as (
    select r.teacher_id, r.student_id,
           m.domain_code, m.skill_code, m.mastery, m.attempts_count
    from roster r
    cross join lateral public.get_skill_mastery_asof(
      r.student_id, current_date - greatest(p_days, 1), p_test_type) m
  ),
  worked as (
    select n.teacher_id, n.student_id,
           n.mastery as mastery_now,
           coalesce(t.mastery, 0) as mastery_then
    from now_side n
    left join then_side t
      using (teacher_id, student_id, domain_code, skill_code)
    where n.attempts_count > coalesce(t.attempts_count, 0)
  )
  select
    w.teacher_id,
    count(distinct w.student_id)::integer as students_measured,
    count(*)::integer as skills_worked,
    round(avg(w.mastery_now - w.mastery_then)::numeric, 1) as avg_mastery_delta,
    round(avg(w.mastery_now)::numeric, 1) as avg_mastery_now
  from worked w
  group by w.teacher_id
$$;

comment on function public.get_tutor_mastery_movement(uuid[], integer, text) is
  'Per-tutor mastery movement over a window (§5.2 tutor effectiveness): '
  'avg per-skill mastery delta across rostered students, counting only '
  '(student, skill) pairs with new attempts inside the window. Set-wise '
  'SECURITY INVOKER wrapper over get_skill_mastery_asof.';

grant execute on function public.get_tutor_mastery_movement(uuid[], integer, text) to authenticated;
