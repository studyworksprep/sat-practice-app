-- =========================================================
-- get_question_neighbors RPC — backfilled from production
-- =========================================================
-- Previously-uncommitted function referenced by
-- app/api/questions/[questionId]/neighbors/route.js. This file
-- matches the production function body as dumped via
-- pg_get_functiondef() on April 2026.
--
-- Call signature (from the route):
--   supabase.rpc('get_question_neighbors', {
--     current_question_id: uuid,
--     p_user_id:           uuid,
--     p_program:           text      -- 'SAT'
--     p_difficulty:        int | null,
--     p_score_bands:       int[] | null,
--     p_domain_name:       text | null,
--     p_skill_name:        text | null,
--     p_marked_only:       boolean,
--   })
-- Returns:
--   (prev_id uuid, next_id uuid)
--
-- Semantics:
--   Given a current question and a filter set, return the
--   "previous" and "next" questions in the filtered list
--   ordered by `created_at`. Note that "prev" means the
--   question with a LATER created_at (newer), and "next"
--   means the question with an EARLIER created_at (older) —
--   the UI walks the list backwards through history.
--
-- References the v1 question tables (`questions`,
-- `question_taxonomy`, `question_status`). Phase 3 of the
-- rebuild migrates this to questions_v2 along with the rest
-- of the v1 teardown.
--
-- LANGUAGE sql STABLE (not SECURITY DEFINER) — runs as the
-- calling user, which matches production. Permission grants
-- are not dumped from pg_get_functiondef; if production has
-- specific grants beyond the Supabase defaults we can add
-- them in a follow-up migration.
-- =========================================================

create or replace function public.get_question_neighbors(
  current_question_id uuid,
  p_user_id           uuid,
  p_program           text default 'SAT'::text,
  p_difficulty        integer default null::integer,
  p_score_bands       integer[] default null::integer[],
  p_domain_name       text default null::text,
  p_skill_name        text default null::text,
  p_marked_only       boolean default false
)
returns table (prev_id uuid, next_id uuid)
language sql
stable
as $function$
with me as (
  select
    q.id,
    q.created_at
  from questions q
  where q.id = current_question_id
  limit 1
),
eligible as (
  select
    q.id,
    q.created_at
  from questions q
  join question_taxonomy qt on qt.question_id = q.id
  where (p_program is null or qt.program = p_program)
    and (p_difficulty is null or qt.difficulty = p_difficulty)
    and (p_score_bands is null or qt.score_band = any(p_score_bands))
    and (p_domain_name is null or qt.domain_name = p_domain_name)
    and (p_skill_name is null or qt.skill_name = p_skill_name)
    and (
      p_marked_only = false
      or exists (
        select 1
        from question_status qs
        where qs.question_id = q.id
          and qs.user_id = p_user_id
          and qs.marked_for_review = true
      )
    )
),
prev_row as (
  select e.id
  from eligible e
  join me on true
  where (e.created_at > me.created_at)
     or (e.created_at = me.created_at and e.id > me.id)
  order by e.created_at asc, e.id asc
  limit 1
),
next_row as (
  select e.id
  from eligible e
  join me on true
  where (e.created_at < me.created_at)
     or (e.created_at = me.created_at and e.id < me.id)
  order by e.created_at desc, e.id desc
  limit 1
)
select
  (select id from prev_row) as prev_id,
  (select id from next_row) as next_id;
$function$;
