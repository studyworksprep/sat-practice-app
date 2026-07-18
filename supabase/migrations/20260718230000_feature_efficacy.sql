-- =========================================================
-- Content efficacy: feature_efficacy (upgrade plan §3.5,
-- greenfield §5.9)
-- =========================================================
-- Measures whether lessons work: per (lesson, skill), first-attempt
-- practice accuracy BEFORE vs AFTER each student completed the
-- lesson, aggregated over students who have signal on both sides.
--
-- Design decisions:
-- - Population: students with lesson_progress.completed_at set —
--   the completion moment is the pre/post boundary. Skills come
--   from the lesson's skill-level lesson_topics tags (domain-level
--   tags are display chips, same rule as get_plan_inputs).
-- - Attempts: FIRST practice attempt per (student, question), the
--   same convention as get_skill_mastery_asof / the snapshot jobs,
--   so "post" measures fresh questions seen after the lesson — not
--   re-answers of questions the student already knew.
-- - Paired sample: a student counts only with ≥1 pre AND ≥1 post
--   first-attempt on the skill; `students` is that paired count.
--   Unpaired students would bias the split (e.g. a student who only
--   practiced after the lesson inflates post with no baseline).
-- - Materialized table + SECURITY DEFINER refresh, service_role
--   only — the item_stats pattern. pg_cron is still not installed,
--   so refresh is on demand (admin lessons page button); wire it to
--   the nightly snapshot job when that gets scheduled.
-- - The plan sketch says "materialized from mastery snapshots";
--   snapshots are daily aggregates and can't split cleanly around a
--   per-student completion timestamp, so this computes from the
--   same first-attempts base the snapshots themselves are built on.
--
-- Applied via Supabase MCP apply_migration (dev + prod) 2026-07-18;
-- this file is the audit record (see supabase/migrations/README.md).

create table if not exists public.feature_efficacy (
  lesson_id     uuid not null references public.lessons(id) on delete cascade,
  skill_code    text not null,
  pre_attempts  integer not null default 0,
  pre_correct   integer not null default 0,
  pre_accuracy  numeric(5,4),
  post_attempts integer not null default 0,
  post_correct  integer not null default 0,
  post_accuracy numeric(5,4),
  students      integer not null default 0,
  refreshed_at  timestamptz not null default now(),
  primary key (lesson_id, skill_code)
);

comment on table public.feature_efficacy is
  'Per (lesson, skill) pre/post first-attempt practice accuracy around lesson completion (§3.5). Refreshed by refresh_feature_efficacy().';

-- RLS: author/staff tooling — no student PII in the aggregates, but
-- keep it staff-only (same posture as item_stats).
alter table public.feature_efficacy enable row level security;

drop policy if exists feature_efficacy_staff_select on public.feature_efficacy;
drop policy if exists feature_efficacy_admin_write  on public.feature_efficacy;

create policy feature_efficacy_staff_select on public.feature_efficacy
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role in ('teacher', 'manager'))
  );
create policy feature_efficacy_admin_write on public.feature_efficacy
  for all to public using (public.is_admin()) with check (public.is_admin());

-- ── Refresh (recompute all) ────────────────────────────────────────
create or replace function public.refresh_feature_efficacy()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_rows integer;
begin
  -- WHERE true: the Supabase API connection path loads safeupdate,
  -- which rejects a bare DELETE even inside SECURITY DEFINER
  -- functions (found live 2026-07-18; fixed in the companion
  -- feature_efficacy_safeupdate_fix migration).
  delete from public.feature_efficacy where true;

  with completions as (
    -- One row per (lesson, tagged skill, completing student).
    select lp.lesson_id, lt.skill_code, lp.student_id, lp.completed_at
    from public.lesson_progress lp
    join public.lesson_topics lt
      on lt.lesson_id = lp.lesson_id and lt.skill_code is not null
    where lp.completed_at is not null
  ),
  firsts as (
    -- First practice attempt per (student, question), the mastery
    -- convention (see get_skill_mastery_asof).
    select distinct on (a.user_id, a.question_id)
      a.user_id, a.question_id, a.is_correct, a.created_at, q.skill_code
    from public.attempts a
    join public.questions_v2 q on q.id = a.question_id
    where a.source = 'practice' and q.skill_code is not null
    order by a.user_id, a.question_id, a.created_at
  ),
  per_student as (
    select
      c.lesson_id, c.skill_code, c.student_id,
      count(*) filter (where f.created_at <  c.completed_at) as pre_n,
      count(*) filter (where f.created_at <  c.completed_at and f.is_correct) as pre_c,
      count(*) filter (where f.created_at >= c.completed_at) as post_n,
      count(*) filter (where f.created_at >= c.completed_at and f.is_correct) as post_c
    from completions c
    join firsts f
      on f.user_id = c.student_id and f.skill_code = c.skill_code
    group by c.lesson_id, c.skill_code, c.student_id
  ),
  paired as (
    select * from per_student where pre_n > 0 and post_n > 0
  )
  insert into public.feature_efficacy (
    lesson_id, skill_code,
    pre_attempts, pre_correct, pre_accuracy,
    post_attempts, post_correct, post_accuracy,
    students, refreshed_at
  )
  select
    lesson_id, skill_code,
    sum(pre_n), sum(pre_c),
    round(sum(pre_c)::numeric / nullif(sum(pre_n), 0), 4),
    sum(post_n), sum(post_c),
    round(sum(post_c)::numeric / nullif(sum(post_n), 0), 4),
    count(*), now()
  from paired
  group by lesson_id, skill_code;

  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.refresh_feature_efficacy() from public;
grant execute on function public.refresh_feature_efficacy() to service_role;
