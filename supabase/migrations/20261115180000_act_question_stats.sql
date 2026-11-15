-- =========================================================
-- get_question_stats: ACT questions
-- =========================================================
-- The staff "Stats" modal (lib/practice/QuestionStatsButton.tsx) is
-- rendered on every report question, ACT included, but
-- get_question_stats only looked the id up in questions_v2. ACT ids
-- live in act_questions, so every ACT click came back null and the
-- modal said "Question not found".
--
-- get_question_stats stays the single entry point (same signature,
-- same is_teacher() gate). When the id is not a questions_v2 row it
-- now hands off to act_question_stats(), which builds the same
-- payload from the ACT tables. SAT payloads gain 'test_type': 'sat';
-- the SAT computation is otherwise unchanged from the live
-- definition (20260906120000, profile-gated).
--
-- ACT storage realities the ACT path is built on:
--   * attempts are act_attempts; the chosen option is
--     selected_option_id -> act_answer_options.label (always set),
--     the key is the act_answer_options row with is_correct.
--   * source is 'practice' | 'practice_test'. There is no
--     context_type, so assignments and review sessions read as
--     'practice'.
--   * test omissions write no act_attempts row (no placeholders), so
--     no_response is always 0 and an omitted test question is simply
--     absent from n.
--   * "marked for review (tests)" comes from practice_sessions.
--     marked_positions (0-based) on the section sessions an ACT test
--     attempt owns: act_practice_test_attempts.sections[].session_id,
--     plus the legacy single practice_session_id.
--   * taxonomy: skill = subcategory for math questions that carry one,
--     category otherwise (lib/practice/build-act-session-review.js);
--     difficulty is 1-5 (null when unlabelled).
--   * placement = the question's own form: source_test + section +
--     source_ordinal; test_name is act_forms.display_name or null
--     (the app derives the default name, lib/practice/act-form-names.ts).
--
-- Extra ACT payload keys: 'test_type': 'act', 'option_labels'
-- (labels in display order). Placements carry null module_number and
-- route_code. Everything is still aggregate counts — no student ids.

-- ── Helper: one ACT cut (all students, or a given user set) ──────
create or replace function public.act_question_stats_cut(
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
      o.label as resp,
      case when a.source = 'practice_test' then 'test' else 'practice' end as ctx,
      row_number() over (partition by a.user_id order by a.created_at, a.id) as rn
    from public.act_attempts a
    left join public.act_answer_options o on o.id = a.selected_option_id
    where a.question_id = p_question_id
      and (p_users is null or a.user_id = any (p_users))
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
  -- Section sessions owned by ACT practice-test attempts of users in
  -- the cut. CASE keeps a malformed id from aborting the cast.
  test_sessions as (
    select distinct
      case when s.sid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
           then s.sid::uuid end as session_id
    from public.act_practice_test_attempts t
    cross join lateral (
      select e->>'session_id' as sid
      from jsonb_array_elements(
        case when jsonb_typeof(t.sections) = 'array' then t.sections else '[]'::jsonb end
      ) e
      union all
      select t.practice_session_id::text
    ) s
    where s.sid is not null
      and (p_users is null or t.user_id = any (p_users))
      and exists (select 1 from public.profiles p where p.id = t.user_id)
  ),
  flagged as (
    select
      count(*) filter (where (q.pos - 1)::int = any (coalesce(ps.marked_positions, '{}'))) as flagged,
      count(*) as items
    from public.practice_sessions ps
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(ps.question_ids) = 'array' then ps.question_ids else '[]'::jsonb end
    ) with ordinality as q(qid, pos)
    where ps.id in (select session_id from test_sessions where session_id is not null)
      and ps.test_type = 'act'
      and q.qid = p_question_id::text
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

revoke execute on function public.act_question_stats_cut(uuid, uuid[]) from public, anon, authenticated;

-- ── Helper: full ACT payload (null when the id is not an ACT question)
-- Internal: no gate of its own. Only get_question_stats (which checks
-- is_teacher() first) calls it; execute is revoked from app roles.
create or replace function public.act_question_stats(p_question_id uuid)
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
  select
    q.id, q.question_type, q.section, q.difficulty,
    case when q.section = 'math' and nullif(q.subcategory, '') is not null
         then q.subcategory_code else q.category_code end as skill_code,
    case when q.section = 'math' and nullif(q.subcategory, '') is not null
         then q.subcategory else q.category end as skill_name,
    (select o.label from public.act_answer_options o
      where o.question_id = q.id and o.is_correct
      order by o.ordinal limit 1) as key_label,
    (select coalesce(jsonb_agg(o.label order by o.ordinal), '[]'::jsonb)
       from public.act_answer_options o
      where o.question_id = q.id) as option_labels
  into v_q
  from public.act_questions q
  where q.id = p_question_id;

  if not found then
    return null;
  end if;

  v_roster     := array(select user_id from public.list_visible_users());
  v_all        := public.act_question_stats_cut(p_question_id, null);
  v_roster_cut := public.act_question_stats_cut(p_question_id, v_roster);

  select null::bigint as n, null::bigint as correct, null::bigint as n_questions into v_skill;
  select null::bigint as n, null::bigint as correct, null::bigint as n_questions into v_skill_diff;

  -- Discrimination: as for SAT, against each student's first-attempt
  -- accuracy on their OTHER ACT items (>= 10).
  with fa as (
    select distinct on (a.user_id) a.user_id, a.is_correct
    from public.act_attempts a
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
      from public.act_attempts a
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

  -- Skill baselines: other ACT questions in the same section whose
  -- skill (same rule as above) matches, then also the same difficulty.
  if v_q.skill_code is not null then
    select count(*) as n,
           count(*) filter (where s.is_correct) as correct,
           count(distinct s.question_id) as n_questions
    into v_skill
    from (
      select distinct on (a.user_id, a.question_id) a.user_id, a.question_id, a.is_correct
      from public.act_attempts a
      join public.act_questions q on q.id = a.question_id
      where q.section = v_q.section
        and (case when q.section = 'math' and nullif(q.subcategory, '') is not null
                  then q.subcategory_code else q.category_code end) = v_q.skill_code
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
        from public.act_attempts a
        join public.act_questions q on q.id = a.question_id
        where q.section = v_q.section
          and (case when q.section = 'math' and nullif(q.subcategory, '') is not null
                    then q.subcategory_code else q.category_code end) = v_q.skill_code
          and q.difficulty = v_q.difficulty
          and q.id <> p_question_id
          and exists (select 1 from public.profiles p where p.id = a.user_id)
        order by a.user_id, a.question_id, a.created_at, a.id
      ) s;
    end if;
  end if;

  -- Placement: the form the question was imported from.
  select coalesce(jsonb_agg(jsonb_build_object(
           'test_name',     nullif(btrim(f.display_name), ''),
           'test_code',     q.source_test,
           'subject_code',  q.section,
           'module_number', null,
           'route_code',    null,
           'ordinal',       q.source_ordinal,
           'is_published',  true
         )), '[]'::jsonb)
  into v_placements
  from public.act_questions q
  left join public.act_forms f on f.source_test = q.source_test
  where q.id = p_question_id
    and q.source_test is not null
    and q.deleted_at is null;

  -- Count-only signals; these tables key ACT questions by
  -- act_questions.id (their questions_v2 FKs were dropped in
  -- 20260514000000).
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
    'test_type',     'act',
    'question_id',   v_q.id,
    'question_type', v_q.question_type,
    'key_label',     v_q.key_label,
    'option_labels', v_q.option_labels,
    'difficulty',    v_q.difficulty,
    'score_band',    null,
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

revoke execute on function public.act_question_stats(uuid) from public, anon, authenticated;

-- ── Entry point: SAT as before, ACT hand-off when not a questions_v2 id
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
    -- Not a SAT question: try ACT (null when it isn't one either).
    return public.act_question_stats(p_question_id);
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
    'test_type',     'sat',
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

comment on function public.get_question_stats(uuid) is
  'Live per-question statistics for the staff Stats modal, SAT (questions_v2) '
  'or ACT (act_questions, via act_question_stats): bank-wide and roster-scoped '
  'cuts (first-attempt accuracy, response distribution, timing, context, '
  'retries), discrimination, skill baselines, test placements, count-only '
  'signals. Staff only (is_teacher()); aggregates, no student ids.';

revoke execute on function public.get_question_stats(uuid) from public, anon;
grant  execute on function public.get_question_stats(uuid) to authenticated;
