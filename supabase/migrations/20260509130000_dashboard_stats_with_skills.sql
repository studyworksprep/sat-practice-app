-- Enrich get_student_dashboard_stats with per-skill counts inside
-- each domain so the student dashboard can render the same skill-
-- segmented bars the assignment / practice-test reports use
-- (lib/practice/SkillBreakdownCard.jsx).
--
-- The previous version (20260505000000_dashboard_stats_with_mastery)
-- returned a `mastery` score per domain. The dashboard is moving
-- to the shared SkillBreakdownCard style — segments sized by
-- question count, colored by raw-accuracy bucket — so mastery
-- becomes unused and is dropped from the per_domain payload to
-- avoid carrying a now-unread field. JS readers tolerate the
-- missing key.
--
-- Function signature unchanged (same params, same return columns);
-- only the per_domain JSON shape grows by a `skills` array per
-- domain entry and loses the `mastery` field.

create or replace function public.get_student_dashboard_stats(
  p_user_id          uuid,
  p_week_ago         timestamptz,
  p_lookback_start   timestamptz
)
returns table (
  total_attempts   bigint,
  correct_attempts bigint,
  week_attempts    bigint,
  per_domain       jsonb
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  with attempts_window as (
    select
      a.id,
      a.is_correct,
      a.question_id,
      a.created_at
    from public.attempts a
    where a.user_id = p_user_id
      and a.source = 'practice'
  ),
  totals as (
    select
      count(*)::bigint                                         as total_attempts,
      count(*) filter (where is_correct)::bigint               as correct_attempts,
      count(*) filter (where created_at >= p_week_ago)::bigint as week_attempts
    from attempts_window
  ),
  translated as (
    select
      a.is_correct,
      coalesce(m.new_question_id, a.question_id) as effective_question_id
    from attempts_window a
    left join public.question_id_map m
      on m.old_question_id = a.question_id
    where a.created_at >= p_lookback_start
  ),
  with_meta as (
    select
      t.is_correct,
      q.domain_code,
      q.domain_name,
      q.skill_code,
      q.skill_name
    from translated t
    join public.questions_v2 q
      on q.id = t.effective_question_id
    where q.is_published is true
      and q.is_broken is not true
      and q.deleted_at is null
      and q.domain_name is not null
  ),
  per_skill_agg as (
    select
      domain_code,
      domain_name,
      skill_code,
      -- Questions without a skill_name fall under a single
      -- '—' placeholder row so they still roll up into the
      -- domain totals without inventing a fake skill label.
      coalesce(skill_name, '—') as skill_name,
      count(*) filter (where is_correct)::bigint as correct,
      count(*)::bigint                           as total
    from with_meta
    group by domain_code, domain_name, skill_code, skill_name
  ),
  per_domain_with_skills as (
    select
      domain_code,
      domain_name,
      sum(correct)::bigint as correct,
      sum(total)::bigint   as total,
      jsonb_agg(
        jsonb_build_object(
          'skill_code', skill_code,
          'skill_name', skill_name,
          'correct',    correct,
          'total',      total
        )
        order by total desc
      ) as skills
    from per_skill_agg
    group by domain_code, domain_name
  ),
  per_domain_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'domain_code', domain_code,
          'domain_name', domain_name,
          'correct',     correct,
          'total',       total,
          'skills',      skills
        )
        order by total desc
      ),
      '[]'::jsonb
    ) as per_domain
    from per_domain_with_skills
  )
  select
    t.total_attempts,
    t.correct_attempts,
    t.week_attempts,
    p.per_domain
  from totals t cross join per_domain_json p;
$$;

grant execute on function public.get_student_dashboard_stats(
  uuid, timestamptz, timestamptz
) to authenticated;
