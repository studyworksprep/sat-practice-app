-- =========================================================
-- ACT review loop + cross-test stats (ACT parity Phase 4, PR A)
-- =========================================================
-- 1. review_queue accepts ACT questions (item_type 'act_question',
--    item_ref = act_questions.id). Intake is submitAnswer's ACT
--    branch (lib/practice/session-actions.ts → lib/review/queue.ts
--    recordQuestionOutcome), the same first-attempt-wins rule as
--    SAT; ACT due items run as test_type='act' review sessions.
-- 2. The activity rollups that used to read only `attempts` now
--    count `act_attempts` too: the sidebar streak, the
--    student_practice_stats view (roster / student pages), the
--    weekly trend, and the daily-activity series of
--    get_student_extended_stats. Per-domain / per-skill /
--    difficulty / score-band SAT breakdowns are unchanged — ACT has
--    its own taxonomy, served by the new get_act_student_stats.
-- 3. get_act_student_stats(p_user_id, p_week_ago, p_lookback_start):
--    totals, per-section → per-category accuracy over the lookback
--    window (joined to live act_questions), and the ACT 1–5
--    difficulty split. SECURITY INVOKER: act_attempts RLS
--    (can_view) scopes a tutor to their own students.

-- 1. review_queue ---------------------------------------------------

alter table public.review_queue
  drop constraint if exists review_queue_item_type_check;
alter table public.review_queue
  add constraint review_queue_item_type_check
  check (item_type in ('question', 'skill', 'flashcard', 'vocab', 'lesson_check', 'act_question'));

comment on table public.review_queue is
  'Per-student spaced-repetition queue (§3.1). SM-2-lite scheduling '
  'state per item; item_ref meaning depends on item_type (question '
  'uuid (questions_v2) / act_question uuid (act_questions) / '
  'skill_code / flashcard uuid / vocab id / lesson uuid). Intake: '
  'wrong answers (SAT and ACT), decayed coverage, flashcard ratings, '
  'lesson completion. Consumed by plan review tasks and the Review hub.';

-- 2a. Streak over both attempt tables ------------------------------

create or replace function public.get_practice_streak(p_user uuid)
returns table (current_streak integer, practiced_today boolean)
language sql
stable
security invoker
set search_path = public
as $$
  with all_attempts as (
    select a.created_at from public.attempts a
     where a.user_id = p_user and a.created_at >= now() - interval '400 days'
    union all
    select t.created_at from public.act_attempts t
     where t.user_id = p_user and t.created_at >= now() - interval '400 days'
  ),
  days as (
    select distinct (created_at at time zone 'utc')::date as d
    from all_attempts
  ),
  walk as (
    select ((now() at time zone 'utc')::date - d) as age,
           row_number() over (order by d desc) - 1 as rn
    from days
  ),
  anchor as (
    select min(age) as start_age from walk where age <= 1
  )
  select
    coalesce(
      (select count(*)::integer
       from walk, anchor
       where anchor.start_age is not null
         and walk.age - walk.rn = anchor.start_age),
      0
    ) as current_streak,
    exists (select 1 from walk where age = 0) as practiced_today
$$;

comment on function public.get_practice_streak(uuid) is
  'Consecutive UTC practice days ending today or yesterday, plus '
  'whether the user practiced today (§6.1 sidebar strip). Counts SAT '
  'and ACT attempts. SECURITY INVOKER — attempts RLS scopes visibility.';

-- 2b. student_practice_stats over both attempt tables ---------------

create or replace view public.student_practice_stats
  with (security_invoker = true)
as
with all_attempts as (
  select a.user_id, a.is_correct, a.created_at from public.attempts a
  union all
  select t.user_id, t.is_correct, t.created_at from public.act_attempts t
)
select
  p.id                                                                         as user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.target_sat_score,
  p.high_school,
  p.graduation_year,
  p.sat_test_date,
  count(a.created_at)                                                          as total_attempts,
  count(a.created_at) filter (where a.is_correct)                              as correct_attempts,
  count(a.created_at) filter (where a.created_at >= now() - interval '7 days') as week_attempts,
  max(a.created_at)                                                            as last_activity_at
from public.profiles p
left join all_attempts a on a.user_id = p.id
where p.role = 'student'
group by p.id;

grant select on public.student_practice_stats to authenticated;

-- 2c. Weekly trend over both attempt tables -------------------------

create or replace function public.get_roster_weekly_trend(p_roster uuid[], p_num_weeks integer default 13)
returns table(start_iso timestamptz, end_iso timestamptz, attempts bigint, correct bigint, accuracy double precision)
language sql
stable
as $$
  with weeks as (
    select generate_series(0, p_num_weeks - 1) as i
  ),
  bounds as (
    select
      i,
      now() - ((p_num_weeks - 1 - i) * interval '7 days') - interval '7 days' as start_at,
      now() - ((p_num_weeks - 1 - i) * interval '7 days')                    as end_at
    from weeks
  ),
  all_attempts as (
    select a.user_id, a.is_correct, a.created_at from public.attempts a
     where a.user_id = any(p_roster)
    union all
    select t.user_id, t.is_correct, t.created_at from public.act_attempts t
     where t.user_id = any(p_roster)
  )
  select
    b.start_at as start_iso,
    b.end_at   as end_iso,
    coalesce(count(a.created_at), 0)                                as attempts,
    coalesce(count(a.created_at) filter (where a.is_correct), 0)    as correct,
    case when count(a.created_at) > 0
      then count(a.created_at) filter (where a.is_correct)::double precision
           / count(a.created_at)
      else null
    end as accuracy
  from bounds b
  left join all_attempts a
    on a.created_at >= b.start_at
    and a.created_at <  b.end_at
  group by b.i, b.start_at, b.end_at
  order by b.start_at;
$$;

-- 2d. Daily activity over both attempt tables ----------------------
-- by_difficulty / by_score_band keep their SAT meaning: ACT rows
-- find no questions_v2 match and drop out of those two series.

create or replace function public.get_student_extended_stats(
  p_user_id uuid,
  p_lookback_start timestamp with time zone
)
returns table(
  by_day jsonb,
  by_difficulty jsonb,
  by_score_band jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with attempts_window as (
    select a.is_correct, a.question_id, a.created_at
      from public.attempts a
     where a.user_id = p_user_id
       and a.created_at >= p_lookback_start
    union all
    select t.is_correct, t.question_id, t.created_at
      from public.act_attempts t
     where t.user_id = p_user_id
       and t.created_at >= p_lookback_start
  ),
  with_meta as (
    select
      aw.is_correct,
      aw.created_at,
      q.difficulty,
      q.score_band
    from attempts_window aw
    left join public.questions_v2 q
      on q.id = aw.question_id
  ),
  by_day_agg as (
    select
      (created_at at time zone 'UTC')::date as day,
      count(*)::bigint                           as attempts,
      count(*) filter (where is_correct)::bigint as correct
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
      count(*)::bigint                           as attempts,
      count(*) filter (where is_correct)::bigint as correct
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
      count(*)::bigint                           as attempts,
      count(*) filter (where is_correct)::bigint as correct
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

-- 3. ACT stats -------------------------------------------------------

create or replace function public.get_act_student_stats(
  p_user_id uuid,
  p_week_ago timestamp with time zone,
  p_lookback_start timestamp with time zone
)
returns table(
  total_attempts bigint,
  correct_attempts bigint,
  week_attempts bigint,
  per_section jsonb,
  by_difficulty jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with attempts_window as (
    select a.id, a.is_correct, a.question_id, a.created_at
      from public.act_attempts a
     where a.user_id = p_user_id
  ),
  totals as (
    select
      count(*)::bigint                                         as total_attempts,
      count(*) filter (where is_correct)::bigint               as correct_attempts,
      count(*) filter (where created_at >= p_week_ago)::bigint as week_attempts
    from attempts_window
  ),
  with_meta as (
    select
      a.is_correct,
      q.section,
      coalesce(nullif(q.category, ''), '—') as category,
      q.difficulty
    from attempts_window a
    join public.act_questions q on q.id = a.question_id
    where a.created_at >= p_lookback_start
      and q.deleted_at is null
      and q.is_broken = false
  ),
  per_category_agg as (
    select
      section,
      category,
      count(*) filter (where is_correct)::bigint as correct,
      count(*)::bigint                           as total
    from with_meta
    group by section, category
  ),
  per_section_with_categories as (
    select
      section,
      sum(correct)::bigint as correct,
      sum(total)::bigint   as total,
      jsonb_agg(
        jsonb_build_object('category', category, 'correct', correct, 'total', total)
        order by total desc
      ) as categories
    from per_category_agg
    group by section
  ),
  per_section_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'section',    section,
          'correct',    correct,
          'total',      total,
          'categories', categories
        )
        order by array_position(array['english', 'math', 'reading', 'science'], section)
      ),
      '[]'::jsonb
    ) as per_section
    from per_section_with_categories
  ),
  by_difficulty_agg as (
    select
      difficulty,
      count(*)::bigint                           as attempts,
      count(*) filter (where is_correct)::bigint as correct
    from with_meta
    where difficulty is not null
    group by difficulty
  ),
  by_difficulty_json as (
    select coalesce(
      jsonb_agg(
        jsonb_build_object('difficulty', difficulty, 'attempts', attempts, 'correct', correct)
        order by difficulty
      ),
      '[]'::jsonb
    ) as by_difficulty
    from by_difficulty_agg
  )
  select
    t.total_attempts,
    t.correct_attempts,
    t.week_attempts,
    p.per_section,
    d.by_difficulty
  from totals t
    cross join per_section_json p
    cross join by_difficulty_json d;
$$;

comment on function public.get_act_student_stats(uuid, timestamptz, timestamptz) is
  'ACT counterpart of get_student_dashboard_stats + get_student_extended_stats: '
  'lifetime / 7-day totals, per-section → per-category accuracy over the '
  'lookback window (live act_questions only), and the 1–5 difficulty split. '
  'SECURITY INVOKER — act_attempts RLS (can_view) scopes visibility.';

grant execute on function public.get_act_student_stats(uuid, timestamptz, timestamptz) to authenticated;
