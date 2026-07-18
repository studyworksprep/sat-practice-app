-- =========================================================
-- Hint-weighted mastery (upgrade plan §3.2)
-- =========================================================
-- A correct answer reached with hints demonstrates less mastery
-- than an unassisted one. The practice runner records hint usage on
-- attempts.response_json ({"hints_used": n}); this migration makes
-- the authoritative mastery chain (get_skill_mastery_asof →
-- skill_mastery_snapshots → get_student_coverage → plans) weight a
-- hint-assisted correct at HALF its normal contribution to
-- weighted_correct. weighted_total is unchanged — using hints never
-- scores better than not answering.
--
-- The 0.5 factor mirrors HINT_CORRECT_FACTOR in lib/mastery.ts (the
-- JS twin used by the Lessonworks sync); keep them in lockstep.
--
-- Body baselined from the LIVE production definition
-- (pg_get_functiondef, 2026-07-18) per supabase/migrations/README.md
-- — the only change is hint_assisted plumbing in the CTEs and the
-- weighted_correct expression. compute_mastery_score (pinned by
-- lib/mastery.fixtures.json) is untouched: the change is in the
-- aggregation, not the score curve.
--
-- Wrong answers are unaffected regardless of hints. Attempts with
-- no response_json (everything recorded before §3.2) are unassisted
-- by definition, so historical mastery is unchanged.

create or replace function public.get_skill_mastery_asof(p_student uuid, p_asof date, p_test_type text default 'sat'::text)
 returns table(test_type text, domain_code text, skill_code text, mastery integer, attempts_count integer, correct_count integer, avg_difficulty numeric)
 language sql
 stable
 set search_path to 'public', 'pg_temp'
as $function$
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
