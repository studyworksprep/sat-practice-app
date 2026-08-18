-- Date guard on the Stripe candidate in effective_plan() (billing
-- hardening, Phase 4).
--
-- WHY: access was decided by the status string alone, so a row left
-- reading 'active' or 'trialing' granted access forever regardless of
-- how stale it was. The webhook is now hard to lose events through and a
-- nightly reconcile corrects drift, but both are moving parts. This is
-- the backstop underneath them: a subscription whose period ended and
-- was never renewed stops granting access on its own, with no webhook
-- and no cron involved.
--
-- It also closes the original hole directly. A trial whose conversion
-- event never arrives keeps status 'trialing' with current_period_end at
-- the trial end; once that date passes, the guard denies access instead
-- of extending the trial indefinitely.
--
-- THE THREE-DAY GRACE. Renewal moves current_period_end forward via a
-- webhook, which can be late. Denying access the instant the stored date
-- passes would lock out a paying customer over a delayed delivery. Three
-- days is comfortably longer than any plausible webhook delay and longer
-- than the daily reconcile's window to self-correct, while still being
-- far shorter than a free month.
--
-- THE NULL ESCAPE IS PERMANENT, NOT TRANSITIONAL. checkout.session.completed
-- binds a new subscriber's row before customer.subscription.created has
-- supplied the period dates, so a brand-new row legitimately has
-- current_period_end IS NULL for a few seconds. Without the escape, a
-- student who just paid would be bounced to /subscribe during that
-- window. The state is transient: the subscription event fills it in
-- within seconds, and the reconcile cron would catch it within a day.
--
-- PARITY: verified against production before applying — 81 profiles, 0
-- verdict differences, 74 with access before and after. The only change
-- is to the stripe candidate; every other candidate is copied verbatim
-- from the live definition (which had already diverged from the
-- 20260713220000 migration: staff bypass is admin/manager only, teachers
-- need subscription_exempt, and the sponsored edge requires an exempt
-- teacher).
create or replace function public.effective_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select case when p.role in ('admin', 'manager') then 'full' end as plan
      from public.profiles p where p.id = p_user
    union all
    select 'full' from public.profiles p
      where p.id = p_user and p.role = 'teacher' and p.subscription_exempt
    union all
    select 'full' where exists (
      select 1
        from public.teacher_student_assignments t
        join public.profiles tp on tp.id = t.teacher_id
       where t.student_id = p_user and tp.subscription_exempt)
    union all
    -- stripe: an active/trialing subscription whose period has not
    -- lapsed beyond the grace window.
    select 'full' where exists (
      select 1 from public.subscriptions s
      where s.user_id = p_user
        and s.status in ('active', 'trialing')
        and (s.current_period_end is null
             or s.current_period_end > now() - interval '3 days'))
    union all
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
  'Single licensing resolver. Returns the highest plan a user is entitled '
  'to, or NULL. The stripe candidate requires a live period: a lapsed '
  'subscription stops granting access without needing a webhook or cron. '
  'NULL current_period_end is allowed — a just-bound checkout row has not '
  'received its dates yet.';
