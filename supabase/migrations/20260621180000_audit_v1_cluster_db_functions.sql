-- Stage E-4 follow-up: retire v1-cluster references from DB functions.
--
-- The cluster audit found 11 functions still touching the v1 question
-- cluster. After Stage E-4 normalized attempts.question_id to v2, they
-- fall into three buckets:
--
--   A) Drop — eight functions that are either already broken (reference
--      tables that no longer exist in `public`: question_state was
--      removed long ago, question_status moved to _legacy) or simply
--      have zero remaining app-code callers. No PostgREST surface, no
--      RPC call from any .js/.ts file, no trigger dependency.
--
--   B) Simplify — three hot functions (the student dashboard, the
--      extended-stats panel, and the tutor roster performance grid)
--      that encoded the v1↔v2 union at the SQL level via
--      `left join question_id_map ... coalesce(m.new_question_id, …)`.
--      Now that every attempts.question_id is v2, the left-join always
--      misses and the coalesce always returns the right side. Folding
--      it out preserves behavior and drops a wasted join from each
--      query's hot path.
--
--   C) Keep — sync_question_assignment_to_v2 (live trigger on
--      public.question_assignments, can't retire until that v1 surface
--      itself is retired) and migration_status (left in place by the
--      earlier answer-cluster archive).

-- ─────────────────────────────────────────────────────────────────────
-- Bucket A: drop unreachable v1-cluster functions.
-- ─────────────────────────────────────────────────────────────────────

-- Already broken: references public.question_state which doesn't
-- exist in any schema; also writes attempts.selected_answer (the v1
-- column name — current attempts uses response_text). Zero app callers.
drop function if exists public.submit_attempt(uuid, text);

-- Already broken: references nonexistent public.question_state and
-- v1 questions.{domain, skill_desc}. Zero app callers. Both overloads.
drop function if exists public.get_question_outline_counts(integer, integer, boolean);
drop function if exists public.get_question_outline_counts(integer, integer[], boolean);

-- Schema drift item from CLAUDE.md ("exists in prod but isn't in any
-- migration"). Both overloads reference v1 questions + question_taxonomy
-- and unqualified question_status (now _legacy). Zero app callers.
drop function if exists public.get_question_neighbors(uuid, text, smallint, smallint[], text, text, boolean);
drop function if exists public.get_question_neighbors(uuid, uuid, text, integer, integer[], text, text, boolean);

-- Writes v1 questions.is_broken/broken_by/broken_at. v2 has its own
-- broken-flag flow on questions_v2. Zero app callers.
drop function if exists public.set_question_broken(uuid, boolean);

-- Updates question_versions.attempt_count/correct_count. v2 tracks
-- accuracy on questions_v2 directly. Zero app callers.
drop function if exists public.increment_version_accuracy(jsonb);

-- One-shot migration helper that copied question_status.notes →
-- question_error_notes. References _legacy.question_status (broken).
-- The migration ran; the table is archived. Zero app callers.
drop function if exists public.import_student_error_notes(uuid);

-- ─────────────────────────────────────────────────────────────────────
-- Bucket B: simplify the v1↔v2 union joins to direct questions_v2
-- joins. Behavior is identical because question_id_map.new_question_id
-- is null for every current attempts row (all rows are already v2).
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.get_roster_skill_performance(
  p_roster uuid[],
  p_since timestamp with time zone,
  p_min_skill_attempts integer default 5,
  p_min_student_attempts integer default 3,
  p_struggling_threshold double precision default 0.6
)
returns table(
  skill_code text,
  skill_name text,
  domain_code text,
  domain_name text,
  attempts bigint,
  correct bigint,
  missed bigint,
  accuracy double precision,
  students_touched bigint,
  students_below_60 bigint
)
language sql
stable
security invoker
as $$
  with joined as (
    -- attempts.question_id is exclusively v2-keyed after Stage E-4;
    -- no question_id_map walk needed.
    select
      a.user_id,
      a.is_correct,
      q.skill_code,
      q.skill_name,
      q.domain_code,
      q.domain_name
    from public.attempts a
    join public.questions_v2 q on q.id = a.question_id
    where a.user_id = any(p_roster)
      and a.created_at >= p_since
      and q.is_published = true
      and q.is_broken = false
      and q.deleted_at is null
      and q.skill_code is not null
  ),
  per_student_skill as (
    select
      user_id,
      skill_code,
      count(*)                           as ps_attempts,
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
      max(j.skill_name)                    as skill_name,
      max(j.domain_code)                   as domain_code,
      max(j.domain_name)                   as domain_name,
      count(*)                             as attempts,
      count(*) filter (where j.is_correct) as correct,
      count(distinct j.user_id)            as students_touched
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
  with_meta as (
    -- attempts.question_id is exclusively v2-keyed after Stage E-4;
    -- the question_id_map detour folded out.
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
    -- attempts.question_id is exclusively v2-keyed after Stage E-4;
    -- the question_id_map detour folded out. Left-join preserved so
    -- attempts on unpublished/broken/deleted questions still
    -- contribute to by_day (with null difficulty/score_band, which
    -- the downstream by_difficulty / by_score_band CTEs drop).
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
