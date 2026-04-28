-- Roster-performance aggregations as DB-side RPCs.
--
-- The /tutor/performance page was doing this in JavaScript:
--   1. SELECT user_id FROM student_practice_stats
--   2. for chunks of rosterIds:
--        SELECT … FROM attempts WHERE user_id = ANY(chunk)
--                            AND created_at >= since
--                            (paged through max-rows)
--   3. SELECT … FROM question_id_map WHERE old_question_id = ANY(...)
--   4. SELECT … FROM questions_v2 WHERE id = ANY(translated_ids)
--   5. aggregate per-skill in a Map walk + count distinct students
--      below the struggling threshold
--   6. bucket attempts into 13 weekly windows for the trend chart
--
-- Even with the chunks fanning out via Promise.all, this is a
-- lot of network + JS work. Pushing the whole thing into two
-- RPCs lets Postgres do the joins, deduplicates the v1→v2
-- translation in a single CTE, and returns ~30 rows + ~13 rows
-- back to the app instead of tens of thousands of attempts.
--
-- Both functions are SECURITY INVOKER + STABLE so RLS on
-- attempts / questions_v2 still applies as the calling user.
-- The caller passes its already-RLS-scoped roster id list, so
-- we don't have to re-derive the visibility set inside the
-- function.

-- ──────────────────────────────────────────────────────────────
-- Per-skill aggregation. Returns one row per skill the roster
-- has worked on, after the same min-attempts gates the JS code
-- applied: skills under p_min_skill_attempts are dropped, and
-- a student counts toward "below threshold" only after
-- p_min_student_attempts attempts on that skill.
-- ──────────────────────────────────────────────────────────────

create or replace function public.get_roster_skill_performance(
  p_roster                 uuid[],
  p_since                  timestamptz,
  p_min_skill_attempts     int               default 5,
  p_min_student_attempts   int               default 3,
  p_struggling_threshold   double precision  default 0.6
)
returns table (
  skill_code        text,
  skill_name        text,
  domain_code       text,
  domain_name       text,
  attempts          bigint,
  correct           bigint,
  missed            bigint,
  accuracy          double precision,
  students_touched  bigint,
  students_below_60 bigint
)
language sql
security invoker
stable
as $$
  with translated as (
    -- Walk every attempt in the window for the given roster, mapping
    -- v1-era question_ids forward through question_id_map. v2-era
    -- ids fall through unchanged via coalesce.
    select
      a.user_id,
      a.is_correct,
      coalesce(m.new_question_id, a.question_id) as v2_question_id
    from public.attempts a
    left join public.question_id_map m
      on m.old_question_id = a.question_id
    where a.user_id = any(p_roster)
      and a.created_at >= p_since
  ),
  joined as (
    -- Drop anything we don't have v2 metadata for (legacy questions
    -- that didn't make the v2 copy, unpublished or broken-flagged
    -- rows, soft-deleted ones).
    select
      t.user_id,
      t.is_correct,
      q.skill_code,
      q.skill_name,
      q.domain_code,
      q.domain_name
    from translated t
    join public.questions_v2 q on q.id = t.v2_question_id
    where q.is_published = true
      and q.is_broken = false
      and q.deleted_at is null
      and q.skill_code is not null
  ),
  per_student_skill as (
    select
      user_id,
      skill_code,
      count(*)                     as ps_attempts,
      count(*) filter (where is_correct) as ps_correct
    from joined
    group by user_id, skill_code
  ),
  strugglers as (
    select skill_code, count(*) as students_below_60
    from per_student_skill
    where ps_attempts >= p_min_student_attempts
      and (ps_correct::double precision / ps_attempts) < p_struggling_threshold
    group by skill_code
  ),
  per_skill_aggs as (
    select
      j.skill_code,
      max(j.skill_name)              as skill_name,
      max(j.domain_code)             as domain_code,
      max(j.domain_name)             as domain_name,
      count(*)                       as attempts,
      count(*) filter (where j.is_correct) as correct,
      count(distinct j.user_id)      as students_touched
    from joined j
    group by j.skill_code
  )
  select
    a.skill_code,
    a.skill_name,
    a.domain_code,
    a.domain_name,
    a.attempts,
    a.correct,
    (a.attempts - a.correct) as missed,
    case when a.attempts > 0
      then a.correct::double precision / a.attempts
      else 0::double precision
    end as accuracy,
    a.students_touched,
    coalesce(s.students_below_60, 0) as students_below_60
  from per_skill_aggs a
  left join strugglers s using (skill_code)
  where a.attempts >= p_min_skill_attempts;
$$;

grant execute on function public.get_roster_skill_performance(
  uuid[], timestamptz, int, int, double precision
) to authenticated;

-- ──────────────────────────────────────────────────────────────
-- Weekly trend buckets. Returns one row per rolling 7-day window
-- ending at "now" — the JS loader's old buildWeeklyTrend, in SQL.
-- p_num_weeks is small (13 for a 90-day window) so the function
-- is cheap regardless of attempt volume.
-- ──────────────────────────────────────────────────────────────

create or replace function public.get_roster_weekly_trend(
  p_roster      uuid[],
  p_num_weeks   int        default 13
)
returns table (
  start_iso  timestamptz,
  end_iso    timestamptz,
  attempts   bigint,
  correct    bigint,
  accuracy   double precision
)
language sql
security invoker
stable
as $$
  with weeks as (
    -- Generate p_num_weeks rolling 7-day windows. Window i (0-indexed)
    -- ends at now() - (num_weeks-1-i) * 7d. The newest bucket ends
    -- at now() — so the rightmost data point on the chart tracks
    -- the actual lookback boundary, no half-week boundary surprises.
    select
      generate_series(0, p_num_weeks - 1) as i
  ),
  bounds as (
    select
      i,
      now() - ((p_num_weeks - 1 - i) * interval '7 days') - interval '7 days' as start_at,
      now() - ((p_num_weeks - 1 - i) * interval '7 days')                    as end_at
    from weeks
  )
  select
    b.start_at as start_iso,
    b.end_at   as end_iso,
    coalesce(count(a.id), 0)                                  as attempts,
    coalesce(count(a.id) filter (where a.is_correct), 0)      as correct,
    case when count(a.id) > 0
      then count(a.id) filter (where a.is_correct)::double precision
           / count(a.id)
      else null
    end as accuracy
  from bounds b
  left join public.attempts a
    on a.user_id = any(p_roster)
    and a.created_at >= b.start_at
    and a.created_at <  b.end_at
  group by b.i, b.start_at, b.end_at
  order by b.start_at;
$$;

grant execute on function public.get_roster_weekly_trend(
  uuid[], int
) to authenticated;
