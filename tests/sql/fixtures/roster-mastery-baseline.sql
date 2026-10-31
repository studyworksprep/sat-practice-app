-- Frozen from the east production catalog on 2026-10-31.
-- Test-only baseline: compare the optimized roster calculation against
-- the actual previous helper, including hint weighting and recency.
CREATE OR REPLACE FUNCTION public.compute_mastery_score(p_weighted_correct double precision, p_weighted_total double precision, p_attempts_count integer, p_recent_total integer, p_recent_correct integer)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select least(
    100,
    round( (
      (case when coalesce(p_weighted_total, 0) > 0
            then coalesce(p_weighted_correct, 0) / p_weighted_total
            else 0 end)
      * (1 - exp(-0.15 * coalesce(p_attempts_count, 0)))
      * (1 + (case when coalesce(p_recent_total, 0) >= 3
                    and (coalesce(p_recent_correct, 0)::double precision
                         / nullif(p_recent_total, 0)) > 0.7
                   then 0.05 else 0 end))
      * 100
    )::numeric )
  )::integer;
$function$;

CREATE OR REPLACE FUNCTION public.mastery_weight(p_difficulty integer, p_score_band integer)
 RETURNS double precision
 LANGUAGE sql
 IMMUTABLE
AS $function$
  select (case p_difficulty
            when 1 then 0.6 when 2 then 1.0 when 3 then 1.5
            else 1.0 end)::double precision
       * (case p_score_band
            when 1 then 0.7 when 2 then 0.85 when 3 then 1.0 when 4 then 1.15
            when 5 then 1.3 when 6 then 1.5 when 7 then 1.7
            else 1.15 end)::double precision;
$function$;

CREATE OR REPLACE FUNCTION public.get_skill_mastery_asof(p_student uuid, p_asof date, p_test_type text DEFAULT 'sat'::text)
 RETURNS TABLE(test_type text, domain_code text, skill_code text, mastery integer, attempts_count integer, correct_count integer, avg_difficulty numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with first_attempts as (
    select distinct on (a.question_id)
      a.question_id, a.is_correct, a.created_at,
      coalesce(nullif(a.response_json->>'hints_used', '')::int, 0) > 0 as hint_assisted
    from public.attempts a
    where a.user_id = p_student
      and a.source = 'practice'
      and a.created_at::date <= p_asof
    order by a.question_id, a.created_at asc
  ),
  tax as (
    select
      q.domain_code, q.skill_code, q.difficulty,
      fa.is_correct, fa.created_at, fa.hint_assisted,
      public.mastery_weight(q.difficulty, q.score_band) as w
    from first_attempts fa
    join public.questions_v2 q on q.id = fa.question_id
    where q.domain_code is not null and q.skill_code is not null
  ),
  agg as (
    select
      domain_code, skill_code,
      count(*)::integer                             as attempts_count,
      count(*) filter (where is_correct)::integer   as correct_count,
      sum(w)::double precision                      as weighted_total,
      sum(w * case when hint_assisted then 0.5 else 1.0 end)
        filter (where is_correct)::double precision as weighted_correct,
      count(*) filter (where created_at::date >= p_asof - 13)::integer as recent_total,
      count(*) filter (where created_at::date >= p_asof - 13 and is_correct)::integer as recent_correct,
      avg(difficulty)::numeric                      as avg_difficulty
    from tax
    group by domain_code, skill_code
  )
  select
    p_test_type, domain_code, skill_code,
    public.compute_mastery_score(weighted_correct, weighted_total,
                                 attempts_count, recent_total, recent_correct),
    attempts_count, correct_count, round(avg_difficulty, 2)
  from agg;
$function$;

CREATE OR REPLACE FUNCTION public.baseline_get_roster_skill_trend(p_roster uuid[], p_days integer DEFAULT 28, p_test_type text DEFAULT 'sat'::text)
 RETURNS TABLE(domain_code text, skill_code text, students integer, avg_mastery_now numeric, avg_mastery_then numeric, avg_delta numeric)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  with now_side as (
    select r.student, m.domain_code, m.skill_code, m.mastery, m.attempts_count
    from unnest(p_roster) as r(student)
    cross join lateral public.get_skill_mastery_asof(r.student, current_date, p_test_type) m
  ),
  then_side as (
    select r.student, m.domain_code, m.skill_code, m.mastery
    from unnest(p_roster) as r(student)
    cross join lateral public.get_skill_mastery_asof(
      r.student, current_date - greatest(p_days, 1), p_test_type
    ) m
  )
  select
    n.domain_code,
    n.skill_code,
    count(*)::integer as students,
    round(avg(n.mastery)::numeric, 1) as avg_mastery_now,
    round(avg(coalesce(t.mastery, 0))::numeric, 1) as avg_mastery_then,
    round(avg(n.mastery - coalesce(t.mastery, 0))::numeric, 1) as avg_delta
  from now_side n
  left join then_side t
    on t.student = n.student
   and t.domain_code = n.domain_code
   and t.skill_code = n.skill_code
  where n.attempts_count > 0
  group by n.domain_code, n.skill_code
$function$;
