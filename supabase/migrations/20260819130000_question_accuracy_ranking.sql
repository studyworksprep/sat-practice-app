-- =========================================================
-- question_accuracy_ranking(min_students) — live per-question
-- accuracy over first attempts, for the admin hardest/easiest panel.
-- =========================================================
-- Replaces the last reader of questions_v2.attempt_count /
-- correct_count. Those denormalized counters were maintained by the
-- v1 increment_version_accuracy() function (dropped in
-- 20260621180000); nothing has written them since, so they froze at
-- the migration moment (prod: ~6.2k counted attempts vs ~27.8k real
-- rows; questions that got traffic afterwards sit at 0 and never
-- rank). /admin/performance was ranking hardest/easiest on them.
--
-- Definitions match get_question_stats() and item_stats so the panel
-- and the per-question Stats modal agree:
--   * one row per (student, question) = the student's EARLIEST attempt
--   * a blank response counts as incorrect (test-scoring semantics)
--   * published, non-broken, non-deleted questions only
--
-- SECURITY INVOKER on purpose: the attempts SELECT policy applies, so
-- an admin (sees everyone) gets the bank-wide ranking the panel wants,
-- while any other caller would only ever see their own roster's
-- numbers. No bypass, nothing to gate. ~27.8k-row scan today —
-- tens of ms; revisit with a materialized copy if attempts grow
-- by two orders of magnitude.

create or replace function public.question_accuracy_ranking(
  p_min_students integer default 5
)
returns table (
  question_id  uuid,
  display_code text,
  n_students   integer,
  n_correct    integer,
  accuracy     numeric,    -- 0..1, 3 dp
  domain_name  text,
  skill_name   text,
  difficulty   integer
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with fa as (
    select distinct on (a.user_id, a.question_id)
      a.user_id, a.question_id, a.is_correct
    from public.attempts a
    order by a.user_id, a.question_id, a.created_at, a.id
  ),
  agg as (
    select
      fa.question_id,
      count(*)::integer                            as n_students,
      count(*) filter (where fa.is_correct)::integer as n_correct
    from fa
    group by fa.question_id
  )
  select
    q.id,
    q.display_code,
    g.n_students,
    g.n_correct,
    round(g.n_correct::numeric / g.n_students, 3) as accuracy,
    q.domain_name,
    q.skill_name,
    q.difficulty
  from agg g
  join public.questions_v2 q on q.id = g.question_id
  where g.n_students >= greatest(coalesce(p_min_students, 1), 1)
    and q.is_published
    and not q.is_broken
    and q.deleted_at is null
  order by accuracy asc, g.n_students desc, q.display_code;
$$;

comment on function public.question_accuracy_ranking(integer) is
  'Per-question first-attempt accuracy (published, non-broken items with '
  '>= min_students students), ordered hardest first. SECURITY INVOKER: RLS '
  'on attempts scopes the result to what the caller can see.';

grant execute on function public.question_accuracy_ranking(integer) to authenticated;

-- Mark the dead counters so nobody reaches for them again. Dropping
-- them is deferred to the Phase 3 questions_v2 normalization pass.
comment on column public.questions_v2.attempt_count is
  'LEGACY — unmaintained since the v1 retirement (no writer; frozen values). '
  'Do not read. Use question_accuracy_ranking(), get_question_stats(), or item_stats.';
comment on column public.questions_v2.correct_count is
  'LEGACY — unmaintained since the v1 retirement (no writer; frozen values). '
  'Do not read. Use question_accuracy_ranking(), get_question_stats(), or item_stats.';
