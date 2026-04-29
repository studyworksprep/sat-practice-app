-- Student dashboard aggregates as a single RPC.
--
-- The /next student dashboard was running:
--   1–4. count(*) FROM attempts (4× exact-count head selects:
--        total / correct / week / accuracy)
--   5.   SELECT … FROM attempts FOR THE LAST 90 DAYS WHERE user
--        = caller (capped at 5000 rows) — pulled to JS just to
--        bucket per domain.
--   6.   chunked SELECTs against question_id_map for v1 → v2
--        translation
--   7.   chunked SELECTs against questions_v2 for the per-domain
--        metadata
--
-- Even with Promise.all, that's 4–7 sequential network round-trips
-- on every dashboard render and a 5000-row payload across the
-- network for nothing more than a Map walk. Pushing the whole
-- thing into one CTE chain lets Postgres do the joins, dedupes
-- the v1→v2 translation in a single pass, and returns one row
-- + one jsonb array back to the app.
--
-- SECURITY INVOKER + STABLE so RLS on attempts / questions_v2 /
-- question_id_map still applies as the calling user — same shape
-- as get_roster_skill_performance / get_roster_weekly_trend
-- (migration 000033). The caller passes its own user id; if a
-- malicious caller tried to pass someone else's, RLS on attempts
-- would still return zero rows.

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
-- Pin search_path so an attacker who manages to insert a row in
-- another schema named e.g. `attempts` can't shadow the public
-- table this function references. Closes the
-- function_search_path_mutable advisor finding.
set search_path = public, pg_temp
as $$
  with attempts_window as (
    -- All practice attempts for this user. Other source values
    -- (test / assignment) belong to the practice-test runner /
    -- assignment surfaces, not the dashboard's "your practice"
    -- counters.
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
  -- Per-domain bucketing for the lookback window. Mirrors the
  -- v1→v2 translation get_roster_skill_performance does: any
  -- attempt whose question_id is a v1 UUID gets walked through
  -- question_id_map to its v2 counterpart, attempts whose
  -- question_id is already v2 fall through unchanged. Then we
  -- join questions_v2 for the domain metadata, applying the
  -- standard publish/broken/deleted gate.
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
      q.domain_name
    from translated t
    join public.questions_v2 q
      on q.id = t.effective_question_id
    where q.is_published is true
      and q.is_broken is not true
      and q.deleted_at is null
      and q.domain_name is not null
  ),
  per_domain_agg as (
    select
      domain_code,
      domain_name,
      count(*) filter (where is_correct)::bigint as correct,
      count(*)::bigint                           as total
    from with_meta
    group by domain_code, domain_name
  ),
  per_domain_json as (
    -- jsonb_agg returns NULL on empty input; coalesce to an empty
    -- array so the calling app can always treat the value as a
    -- JSON array without a null check.
    select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'domain_code', domain_code,
          'domain_name', domain_name,
          'correct',     correct,
          'total',       total
        )
        order by total desc
      ),
      '[]'::jsonb
    ) as per_domain
    from per_domain_agg
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
