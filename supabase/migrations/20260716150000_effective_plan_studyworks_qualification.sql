-- =========================================================
-- effective_plan: qualify tutor access by the Studyworks marker
-- =========================================================
-- Owner policy (2026-07-16) — how tutor access actually works:
--
--   * A STUDYWORKS tutor redeems an admin-issued teacher_codes
--     invitation at signup (one tutor per code, used_by/used_at
--     tracked) and rides free for as long as they use the app. The
--     marker is profiles.subscription_exempt = true.
--   * An OUTSIDE tutor signs up without a code and needs the teacher
--     subscription plan — role 'teacher' alone grants nothing.
--   * A student on a STUDYWORKS tutor's roster rides free (sponsored).
--     A student on an OUTSIDE tutor's roster does not — they subscribe
--     like any self-serve student.
--
-- The original resolver (20260713220000) encoded "staff =
-- admin/manager/teacher → full" and "any roster edge sponsors", which
-- contradicts the last two rules. This migration corrects the DORMANT
-- resolver (the entitlements_gate flip has not happened; proxy.js still
-- enforces the legacy checks, which were themselves realigned to this
-- policy in the same change set):
--
--   1. Role bypass narrowed to admin/manager.
--   2. Teachers get 'full' via subscription_exempt (the Studyworks
--      marker) — scoped to role='teacher' so STUDENT exemption
--      semantics stay on the live-derived sponsored path, preserving
--      the owner's 2026-07-13 decision that sponsored access expires
--      immediately when the roster edge is removed.
--   3. The sponsored branch counts only roster edges whose TEACHER is
--      a Studyworks tutor (exempt).
--
-- Parity (verified 2026-07-16 against production before applying):
-- every rostered student's teacher is exempt, so qualified-sponsored
-- covers the same 57 students; the 2 rosterless exempt students keep
-- their backfilled manual grants; all 7 tutors are exempt (branch 2);
-- admin + managers pass branch 1. No user's resolved plan changes.

create or replace function public.effective_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    -- staff role bypass: admin/manager only. Teachers are NOT
    -- unconditionally staff — see the Studyworks-marker branch below.
    select case when p.role in ('admin', 'manager') then 'full' end as plan
      from public.profiles p where p.id = p_user
    union all
    -- Studyworks tutors: subscription_exempt is the org marker, set by
    -- redeeming an admin-issued teacher_codes invitation at signup.
    select 'full' from public.profiles p
      where p.id = p_user and p.role = 'teacher' and p.subscription_exempt
    union all
    -- sponsored: live-derived from the roster edge — but only an edge
    -- to a STUDYWORKS (exempt) tutor sponsors. An outside subscribed
    -- tutor's roster does not grant their students free access.
    select 'full' where exists (
      select 1
        from public.teacher_student_assignments t
        join public.profiles tp on tp.id = t.teacher_id
       where t.student_id = p_user and tp.subscription_exempt)
    union all
    -- stripe: live-derived from an active/trialing subscription
    select 'full' where exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user and s.status in ('active', 'trialing'))
    union all
    -- explicit stored grants (manual/trial), active and unexpired
    select e.plan from public.entitlements e
      where e.user_id = p_user and e.status = 'active'
        and (e.expires_at is null or e.expires_at > now())
  )
  select plan from candidates
  where plan is not null
  order by public.plan_rank(plan) desc
  limit 1;
$$;

comment on function public.effective_plan(uuid) is
  'Resolve a user''s licensing plan (§1.5): admin/manager by role; '
  'Studyworks tutors by subscription_exempt (set via admin-issued '
  'teacher_codes at signup); students sponsored live by a roster edge '
  'to a Studyworks tutor; stripe subscriptions; then stored grants. '
  'Outside tutors and their students subscribe. Dormant until the '
  'entitlements_gate flip.';
