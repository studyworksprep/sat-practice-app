-- =========================================================
-- skill_mastery_snapshots — per-skill mastery as a time series
-- =========================================================
-- Upgrade plan 2026-07 §1.1. Until now mastery existed ONLY in
-- lib/mastery.js (called solely by the Lessonworks sync) and was
-- recomputed on read at DOMAIN grain; nothing persisted it and the
-- live get_student_dashboard_stats computes plain accuracy. This
-- migration ports that JS formula to SQL — pinned to a shared test
-- vector (lib/mastery.fixtures.json) so the two can never drift —
-- and persists a per-(student, skill) daily series so later features
-- (coverage §1.3, trends, decay, re-pacing) READ instead of recompute.
--
-- Owner decisions (2026-07-13):
--   * Population = FIRST-attempts (matches lib/mastery.js: the earliest
--     practice attempt per question), NOT all attempts.
--   * SAT-only day one. test_type is carried for forward-wiring ACT,
--     but ACT (act_questions/act_attempts) has no domain/skill/score_band
--     and a 1-5 difficulty scale, so it needs its own mapping + weight
--     calibration before it can be snapshotted. Only 'sat' is populated.
--   * Question filter matches the canonical JS path (lib/lessonworksSync.js
--     buildStudentPayload): require taxonomy present (domain_code +
--     skill_code not null); do NOT filter on is_published/is_broken/
--     deleted_at — a historical attempt is a fact, and the question was
--     validly served when answered.
--
-- The mastery formula (verbatim from lib/mastery.js):
--   w                = diff_weight(difficulty) * band_weight(score_band)
--   weighted_correct = Σ w where is_correct
--   weighted_total   = Σ w
--   raw_accuracy     = weighted_correct / weighted_total   (0 if total 0)
--   volume_factor    = 1 - exp(-0.15 * n)                  (n = #attempts)
--   recency_bonus    = 0.05 if last-14-day accuracy > 70% over >=3, else 0
--   mastery          = round(raw_accuracy * volume_factor
--                            * (1 + recency_bonus) * 100), capped at 100
--   diff_weight: 1->0.6, 2->1.0, 3->1.5, else 1.0
--   band_weight: 1->0.7, 2->0.85, 3->1.0, 4->1.15, 5->1.3, 6->1.5,
--                7->1.7, else 1.15   (null score_band => 1.15)

-- ── The formula, split into two reusable, IMMUTABLE pieces ──────────
-- mastery_weight is the per-attempt weight; compute_mastery_score is the
-- pure aggregate→score function that lib/mastery.ts mirrors exactly and
-- lib/mastery.fixtures.json pins. Double precision throughout mirrors
-- JS float math; the final product is cast to numeric so round() uses
-- half-away-from-zero (== JS Math.round for the non-negative range here).

create or replace function public.mastery_weight(
  p_difficulty integer,
  p_score_band integer
) returns double precision
language sql
immutable
as $$
  select (case p_difficulty
            when 1 then 0.6 when 2 then 1.0 when 3 then 1.5
            else 1.0 end)::double precision
       * (case p_score_band
            when 1 then 0.7 when 2 then 0.85 when 3 then 1.0 when 4 then 1.15
            when 5 then 1.3 when 6 then 1.5 when 7 then 1.7
            else 1.15 end)::double precision;
$$;

create or replace function public.compute_mastery_score(
  p_weighted_correct double precision,
  p_weighted_total   double precision,
  p_attempts_count   integer,
  p_recent_total     integer,
  p_recent_correct   integer
) returns integer
language sql
immutable
as $$
  -- coalesce guards the NULL that `sum(...) filter (where is_correct)`
  -- returns when a skill has zero correct attempts: NULL would propagate
  -- through the arithmetic and `least(100, round(NULL))` yields 100
  -- (least ignores NULLs). JS masteryFromAggregates starts weightedCorrect
  -- at 0, so 0 is the matching, correct value.
  select least(
    100,
    round( (
      (case when coalesce(p_weighted_total, 0) > 0
            then coalesce(p_weighted_correct, 0) / p_weighted_total
            else 0 end)
      * (1 - exp(-0.15 * coalesce(p_attempts_count, 0)))
      * (1 + (case when coalesce(p_recent_total, 0) >= 3
                    and (coalesce(p_recent_correct, 0)::double precision
                         / nullif(p_recent_total, 0)) > 0.7
                   then 0.05 else 0 end))
      * 100
    )::numeric )
  )::integer;
$$;

comment on function public.compute_mastery_score is
  'Pure mastery formula. Mirrored verbatim in lib/mastery.ts '
  '(masteryFromAggregates) and pinned by lib/mastery.fixtures.json — '
  'change all three together.';

-- ── The snapshot table ─────────────────────────────────────────────

create table if not exists public.skill_mastery_snapshots (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references auth.users(id) on delete cascade,
  test_type      text not null default 'sat' check (test_type in ('sat', 'act')),
  domain_code    text not null,
  skill_code     text not null,
  snapshot_date  date not null,
  mastery        integer not null check (mastery between 0 and 100),
  attempts_count integer not null default 0,
  correct_count  integer not null default 0,
  avg_difficulty numeric(4, 2),
  created_at     timestamptz not null default now(),
  unique (student_id, test_type, domain_code, skill_code, snapshot_date)
);

comment on table public.skill_mastery_snapshots is
  'Per-(student, test_type, domain, skill) daily mastery series (§1.1). '
  'One row per activity day historically (backfill) + one per night going '
  'forward. mastery is the full lib/mastery.js value (incl. recency bonus) '
  'as of snapshot_date over FIRST practice attempts.';

-- Latest-per-skill lookups (§1.3 coverage) and trend/peak/decay scans.
create index if not exists skill_mastery_snapshots_student_date_idx
  on public.skill_mastery_snapshots (student_id, test_type, snapshot_date desc);
create index if not exists skill_mastery_snapshots_skill_date_idx
  on public.skill_mastery_snapshots (student_id, test_type, domain_code, skill_code, snapshot_date desc);

-- RLS: reads gated by can_view (student sees own; tutor/manager/admin see
-- visible students), mirroring act_practice_test_attempts. Writes are
-- admin-only at the RLS layer; the snapshot/backfill jobs below are
-- SECURITY DEFINER and run as the owner, so they bypass RLS regardless.
alter table public.skill_mastery_snapshots enable row level security;

drop policy if exists sms_select        on public.skill_mastery_snapshots;
drop policy if exists sms_admin_insert  on public.skill_mastery_snapshots;
drop policy if exists sms_admin_update  on public.skill_mastery_snapshots;
drop policy if exists sms_admin_delete  on public.skill_mastery_snapshots;

create policy sms_select on public.skill_mastery_snapshots
  for select to public using (public.can_view(student_id));

create policy sms_admin_insert on public.skill_mastery_snapshots
  for insert to public with check (public.is_admin());

create policy sms_admin_update on public.skill_mastery_snapshots
  for update to public using (public.is_admin()) with check (public.is_admin());

create policy sms_admin_delete on public.skill_mastery_snapshots
  for delete to public using (public.is_admin());

-- ── As-of computation (single student) ─────────────────────────────
-- The reusable core: per-skill mastery for one student as of one date.
-- Used by the nightly job and available to §1.3 / admin tooling. Pure
-- read; SECURITY INVOKER so RLS on attempts governs who can compute for
-- whom (a tutor computing for their student works via can_view on
-- attempts, same as get_student_dashboard_stats). "As of" means: only
-- first attempts with created_at::date <= p_asof; recency window is the
-- 14 calendar days ending on p_asof (p_asof-13 .. p_asof). now() is
-- never read, so backfilled historical dates are computed correctly.

create or replace function public.get_skill_mastery_asof(
  p_student   uuid,
  p_asof      date,
  p_test_type text default 'sat'
) returns table (
  test_type      text,
  domain_code    text,
  skill_code     text,
  mastery        integer,
  attempts_count integer,
  correct_count  integer,
  avg_difficulty numeric
)
language sql
stable
set search_path = public, pg_temp
as $$
  with first_attempts as (
    select distinct on (a.question_id)
      a.question_id, a.is_correct, a.created_at
    from public.attempts a
    where a.user_id = p_student
      and a.source = 'practice'
      and a.created_at::date <= p_asof
    order by a.question_id, a.created_at asc
  ),
  tax as (
    select
      q.domain_code, q.skill_code, q.difficulty,
      fa.is_correct, fa.created_at,
      public.mastery_weight(q.difficulty, q.score_band) as w
    from first_attempts fa
    join public.questions_v2 q on q.id = fa.question_id
    where q.domain_code is not null and q.skill_code is not null
  ),
  agg as (
    select
      domain_code, skill_code,
      count(*)::integer                             as attempts_count,
      count(*) filter (where is_correct)::integer   as correct_count,
      sum(w)::double precision                      as weighted_total,
      sum(w) filter (where is_correct)::double precision as weighted_correct,
      count(*) filter (where created_at::date >= p_asof - 13)::integer as recent_total,
      count(*) filter (where created_at::date >= p_asof - 13 and is_correct)::integer as recent_correct,
      avg(difficulty)::numeric                      as avg_difficulty
    from tax
    group by domain_code, skill_code
  )
  select
    p_test_type, domain_code, skill_code,
    public.compute_mastery_score(weighted_correct, weighted_total,
                                 attempts_count, recent_total, recent_correct),
    attempts_count, correct_count, round(avg_difficulty, 2)
  from agg;
$$;

grant execute on function public.get_skill_mastery_asof(uuid, date, text) to authenticated;

-- ── Nightly job body (all students, as of one date) ────────────────
-- The scheduler is a follow-up: pg_cron is available but NOT installed
-- in this project (verified 2026-07-13). Once enabled, schedule:
--   select cron.schedule('nightly-mastery', '15 7 * * *',
--     $$ select public.snapshot_all_skill_mastery(current_date) $$);
-- (07:15 UTC ~ overnight PT.) Until then this is callable on demand.

create or replace function public.snapshot_all_skill_mastery(
  p_asof      date default current_date,
  p_test_type text default 'sat'
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid;
  v_total   integer := 0;
  v_rows    integer;
begin
  for v_student in
    select distinct user_id from public.attempts where source = 'practice'
  loop
    insert into public.skill_mastery_snapshots
      (student_id, test_type, domain_code, skill_code, snapshot_date,
       mastery, attempts_count, correct_count, avg_difficulty)
    select
      v_student, m.test_type, m.domain_code, m.skill_code, p_asof,
      m.mastery, m.attempts_count, m.correct_count, m.avg_difficulty
    from public.get_skill_mastery_asof(v_student, p_asof, p_test_type) m
    on conflict (student_id, test_type, domain_code, skill_code, snapshot_date)
    do update set
      mastery        = excluded.mastery,
      attempts_count = excluded.attempts_count,
      correct_count  = excluded.correct_count,
      avg_difficulty = excluded.avg_difficulty;
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.snapshot_all_skill_mastery(date, text) from public;
grant execute on function public.snapshot_all_skill_mastery(date, text) to service_role;

-- ── One-time historical backfill (activity-day resolution) ─────────
-- Emits a snapshot for every (student, skill) on every day the student
-- had >=1 practice first-attempt, computed cumulatively as of that day,
-- so a real multi-date series exists on launch (required by §1.3 trend/
-- peak/decay). Idle-day recency-bonus expiry is not backfilled (the
-- nightly job captures it going forward) — a documented approximation.
-- Batched per student to keep the cross-join bounded.

create or replace function public.backfill_skill_mastery_snapshots(
  p_test_type text default 'sat'
) returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_student uuid;
  v_total   integer := 0;
  v_rows    integer;
begin
  for v_student in
    select distinct user_id from public.attempts where source = 'practice'
  loop
    with first_attempts as (
      select distinct on (a.question_id)
        a.question_id, a.is_correct, a.created_at
      from public.attempts a
      where a.user_id = v_student and a.source = 'practice'
      order by a.question_id, a.created_at asc
    ),
    tax as (
      select
        q.domain_code, q.skill_code, q.difficulty,
        fa.is_correct, fa.created_at,
        public.mastery_weight(q.difficulty, q.score_band) as w
      from first_attempts fa
      join public.questions_v2 q on q.id = fa.question_id
      where q.domain_code is not null and q.skill_code is not null
    ),
    activity_dates as (
      select distinct created_at::date as d from tax
    ),
    per as (
      select
        d.d as snapshot_date, t.domain_code, t.skill_code,
        count(*)::integer                                         as attempts_count,
        count(*) filter (where t.is_correct)::integer             as correct_count,
        sum(t.w)::double precision                                as weighted_total,
        sum(t.w) filter (where t.is_correct)::double precision    as weighted_correct,
        count(*) filter (where t.created_at::date >= d.d - 13)::integer as recent_total,
        count(*) filter (where t.created_at::date >= d.d - 13 and t.is_correct)::integer as recent_correct,
        avg(t.difficulty)::numeric                                as avg_difficulty
      from activity_dates d
      join tax t on t.created_at::date <= d.d
      group by d.d, t.domain_code, t.skill_code
    )
    insert into public.skill_mastery_snapshots
      (student_id, test_type, domain_code, skill_code, snapshot_date,
       mastery, attempts_count, correct_count, avg_difficulty)
    select
      v_student, p_test_type, domain_code, skill_code, snapshot_date,
      public.compute_mastery_score(weighted_correct, weighted_total,
                                   attempts_count, recent_total, recent_correct),
      attempts_count, correct_count, round(avg_difficulty, 2)
    from per
    on conflict (student_id, test_type, domain_code, skill_code, snapshot_date)
    do update set
      mastery        = excluded.mastery,
      attempts_count = excluded.attempts_count,
      correct_count  = excluded.correct_count,
      avg_difficulty = excluded.avg_difficulty;
    get diagnostics v_rows = row_count;
    v_total := v_total + v_rows;
  end loop;
  return v_total;
end;
$$;

revoke execute on function public.backfill_skill_mastery_snapshots(text) from public;
grant execute on function public.backfill_skill_mastery_snapshots(text) to service_role;
