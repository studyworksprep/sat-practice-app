-- =========================================================
-- get_roster_skill_trend — per-skill mastery deltas (§4.4)
-- =========================================================
-- "Improving least" as a real, sortable answer on the roster
-- Performance page, replacing inference from the current-window
-- accuracy heatmap.
--
-- One home for the mastery math: this is a set-wise wrapper over
-- get_skill_mastery_asof (§1.1), evaluated at today and at
-- today - p_days per roster member, then averaged per skill.
-- Computing from attempts (rather than skill_mastery_snapshots)
-- keeps the signal live even where the nightly snapshot job
-- hasn't landed yet — same reasoning as the session workspace's
-- prep card.
--
-- SECURITY INVOKER: get_skill_mastery_asof reads attempts under
-- the caller's RLS, so a roster id the caller can't see simply
-- contributes no rows. Averages cover only students with
-- attempts on the skill as of today; a student first touching a
-- skill inside the window counts as movement from 0.

create or replace function public.get_roster_skill_trend(
  p_roster    uuid[],
  p_days      integer default 28,
  p_test_type text default 'sat'
)
returns table (
  domain_code      text,
  skill_code       text,
  students         integer,
  avg_mastery_now  numeric,
  avg_mastery_then numeric,
  avg_delta        numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  with now_side as (
    select r.student, m.domain_code, m.skill_code, m.mastery, m.attempts_count
    from unnest(p_roster) as r(student)
    cross join lateral public.get_skill_mastery_asof(r.student, current_date, p_test_type) m
  ),
  then_side as (
    select r.student, m.domain_code, m.skill_code, m.mastery
    from unnest(p_roster) as r(student)
    cross join lateral public.get_skill_mastery_asof(
      r.student, current_date - greatest(p_days, 1), p_test_type
    ) m
  )
  select
    n.domain_code,
    n.skill_code,
    count(*)::integer as students,
    round(avg(n.mastery)::numeric, 1) as avg_mastery_now,
    round(avg(coalesce(t.mastery, 0))::numeric, 1) as avg_mastery_then,
    round(avg(n.mastery - coalesce(t.mastery, 0))::numeric, 1) as avg_delta
  from now_side n
  left join then_side t
    on t.student = n.student
   and t.domain_code = n.domain_code
   and t.skill_code = n.skill_code
  where n.attempts_count > 0
  group by n.domain_code, n.skill_code
$$;

comment on function public.get_roster_skill_trend(uuid[], integer, text) is
  'Per-skill roster-average mastery movement over the last p_days '
  '(§4.4). Set-wise wrapper over get_skill_mastery_asof; RLS-scoped '
  'via SECURITY INVOKER.';

grant execute on function public.get_roster_skill_trend(uuid[], integer, text) to authenticated;
