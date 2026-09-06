-- =========================================================
-- Student stat tiles count every attempt source; per-question
-- stats ignore accounts without a profiles row.
-- =========================================================
-- Investigation 2026-09-06 (owner report: "the numbers seem too
-- small"):
--
-- 1. The student detail / stats tiles (Total attempts, Accuracy,
--    Last 7 days, domain grid, by-day / difficulty / score-band) were
--    fed by student_practice_stats, get_student_dashboard_stats and
--    get_student_extended_stats, all filtered on
--    `source = 'practice'`. That silently dropped every practice-test
--    attempt (in-app tests, Bluebook uploads) plus the 39 rows from
--    the retired `source = 'review'` write path — 12,558 of 27,071
--    student rows in production (46%; 19 of 61 students had more than
--    half their work hidden). The weekly trend chart on the same page
--    (get_roster_weekly_trend) never had the filter, so the tiles and
--    the chart disagreed. Owner decision: the tiles count test
--    attempts too. Semantics now match get_question_stats — every row
--    counts, and a blank test response (placeholder row, is_correct =
--    false) counts as an incorrect attempt, test-scoring style.
--
-- 2. get_question_stats (the staff Stats modal) is SECURITY DEFINER
--    and read every attempts row for the question, including 56 rows
--    from an auth user that has no profiles row (a test account; it
--    is invisible to every roster-scoped surface because
--    list_visible_users() joins profiles). Owner decision: exclude it
--    rather than let it distort the bank-wide cut. Every attempts scan
--    inside the modal's functions now requires a profiles row for the
--    attempt's user. The roster cut was already profile-gated via
--    list_visible_users(); the RLS-scoped readers
--    (question_accuracy_ranking, /admin/performance) were too.
--
-- No signature changes; lib/types/database.ts is unaffected.

-- ── 1a. student_practice_stats: every source ──────────────────────
create or replace view public.student_practice_stats
  with (security_invoker = true)
as
select
  p.id                                                                         as user_id,
  p.email,
  p.first_name,
  p.last_name,
  p.target_sat_score,
  p.high_school,
  p.graduation_year,
  p.sat_test_date,
  count(a.id)                                                                  as total_attempts,
  count(a.id) filter (where a.is_correct)                                      as correct_attempts,
  count(a.id) filter (where a.created_at >= now() - interval '7 days')         as week_attempts,
  max(a.created_at)                                                            as last_activity_at
from public.profiles p
left join public.attempts a on a.user_id = p.id
where p.role = 'student'
group by p.id;

grant select on public.student_practice_stats to authenticated;

-- ── 1b. get_student_dashboard_stats: every source ─────────────────
create or replace function public.get_student_dashboard_stats(
  p_user_id uuid,
  p_week_ago timestamp with time zone,
  p_lookback_start timestamp with time zone
)
returns table(
  total_attempts bigint,
  correct_attempts bigint,
  week_attempts bigint,
  per_domain jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with attempts_window as (
    -- Every source: practice sessions, assignments, review drills,
    -- practice tests. Was `and a.source = 'practice'` until 2026-09-06.
    select
      a.id,
      a.is_correct,
      a.question_id,
      a.created_at
    from public.attempts a
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
      q.domain_code,
      q.domain_name,
      q.skill_code,
      q.skill_name
    from attempts_window a
    join public.questions_v2 q
      on q.id = a.question_id
    where a.created_at >= p_lookback_start
      and q.is_published is true
      and q.is_broken is not true
      and q.deleted_at is null
      and q.domain_name is not null
  ),
  per_skill_agg as (
    select
      domain_code,
      domain_name,
      skill_code,
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

-- ── 1c. get_student_extended_stats: every source ──────────────────
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
    -- Every source (was `and a.source = 'practice'` until 2026-09-06).
    select
      a.is_correct,
      a.question_id,
      a.created_at
    from public.attempts a
    where a.user_id = p_user_id
      and a.created_at >= p_lookback_start
  ),
  with_meta as (
    -- Left-join preserved so attempts on unpublished/broken/deleted
    -- questions still contribute to by_day (with null
    -- difficulty/score_band, which the downstream CTEs drop).
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

-- ── 2a. question_stats_cut: profile-gated ─────────────────────────
-- Same body as 20260819120000 plus the profiles gate on `base`.
create or replace function public.question_stats_cut(
  p_question_id uuid,
  p_users uuid[]            -- null = no filter (bank-wide)
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with base as (
    select
      a.id as attempt_id,
      a.user_id,
      a.is_correct,
      a.created_at,
      a.time_spent_ms,
      -- A handful of legacy rows stored the JSON-encoded letter ("A");
      -- strip one layer of wrapping quotes so they bucket with A.
      nullif(regexp_replace(btrim(a.response_text), '^"(.*)"$', '\1'), '') as resp,
      case
        when a.context_type is not null then a.context_type
        when a.source = 'practice_test' then 'test'
        when a.source = 'review'        then 'review'
        else 'practice'
      end as ctx,
      row_number() over (partition by a.user_id order by a.created_at, a.id) as rn
    from public.attempts a
    where a.question_id = p_question_id
      and (p_users is null or a.user_id = any (p_users))
      -- Accounts without a profiles row (test accounts, half-created
      -- signups) are invisible everywhere else; keep them out here too.
      and exists (select 1 from public.profiles p where p.id = a.user_id)
  ),
  fa as (
    select * from base where rn = 1
  ),
  timed as (
    select is_correct, time_spent_ms
    from fa
    where time_spent_ms > 0 and time_spent_ms <= 1800000
  ),
  per_user as (
    select
      user_id,
      count(*) as cnt,
      bool_or(is_correct) filter (where rn = 1) as first_correct,
      bool_or(is_correct) filter (where rn > 1) as later_correct
    from base
    group by user_id
  ),
  dist as (
    select resp, count(*) as n, count(*) filter (where is_correct) as correct
    from fa
    where resp is not null
    group by resp
    order by n desc, resp
    limit 12
  ),
  by_ctx as (
    select ctx, count(*) as n, count(*) filter (where is_correct) as correct
    from fa
    group by ctx
  ),
  flagged as (
    select
      count(*) filter (where i.marked_for_review) as flagged,
      count(*) as items
    from base b
    join public.practice_test_item_attempts_v2 i on i.attempt_id = b.attempt_id
  )
  select jsonb_build_object(
    'n_students',       (select count(*) from fa),
    'n_attempts',       (select count(*) from base),
    'first_attempt_at', (select min(created_at) from base),
    'last_attempt_at',  (select max(created_at) from base),
    'first', jsonb_build_object(
      'n',           (select count(*) from fa),
      'correct',     (select count(*) filter (where is_correct) from fa),
      'no_response', (select count(*) filter (where resp is null) from fa)
    ),
    'all', jsonb_build_object(
      'n',       (select count(*) from base),
      'correct', (select count(*) filter (where is_correct) from base)
    ),
    'distribution', coalesce(
      (select jsonb_agg(
                jsonb_build_object('response', resp, 'count', n, 'correct', correct)
                order by n desc, resp)
         from dist),
      '[]'::jsonb),
    'timing', jsonb_build_object(
      'n_timed',           (select count(*) from timed),
      'median_ms',         (select round(percentile_cont(0.5)  within group (order by time_spent_ms)) from timed),
      'p25_ms',            (select round(percentile_cont(0.25) within group (order by time_spent_ms)) from timed),
      'p75_ms',            (select round(percentile_cont(0.75) within group (order by time_spent_ms)) from timed),
      'median_correct_ms', (select round(percentile_cont(0.5)  within group (order by time_spent_ms)) from timed where is_correct),
      'median_wrong_ms',   (select round(percentile_cont(0.5)  within group (order by time_spent_ms)) from timed where not is_correct)
    ),
    'by_context', coalesce(
      (select jsonb_agg(
                jsonb_build_object('context', ctx, 'n', n, 'correct', correct)
                order by n desc, ctx)
         from by_ctx),
      '[]'::jsonb),
    'retry', jsonb_build_object(
      'students_retried', (select count(*) filter (where cnt > 1) from per_user),
      'wrong_first',      (select count(*) filter (where not first_correct) from per_user),
      'recovered',        (select count(*) filter (where not first_correct and later_correct) from per_user)
    ),
    'marked_for_review', (select jsonb_build_object('flagged', flagged, 'items', items) from flagged)
  );
$$;

revoke execute on function public.question_stats_cut(uuid, uuid[]) from public, anon, authenticated;

-- ── 2b. get_question_stats: profile-gated discrimination + baselines ─
-- Same body as 20260819120000 plus the profiles gate on every
-- attempts scan (the cuts are gated inside question_stats_cut).
create or replace function public.get_question_stats(p_question_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_q          record;
  v_roster     uuid[];
  v_all        jsonb;
  v_roster_cut jsonb;
  v_disc       record;
  v_skill      record;
  v_skill_diff record;
  v_placements jsonb;
  v_signals    jsonb;
begin
  if not public.is_teacher() then
    raise exception 'forbidden: staff only' using errcode = '42501';
  end if;

  select
    q.id, q.question_type, q.skill_code, q.skill_name, q.difficulty, q.score_band,
    -- Canonical shape is {option_label: 'B'}; tolerate the legacy bare
    -- string / array shapes the JS helper (lib/practice/correct-answer.js)
    -- also accepts.
    case jsonb_typeof(q.correct_answer)
      when 'object' then q.correct_answer->>'option_label'
      when 'string' then q.correct_answer #>> '{}'
      when 'array'  then q.correct_answer->>0
      else null
    end as key_label
  into v_q
  from public.questions_v2 q
  where q.id = p_question_id;

  if not found then
    return null;
  end if;

  v_roster     := array(select user_id from public.list_visible_users());
  v_all        := public.question_stats_cut(p_question_id, null);
  v_roster_cut := public.question_stats_cut(p_question_id, v_roster);

  -- plpgsql records must be assigned before their fields are read;
  -- seed the optional baselines as "absent".
  select null::bigint as n, null::bigint as correct, null::bigint as n_questions into v_skill;
  select null::bigint as n, null::bigint as correct, null::bigint as n_questions into v_skill_diff;

  -- Discrimination: point-biserial between first-attempt correctness on
  -- this item and each student's first-attempt accuracy on every OTHER
  -- item (>= 10 items so the ability estimate isn't noise). NULL when
  -- undefined (n < 2 or zero variance). Bank-wide only.
  with fa as (
    select distinct on (a.user_id) a.user_id, a.is_correct
    from public.attempts a
    where a.question_id = p_question_id
      and exists (select 1 from public.profiles p where p.id = a.user_id)
    order by a.user_id, a.created_at, a.id
  ),
  ability as (
    select s.user_id,
           avg(case when s.is_correct then 1.0 else 0.0 end) as ability,
           count(*) as n_items
    from (
      select distinct on (a.user_id, a.question_id) a.user_id, a.question_id, a.is_correct
      from public.attempts a
      where a.user_id in (select user_id from fa)
        and a.question_id <> p_question_id
      order by a.user_id, a.question_id, a.created_at, a.id
    ) s
    group by s.user_id
  )
  select
    corr((case when fa.is_correct then 1 else 0 end)::float8, ab.ability::float8) as r,
    count(*) as n
  into v_disc
  from fa
  join ability ab on ab.user_id = fa.user_id
  where ab.n_items >= 10;

  -- Skill baseline: first-attempt accuracy across OTHER questions in
  -- the same skill (and, separately, same skill + same difficulty).
  if v_q.skill_code is not null then
    select count(*) as n,
           count(*) filter (where s.is_correct) as correct,
           count(distinct s.question_id) as n_questions
    into v_skill
    from (
      select distinct on (a.user_id, a.question_id) a.user_id, a.question_id, a.is_correct
      from public.attempts a
      join public.questions_v2 q on q.id = a.question_id
      where q.skill_code = v_q.skill_code
        and q.id <> p_question_id
        and exists (select 1 from public.profiles p where p.id = a.user_id)
      order by a.user_id, a.question_id, a.created_at, a.id
    ) s;

    if v_q.difficulty is not null then
      select count(*) as n,
             count(*) filter (where s.is_correct) as correct,
             count(distinct s.question_id) as n_questions
      into v_skill_diff
      from (
        select distinct on (a.user_id, a.question_id) a.user_id, a.question_id, a.is_correct
        from public.attempts a
        join public.questions_v2 q on q.id = a.question_id
        where q.skill_code = v_q.skill_code
          and q.difficulty = v_q.difficulty
          and q.id <> p_question_id
          and exists (select 1 from public.profiles p where p.id = a.user_id)
        order by a.user_id, a.question_id, a.created_at, a.id
      ) s;
    end if;
  end if;

  -- Where the question is placed in practice tests.
  select coalesce(jsonb_agg(jsonb_build_object(
           'test_name',     t.name,
           'test_code',     t.code,
           'subject_code',  m.subject_code,
           'module_number', m.module_number,
           'route_code',    m.route_code,
           'ordinal',       mi.ordinal,
           'is_published',  t.is_published
         ) order by t.name, m.subject_code, m.module_number, m.route_code, mi.ordinal), '[]'::jsonb)
  into v_placements
  from public.practice_test_module_items_v2 mi
  join public.practice_test_modules_v2 m on m.id = mi.practice_test_module_id
  join public.practice_tests_v2 t on t.id = m.practice_test_id
  where mi.question_id = p_question_id
    and t.deleted_at is null;

  -- Count-only signals from tables the caller may not be able to read
  -- row-by-row (student error log / notes are private to the student).
  select jsonb_build_object(
    'assignments',    (select count(*) from public.assignments_v2 x
                        where p_question_id = any (x.question_ids) and x.deleted_at is null),
    'error_notes',    (select count(*) from public.question_error_notes e where e.question_id = p_question_id),
    'student_notes',  (select count(*) from public.student_notes n where n.question_id = p_question_id),
    'question_notes', (select count(*) from public.question_notes n where n.question_id = p_question_id),
    'desmos_states',  (select count(*) from public.desmos_saved_states d where d.question_id = p_question_id)
  )
  into v_signals;

  return jsonb_build_object(
    'question_id',   v_q.id,
    'question_type', v_q.question_type,
    'key_label',     v_q.key_label,
    'difficulty',    v_q.difficulty,
    'score_band',    v_q.score_band,
    'skill_code',    v_q.skill_code,
    'skill_name',    v_q.skill_name,
    'all',           v_all,
    'roster',        v_roster_cut,
    'discrimination', jsonb_build_object('r', round(v_disc.r::numeric, 3), 'n', v_disc.n),
    'skill_baseline',
      case when coalesce(v_skill.n, 0) = 0 then null
           else jsonb_build_object('n', v_skill.n, 'correct', v_skill.correct, 'n_questions', v_skill.n_questions) end,
    'skill_difficulty_baseline',
      case when coalesce(v_skill_diff.n, 0) = 0 then null
           else jsonb_build_object('n', v_skill_diff.n, 'correct', v_skill_diff.correct, 'n_questions', v_skill_diff.n_questions) end,
    'placements',    v_placements,
    'signals',       v_signals,
    'computed_at',   now()
  );
end;
$$;

revoke execute on function public.get_question_stats(uuid) from public, anon;
grant  execute on function public.get_question_stats(uuid) to authenticated;
