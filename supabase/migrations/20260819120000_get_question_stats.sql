-- =========================================================
-- get_question_stats(question_id) — live per-question statistics
-- for the staff "Stats" modal on the question review page.
-- =========================================================
-- Why a function and not a read of item_stats: item_stats (§1.7) is
-- a manual snapshot (last refreshed 2026-07-13 in prod), covers
-- source='practice' only, and has no refresh schedule. The modal
-- wants live numbers over practice AND test attempts, so this
-- recomputes on demand for ONE question — cheap (attempts_question_id_idx;
-- tens to low hundreds of rows per question today) and fetched lazily
-- when the modal opens, never on page load.
--
-- Two cuts in one call:
--   all    — every student's attempts (bank-wide). Needs SECURITY
--            DEFINER because the attempts SELECT policy is roster-
--            scoped (user_id in list_visible_users()); a manager or
--            teacher querying attempts directly would silently get
--            "my roster" numbers, not "all students".
--   roster — the same aggregates restricted to list_visible_users(),
--            i.e. exactly the students the caller could already see
--            row-by-row under RLS. For admins this equals `all`.
--
-- Access: gated on is_teacher() (teacher | manager | admin), matching
-- item_stats_staff_select — aggregate counts only, no student ids, no
-- row-level data. The app layer additionally gates the modal to
-- manager/admin for now (lib/practice/question-stats-actions.ts);
-- widening to teachers is an app-side change, not a migration.
--
-- Storage realities this is built on (see 20260713200000_item_stats):
--   * the chosen MCQ option is attempts.response_text as a letter;
--     selected_option_id is always NULL; key = correct_answer->>'option_label'
--   * "first attempt" = earliest attempts row per (user, question)
--   * practice-test rows are inserted as placeholders (is_correct=false,
--     response_text null) on first touch and updated on answer, so a
--     blank response with is_correct=false may be a true omit OR a
--     pre-2026-06 row whose choice wasn't recorded. Accuracy counts
--     blanks as incorrect (test-scoring semantics); the distribution
--     reports them separately as `no_response`.
--   * time_spent_ms is null on ~half of rows and occasionally garbage
--     (time-ping accumulation); timing uses medians over 0 < t <= 30 min.
--
-- Output shape (jsonb):
--   { question_id, question_type, key_label, difficulty, score_band,
--     skill_code, skill_name,
--     all:    <cut>, roster: <cut>,
--     discrimination: { r, n },              -- point-biserial, all students
--     skill_baseline: { n, correct, n_questions } | null,      -- other items, same skill
--     skill_difficulty_baseline: { ... } | null,                -- same skill + difficulty
--     placements: [ { test_name, test_code, subject_code, module_number,
--                     route_code, ordinal, is_published } ],
--     signals: { assignments, error_notes, student_notes, question_notes,
--                desmos_states },
--     computed_at }
--   <cut> = { n_students, n_attempts, first_attempt_at, last_attempt_at,
--             first: { n, correct, no_response }, all: { n, correct },
--             distribution: [ { response, count, correct } ],   -- first attempts, top 12
--             timing: { n_timed, median_ms, p25_ms, p75_ms,
--                       median_correct_ms, median_wrong_ms },   -- first attempts
--             by_context: [ { context, n, correct } ],           -- first attempts
--             retry: { students_retried, wrong_first, recovered },
--             marked_for_review: { flagged, items } }

-- ── Helper: one cut (all students, or a given user set) ───────────
-- Internal. Execute is revoked from every app role; only the
-- SECURITY DEFINER entry point below (running as the owner) calls it.
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

-- ── Entry point ───────────────────────────────────────────────────
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

comment on function public.get_question_stats(uuid) is
  'Live per-question statistics for the staff Stats modal: bank-wide and '
  'roster-scoped cuts (first-attempt accuracy, response distribution, timing, '
  'context, retries), discrimination, skill baselines, test placements, '
  'count-only signals. Staff only (is_teacher()); aggregates, no student ids.';

revoke execute on function public.get_question_stats(uuid) from public, anon;
grant  execute on function public.get_question_stats(uuid) to authenticated;
