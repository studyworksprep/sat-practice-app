-- =========================================================
-- get_plan_inputs — assemble the generator's per-skill inputs (§2.2)
-- =========================================================
-- The deterministic plan generator (lib/plan/generate-plan.ts) needs one
-- SkillState row per curriculum skill: coverage + mastery (from §1.3),
-- the mastery threshold + expected minutes (curriculum_units §1.2),
-- learnability (skill_learnability), and whether a lesson exists. This
-- function returns exactly that shape in one call, so the generateStudyPlan
-- server action is a thin: rpc(get_plan_inputs) -> generatePlan() -> write.
--
-- SECURITY INVOKER: it wraps get_student_coverage (also invoker), so RLS
-- on the underlying snapshots/attempts governs who can generate for whom —
-- a student for themselves, a tutor for a visible student.
--
-- has_lesson comes from lesson_pack_questions (NOT lesson_topics, which is
-- empty in production — see §1.4): a skill "has a lesson" if any lesson
-- pack includes a question tagged to that skill.

create or replace function public.get_plan_inputs(
  p_student   uuid,
  p_test_type text default 'sat'
) returns table (
  domain_code         text,
  skill_code          text,
  section             text,
  mastery             integer,
  attempts_count      integer,
  coverage_status     text,
  mastery_threshold   integer,
  learnability        integer,
  expected_minutes    integer,
  sequence            integer,
  questions_available integer,
  has_lesson          boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    c.domain_code,
    c.skill_code,
    case when c.domain_code in ('H', 'P', 'Q', 'S') then 'math' else 'reading_writing' end as section,
    c.mastery,
    c.attempts_count,
    c.status as coverage_status,
    c.mastery_threshold,
    sl.learnability,
    cu.expected_minutes,
    c.sequence,
    c.questions_available,
    exists (
      select 1
      from public.lesson_pack_questions lpq
      join public.questions_v2 q on q.id = lpq.question_id
      where q.domain_code = c.domain_code and q.skill_code = c.skill_code
    ) as has_lesson
  from public.get_student_coverage(p_student, p_test_type) c
  join public.curriculum_units cu
    on cu.test_type = p_test_type
   and cu.domain_code = c.domain_code
   and cu.skill_code = c.skill_code
  left join public.skill_learnability sl on sl.skill_code = c.skill_code
  order by c.sequence;
$$;

grant execute on function public.get_plan_inputs(uuid, text) to authenticated;
