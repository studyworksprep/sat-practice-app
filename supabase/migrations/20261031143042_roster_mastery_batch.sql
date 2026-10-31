-- Batch ordinary histories into one scoped read and two aggregate
-- cutoffs. Ambiguous first-answer ties retain the existing helper.
-- Signature, grants and scoring
-- are unchanged; CREATE OR REPLACE preserves the existing execute ACL.
create or replace function public.get_roster_skill_trend(
  p_roster uuid[],
  p_days integer default 28,
  p_test_type text default 'sat'
)
returns table (
  domain_code text, skill_code text, students integer,
  avg_mastery_now numeric, avg_mastery_then numeric, avg_delta numeric
)
language sql stable security invoker set search_path = 'public'
as $$
  with eligible_attempts as materialized (
    -- The existing as-of helper reads public.attempts for all values of
    -- p_test_type. Preserve that behavior and its first-answer/hint rules.
    select a.user_id as student, a.question_id, a.is_correct, a.created_at,
      coalesce(nullif(a.response_json->>'hints_used', '')::int, 0) > 0 as hint_assisted
    from public.attempts a
    where a.user_id = any(p_roster)
      and a.source = 'practice'
      and a.created_at::date <= current_date
  ), first_attempts as materialized (
    select distinct on (student, question_id) *
    from eligible_attempts order by student, question_id, created_at asc
  ), ambiguous_students as materialized (
    -- Legacy rows can disagree at the exact same first timestamp. The
    -- old helper has no id tie-breaker; retain its query plan/selection
    -- for those students rather than silently changing their scores.
    select distinct f.student
    from first_attempts f join eligible_attempts a
      on a.student=f.student and a.question_id=f.question_id and a.created_at=f.created_at
    group by f.student, f.question_id
    having count(distinct row(coalesce(a.is_correct,false),a.hint_assisted)) > 1
  ), tax as (
    select fa.student, q.domain_code, q.skill_code,
      fa.is_correct, fa.created_at::date as attempt_date, fa.hint_assisted,
      public.mastery_weight(q.difficulty, q.score_band) as w
    from first_attempts fa
    join public.questions_v2 q on q.id = fa.question_id
    where q.domain_code is not null and q.skill_code is not null
      and fa.student not in (select student from ambiguous_students)
  ), aggregates as (
    select student, domain_code, skill_code,
      count(*)::integer as now_count,
      sum(w)::double precision as now_weight,
      sum(w * case when hint_assisted then 0.5 else 1.0 end)
        filter (where is_correct)::double precision as now_correct,
      count(*) filter (where attempt_date >= current_date - 13)::integer as now_recent,
      count(*) filter (where attempt_date >= current_date - 13 and is_correct)::integer as now_recent_correct,
      count(*) filter (where attempt_date <= current_date - greatest(p_days, 1))::integer as then_count,
      sum(w) filter (where attempt_date <= current_date - greatest(p_days, 1))::double precision as then_weight,
      sum(w * case when hint_assisted then 0.5 else 1.0 end)
        filter (where attempt_date <= current_date - greatest(p_days, 1) and is_correct)::double precision as then_correct,
      count(*) filter (where attempt_date between current_date - greatest(p_days, 1) - 13
        and current_date - greatest(p_days, 1))::integer as then_recent,
      count(*) filter (where attempt_date between current_date - greatest(p_days, 1) - 13
        and current_date - greatest(p_days, 1) and is_correct)::integer as then_recent_correct
    from tax group by student, domain_code, skill_code
  ), scores as materialized (
    select student, domain_code, skill_code, then_count,
      public.compute_mastery_score(now_correct, now_weight, now_count,
        now_recent, now_recent_correct) as mastery_now,
      public.compute_mastery_score(then_correct, then_weight, then_count,
        then_recent, then_recent_correct) as mastery_then
    from aggregates
  ), now_values as materialized (
    select student, domain_code, skill_code, mastery_now from scores
    union all
    select a.student,m.domain_code,m.skill_code,m.mastery
    from ambiguous_students a cross join lateral public.get_skill_mastery_asof(
      a.student,current_date,p_test_type) m where m.attempts_count>0
  ), then_values as materialized (
    select student, domain_code, skill_code, mastery_then from scores where then_count>0
    union all
    select a.student,m.domain_code,m.skill_code,m.mastery
    from ambiguous_students a cross join lateral public.get_skill_mastery_asof(
      a.student,current_date-greatest(p_days,1),p_test_type) m
  ), now_side as (
    -- Re-expand the supplied roster only after scoring. This retains
    -- even the old duplicate-roster multiplicity, without rescanning it.
    select r.student, s.domain_code, s.skill_code, s.mastery_now
    from unnest(p_roster) r(student)
    join now_values s on s.student = r.student
  ), then_side as (
    select r.student, s.domain_code, s.skill_code, s.mastery_then
    from unnest(p_roster) r(student)
    join then_values s on s.student = r.student
  )
  select n.domain_code, n.skill_code, count(*)::integer,
    round(avg(n.mastery_now)::numeric, 1),
    round(avg(coalesce(t.mastery_then, 0))::numeric, 1),
    round(avg(n.mastery_now - coalesce(t.mastery_then, 0))::numeric, 1)
  from now_side n
  left join then_side t on t.student = n.student
    and t.domain_code = n.domain_code and t.skill_code = n.skill_code
  group by n.domain_code, n.skill_code;
$$;
