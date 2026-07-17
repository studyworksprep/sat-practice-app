-- =========================================================
-- get_plan_inputs: has_lesson honors real lessons (§3.4)
-- =========================================================
-- Until now has_lesson was proxied entirely through lesson pack
-- membership (lesson_pack_questions → questions_v2), because
-- lesson_topics — the intended skill→lesson join key — was empty in
-- production. The Phase 3.4 content workstream changes that: AI-
-- generated lessons saved from a curriculum unit stamp a skill-level
-- lesson_topics row, so plan generation should see a unit as
-- lesson-covered when a PUBLISHED lesson is tagged to its skill.
--
-- has_lesson = published lesson via lesson_topics (skill-level tag)
--              OR the legacy lesson-pack proxy (kept so existing
--              pack-derived coverage doesn't regress).
--
-- Body otherwise identical to the live production definition
-- (verified via pg_get_functiondef 2026-07-17 per the migrations
-- README — the live catalog, not the repo file, is the baseline).

create or replace function public.get_plan_inputs(p_student uuid, p_test_type text default 'sat'::text)
 returns table(domain_code text, skill_code text, section text, mastery integer, attempts_count integer, coverage_status text, mastery_threshold integer, learnability integer, expected_minutes integer, sequence integer, questions_available integer, has_lesson boolean)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
  select
    c.domain_code, c.skill_code,
    case when c.domain_code in ('H', 'P', 'Q', 'S') then 'math' else 'reading_writing' end as section,
    c.mastery, c.attempts_count, c.status as coverage_status, c.mastery_threshold,
    sl.learnability, cu.expected_minutes, c.sequence, c.questions_available,
    (
      exists (
        select 1 from public.lesson_topics lt
        join public.lessons l on l.id = lt.lesson_id
        where lt.skill_code = c.skill_code and l.status = 'published'
      )
      or exists (
        select 1 from public.lesson_pack_questions lpq
        join public.questions_v2 q on q.id = lpq.question_id
        where q.domain_code = c.domain_code and q.skill_code = c.skill_code
      )
    ) as has_lesson
  from public.get_student_coverage(p_student, p_test_type) c
  join public.curriculum_units cu
    on cu.test_type = p_test_type and cu.domain_code = c.domain_code and cu.skill_code = c.skill_code
  left join public.skill_learnability sl on sl.skill_code = c.skill_code
  order by c.sequence;
$function$;
