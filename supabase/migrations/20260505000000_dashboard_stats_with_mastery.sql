-- Replace get_student_dashboard_stats with a v2 that surfaces a
-- mastery score per domain alongside the raw correct/total
-- counters. Mastery formula matches lib/mastery.js verbatim:
--
--   weighted_correct = Σ is_correct ? (diff_weight × band_weight) : 0
--   weighted_total   = Σ diff_weight × band_weight
--   raw_accuracy     = weighted_correct / weighted_total
--   volume_factor    = 1 - exp(-0.15 * count)
--   recency_bonus    = 0.05 if last-14-day accuracy > 70% with ≥3
--                      attempts, else 0
--   mastery          = raw_accuracy × volume_factor × (1 + recency)
--                       capped at 100
--
-- Difficulty weights:  1 → 0.6, 2 → 1.0, 3 → 1.5, else 1.0
-- Score-band weights:  1 → 0.7, 2 → 0.85, 3 → 1.0, 4 → 1.15,
--                      5 → 1.3, 6 → 1.5, 7 → 1.7, else 1.15
--
-- Counts ALL practice attempts, not just first-attempts. The tutor
-- view's "first attempt only" semantics make sense for a teacher
-- diagnosing what a student knew before review; on the student's
-- own dashboard we want a learning-curve metric — getting a
-- question right after missing it the first time is a real signal
-- of mastery, so it counts.
--
-- Stable function signature (same parameters, same return shape
-- with one extra `mastery` field per domain), so the calling app
-- doesn't need a transition release.

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
      count(*)::bigint                                                        as total_attempts,
      count(*) filter (where is_correct)::bigint                              as correct_attempts,
      count(*) filter (where created_at >= p_week_ago)::bigint                as week_attempts
    from attempts_window
  ),
  -- v1→v2 question-id translation, applied to attempts within the
  -- lookback window. Same shape as the prior version of this RPC
  -- — only the `with_meta` projection grew (difficulty + score_band
  -- + created_at).
  translated as (
    select
      a.is_correct,
      a.created_at,
      coalesce(m.new_question_id, a.question_id) as effective_question_id
    from attempts_window a
    left join public.question_id_map m
      on m.old_question_id = a.question_id
    where a.created_at >= p_lookback_start
  ),
  with_meta as (
    select
      t.is_correct,
      t.created_at,
      q.domain_code,
      q.domain_name,
      q.difficulty,
      q.score_band
    from translated t
    join public.questions_v2 q
      on q.id = t.effective_question_id
    where q.is_published is true
      and q.is_broken is not true
      and q.deleted_at is null
      and q.domain_name is not null
  ),
  weighted as (
    -- One row per attempt with its mastery weight pre-computed.
    -- Pulling the CASE into a CTE keeps the aggregate below
    -- readable; the optimizer fuses CTEs for SQL functions.
    select
      domain_code,
      domain_name,
      is_correct,
      created_at,
      (
        case difficulty
          when 1 then 0.6::numeric
          when 2 then 1.0::numeric
          when 3 then 1.5::numeric
          else        1.0::numeric
        end
      ) * (
        case score_band
          when 1 then 0.7::numeric
          when 2 then 0.85::numeric
          when 3 then 1.0::numeric
          when 4 then 1.15::numeric
          when 5 then 1.3::numeric
          when 6 then 1.5::numeric
          when 7 then 1.7::numeric
          else        1.15::numeric
        end
      ) as w
    from with_meta
  ),
  per_domain_agg as (
    select
      domain_code,
      domain_name,
      count(*)::bigint                                                              as total,
      count(*) filter (where is_correct)::bigint                                    as correct,
      coalesce(sum(w), 0)::numeric                                                  as weighted_total,
      coalesce(sum(w) filter (where is_correct), 0)::numeric                        as weighted_correct,
      count(*) filter (where created_at >= now() - interval '14 days')::bigint      as recent_total,
      count(*) filter (where created_at >= now() - interval '14 days' and is_correct)::bigint as recent_correct
    from weighted
    group by domain_code, domain_name
  ),
  per_domain_with_mastery as (
    select
      domain_code,
      domain_name,
      total,
      correct,
      least(
        100,
        round(
          case when weighted_total > 0 then weighted_correct / weighted_total else 0 end
          * (1 - exp(-0.15 * total::numeric))
          * (
              1 + (
                case
                  when recent_total >= 3
                       and recent_correct::numeric / recent_total > 0.7
                    then 0.05
                  else 0
                end
              )
            )
          * 100
        )
      )::int as mastery
    from per_domain_agg
  ),
  per_domain_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'domain_code', domain_code,
          'domain_name', domain_name,
          'correct',     correct,
          'total',       total,
          'mastery',     mastery
        )
        order by total desc
      ),
      '[]'::jsonb
    ) as per_domain
    from per_domain_with_mastery
  )
  select
    t.total_attempts,
    t.correct_attempts,
    t.week_attempts,
    p.per_domain
  from totals t cross join per_domain_json p;
$$;

-- Re-grant — create or replace preserves grants on the existing
-- function but explicit is fine.
grant execute on function public.get_student_dashboard_stats(
  uuid, timestamptz, timestamptz
) to authenticated;
