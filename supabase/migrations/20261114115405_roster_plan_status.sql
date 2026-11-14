-- Subscription status of a tutor's students, for the Roster
-- (owner request 2026-11-14).
--
-- Students a tutor invites subscribe themselves, and an unsubscribed
-- student can't open any content. The tutor needs to see who hasn't
-- subscribed before assigning work — but subscriptions RLS lets a user
-- read only their own row. This returns, for the students the caller
-- can see (can_view), only what the Roster shows: how the student has
-- access and, for Stripe, the status and dates.
--
--   access: 'sponsored'  — a sponsored link to a Studyworks tutor
--           'trial'      — Stripe trial, still live
--           'subscribed' — Stripe subscription, still live
--           'granted'    — any other source effective_plan() accepts
--                          (manual entitlement, staff role)
--           'none'       — no access (subscription_status tells a failed
--                          payment from a plan that was never bought)
create or replace function public.roster_plan_status(p_student_ids uuid[])
returns table (
  student_id uuid,
  access text,
  subscription_status text,
  trial_end timestamptz,
  current_period_end timestamptz
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select s.id,
         case
           when public.is_sponsored_student(s.id) then 'sponsored'
           when sub.live and sub.status = 'trialing' then 'trial'
           when sub.live and sub.status = 'active' then 'subscribed'
           when public.effective_plan(s.id) is not null then 'granted'
           else 'none'
         end,
         sub.status,
         sub.trial_end,
         sub.current_period_end
    from unnest(coalesce(p_student_ids, '{}'::uuid[])) as ids(id)
    join public.profiles s on s.id = ids.id
    left join lateral (
      select x.status, x.trial_end, x.current_period_end,
             (x.status in ('active', 'trialing')
              and (x.current_period_end is null
                   or x.current_period_end > now() - interval '3 days')) as live
        from public.subscriptions x
       where x.user_id = s.id
       limit 1) sub on true
   where s.id <> auth.uid()
     and public.can_view(s.id);
$$;

comment on function public.roster_plan_status(uuid[]) is
  'Access source and Stripe status for the students the caller can view (can_view). Powers the Roster''s "needs a plan" badges; subscriptions RLS is own-row only.';

revoke execute on function public.roster_plan_status(uuid[]) from public, anon;
grant execute on function public.roster_plan_status(uuid[]) to authenticated;
