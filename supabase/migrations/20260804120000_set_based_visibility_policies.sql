-- Set-based visibility policies for the two largest user-owned tables.
--
-- Bug surface: /tutor/performance rendered "No activity yet" + an
-- empty heatmap for a manager account even though the roster had
-- thousands of recent attempts. The loader's first read —
-- `select user_id from student_practice_stats` — was timing out at
-- PostgREST's 8s statement_timeout for the `authenticated` role,
-- and the loader treated the failed read as an empty roster.
--
-- Root cause: the SELECT policy on attempts was
--   using (can_view(user_id))
-- and can_view() is SECURITY DEFINER, so Postgres cannot inline it
-- into the query plan. Every attempt row the caller can see pays a
-- full per-row function call (plan + 4 EXISTS probes). For a manager
-- who can see ~50 students / ~21k attempts that measured 9.1s —
-- just over the 8s timeout. Teachers with smaller rosters stayed
-- under it, which is why only the manager account went blank.
--
-- Fix: express the policy as membership in the caller's visibility
-- set instead of a per-row predicate:
--   using (user_id in (select user_id from list_visible_users()))
-- Postgres runs the subquery ONCE per statement (hashed SubPlan,
-- ~3ms for the same manager) and every row becomes a hash probe.
-- Measured on production data: 9,125ms -> 87ms for the same query.
--
-- Semantics are unchanged. list_visible_users() (created alongside
-- can_view in 20240101000004) unions exactly the same paths can_view
-- checks: self, admin-sees-all, direct teacher->student, direct
-- manager->teacher, transitive manager->student, class-based legacy.
-- The only structural difference is its join to profiles (a target
-- with no profiles row would drop out) — verified vacuous in
-- production: zero attempts / snapshot / assignment rows reference a
-- user id without a profiles row (FKs guarantee it stays that way).
--
-- Scope: attempts (25k rows, the confirmed bottleneck) and
-- skill_mastery_snapshots (15k rows, same shape of risk). The other
-- can_view() policies sit on tables with at most a few hundred rows;
-- converting them is a follow-up if/when they grow.

drop policy if exists attempts_select on public.attempts;
create policy attempts_select on public.attempts
  for select to public
  using (
    user_id = auth.uid()
    or user_id in (select user_id from public.list_visible_users())
  );

drop policy if exists sms_select on public.skill_mastery_snapshots;
create policy sms_select on public.skill_mastery_snapshots
  for select to public
  using (
    student_id = auth.uid()
    or student_id in (select user_id from public.list_visible_users())
  );
