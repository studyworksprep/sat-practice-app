-- Per-student extended stats for the tutor "More statistics" page
-- (/tutor/students/[id]/stats). Returns three roll-ups in one
-- round-trip:
--   - by_day:        jsonb[{date, attempts, correct}]      — daily heatmap
--   - by_difficulty: jsonb[{difficulty, attempts, correct}] — easy/med/hard split
--   - by_score_band: jsonb[{score_band, attempts, correct}] — band 1–7 split
--
-- All three are restricted to source = 'practice' attempts within
-- the lookback window. Done in SQL aggregation so a student with
-- 5000+ attempts doesn't pull the raw rows over the wire (the
-- db-max-rows pitfall noted in CLAUDE.md). RLS on attempts uses
-- can_view(user_id), so a tutor calling this for one of their
-- students sees the rows; an unauthorized caller gets none and
-- the function returns empty arrays.

create or replace function public.get_student_extended_stats(
  p_user_id          uuid,
  p_lookback_start   timestamptz
)
returns table (
  by_day         jsonb,
  by_difficulty  jsonb,
  by_score_band  jsonb
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  with attempts_window as (
    select
      a.is_correct,
      a.question_id,
      a.created_at
    from public.attempts a
    where a.user_id = p_user_id
      and a.source = 'practice'
      and a.created_at >= p_lookback_start
  ),
  with_meta as (
    select
      aw.is_correct,
      aw.created_at,
      q.difficulty,
      q.score_band
    from attempts_window aw
    left join public.question_id_map m
      on m.old_question_id = aw.question_id
    left join public.questions_v2 q
      on q.id = coalesce(m.new_question_id, aw.question_id)
  ),
  by_day_agg as (
    select
      (created_at at time zone 'UTC')::date as day,
      count(*)::bigint                            as attempts,
      count(*) filter (where is_correct)::bigint  as correct
    from attempts_window
    group by 1
  ),
  by_day_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'date',     to_char(day, 'YYYY-MM-DD'),
          'attempts', attempts,
          'correct',  correct
        )
        order by day
      ),
      '[]'::jsonb
    ) as by_day
    from by_day_agg
  ),
  by_difficulty_agg as (
    select
      difficulty,
      count(*)::bigint                            as attempts,
      count(*) filter (where is_correct)::bigint  as correct
    from with_meta
    where difficulty is not null
    group by difficulty
  ),
  by_difficulty_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'difficulty', difficulty,
          'attempts',   attempts,
          'correct',    correct
        )
        order by difficulty
      ),
      '[]'::jsonb
    ) as by_difficulty
    from by_difficulty_agg
  ),
  by_score_band_agg as (
    select
      score_band,
      count(*)::bigint                            as attempts,
      count(*) filter (where is_correct)::bigint  as correct
    from with_meta
    where score_band is not null
    group by score_band
  ),
  by_score_band_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'score_band', score_band,
          'attempts',   attempts,
          'correct',    correct
        )
        order by score_band
      ),
      '[]'::jsonb
    ) as by_score_band
    from by_score_band_agg
  )
  select
    d.by_day,
    diff.by_difficulty,
    sb.by_score_band
  from by_day_json d
    cross join by_difficulty_json diff
    cross join by_score_band_json sb;
$$;

grant execute on function public.get_student_extended_stats(
  uuid, timestamptz
) to authenticated;
