-- =========================================================
-- item_stats + mis-key audit (§1.7)
-- =========================================================
-- Empirical per-question statistics computed fresh from the ~10.4k SAT
-- practice attempts (the denormalized questions_v2.attempt_count is
-- STALE — verified 5/60 match — so item_stats recomputes, it does not
-- trust the counter). Stats are over FIRST attempts per (student,
-- question), matching the §1.1 mastery population.
--
-- Storage reality this is built on: the chosen MCQ option lives in
-- attempts.response_text as a letter ('A'..'D'); selected_option_id is
-- always NULL; the key is questions_v2.correct_answer->>'option_label'.
-- So the distractor distribution keys off response_text.
--
-- Data is THIN: of ~2,228 practiced questions only ~825 have >=5
-- attempts, ~29 have >=20, and 0 have >=50. p_value is usable at low n;
-- discrimination (point-biserial) is noisy below ~20 and is NULL when
-- corr() is undefined. The mis-key audit therefore gates on n>=5 and
-- leans on the p-value/modal-distractor signal, which is the most
-- reliable at this scale.

create table if not exists public.item_stats (
  question_id     uuid primary key references public.questions_v2(id) on delete cascade,
  n_attempts      integer not null default 0,
  n_correct       integer not null default 0,
  p_value         numeric(4, 3),            -- empirical proportion correct (first attempts)
  discrimination  numeric(5, 3),            -- point-biserial vs overall ability; NULL if undefined
  avg_time_ms     numeric,                  -- over attempts with a recorded time (41.6% are null)
  n_timed         integer not null default 0,
  key_label       text,                     -- correct_answer.option_label
  modal_label     text,                     -- most-chosen response (MCQ)
  distractor_dist jsonb,                    -- {option_label: count} incl. the key
  computed_at     timestamptz not null default now()
);

comment on table public.item_stats is
  'Empirical per-question stats (§1.7), recomputed fresh from first '
  'practice attempts (questions_v2.attempt_count is stale). Refresh via '
  'public.refresh_item_stats(). Author/staff-facing.';

-- RLS: aggregate author tooling (no student PII, but reveals answer
-- difficulty, so staff-only). Admins write; refresh runs SECURITY DEFINER.
alter table public.item_stats enable row level security;

drop policy if exists item_stats_staff_select on public.item_stats;
drop policy if exists item_stats_admin_write  on public.item_stats;

create policy item_stats_staff_select on public.item_stats
  for select to authenticated using (
    public.is_admin()
    or exists (select 1 from public.profiles p
               where p.id = auth.uid() and p.role in ('teacher', 'manager'))
  );
create policy item_stats_admin_write on public.item_stats
  for all to public using (public.is_admin()) with check (public.is_admin());

-- ── Refresh (recompute all) ────────────────────────────────────────
create or replace function public.refresh_item_stats()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare v_rows integer;
begin
  with fa as (
    select distinct on (a.user_id, a.question_id)
      a.user_id, a.question_id, a.is_correct, a.response_text, a.time_spent_ms
    from public.attempts a
    where a.source = 'practice'
    order by a.user_id, a.question_id, a.created_at asc
  ),
  ability as (
    select user_id, avg(case when is_correct then 1.0 else 0.0 end) as ability
    from fa group by user_id
  ),
  joined as (
    select fa.user_id, fa.question_id, fa.is_correct, fa.response_text, fa.time_spent_ms,
      ab.ability,
      q.correct_answer->>'option_label' as key_label,
      q.question_type
    from fa
    join public.questions_v2 q on q.id = fa.question_id
    left join ability ab on ab.user_id = fa.user_id
  ),
  per_q as (
    select
      question_id,
      max(key_label) as key_label,
      count(*)::integer as n_attempts,
      count(*) filter (where is_correct)::integer as n_correct,
      count(time_spent_ms)::integer as n_timed,
      avg(time_spent_ms) filter (where time_spent_ms is not null) as avg_time_ms,
      corr((case when is_correct then 1 else 0 end)::float8, ability::float8) as discrimination
    from joined
    group by question_id
  ),
  dist as (
    select question_id,
      jsonb_object_agg(resp, c) as distractor_dist,
      (array_agg(resp order by c desc, resp))[1] as modal_label
    from (
      select question_id, coalesce(nullif(response_text, ''), '(blank)') as resp, count(*) c
      from joined where question_type <> 'spr'
      group by question_id, coalesce(nullif(response_text, ''), '(blank)')
    ) t
    group by question_id
  )
  insert into public.item_stats
    (question_id, n_attempts, n_correct, p_value, discrimination,
     avg_time_ms, n_timed, key_label, modal_label, distractor_dist, computed_at)
  select
    p.question_id, p.n_attempts, p.n_correct,
    round(p.n_correct::numeric / nullif(p.n_attempts, 0), 3),
    round(p.discrimination::numeric, 3),
    p.avg_time_ms, p.n_timed, p.key_label, d.modal_label, d.distractor_dist, now()
  from per_q p
  left join dist d on d.question_id = p.question_id
  on conflict (question_id) do update set
    n_attempts = excluded.n_attempts, n_correct = excluded.n_correct,
    p_value = excluded.p_value, discrimination = excluded.discrimination,
    avg_time_ms = excluded.avg_time_ms, n_timed = excluded.n_timed,
    key_label = excluded.key_label, modal_label = excluded.modal_label,
    distractor_dist = excluded.distractor_dist, computed_at = now();
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

revoke execute on function public.refresh_item_stats() from public;
grant execute on function public.refresh_item_stats() to service_role;

-- ── Mis-key audit (re-runnable report) ─────────────────────────────
-- Surfaces the classic mis-key signatures over items with enough data
-- (n>=5). Rank the report by suspicion in the app. SECURITY INVOKER so
-- item_stats RLS applies (staff-only).
create or replace view public.item_miskey_audit
with (security_invoker = true) as
select
  s.question_id,
  q.display_code,
  q.domain_code,
  q.skill_code,
  s.n_attempts,
  s.p_value,
  s.discrimination,
  s.key_label,
  s.modal_label,
  s.distractor_dist,
  case
    when s.p_value <= 0.15                                              then 'keyed_answer_p_near_zero'
    when s.modal_label is not null and s.modal_label <> s.key_label
      and s.p_value < 0.5                                              then 'distractor_preferred'
    when s.discrimination < -0.15                                      then 'negative_discrimination'
  end as flag
from public.item_stats s
join public.questions_v2 q on q.id = s.question_id
where q.question_type <> 'spr'
  and s.n_attempts >= 5
  and (
    s.p_value <= 0.15
    or (s.modal_label is not null and s.modal_label <> s.key_label and s.p_value < 0.5)
    or s.discrimination < -0.15
  );

comment on view public.item_miskey_audit is
  'Mis-key candidates (§1.7): keyed answer p≈0, a distractor preferred '
  'over the key, or negative discrimination — over items with n>=5. '
  'Review before changing any answer key.';
