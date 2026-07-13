-- =========================================================
-- entitlements — a first-class licensing gate (§1.5)
-- =========================================================
-- Authorization already has one home (can_view); licensing did not —
-- it lived ad hoc in proxy.js and lib/subscription.js as
-- role-in(admin,manager) OR subscription_exempt OR active-subscription.
-- This builds the second gate: plan (preview<standard<full) resolved by
-- effective_plan()/has_plan(), so future tier-gated features (plan
-- engine, SRS) read one resolver.
--
-- DESIGN (per owner decision 2026-07-13: sponsored access is LIVE-DERIVED
-- from the roster edge and EXPIRES IMMEDIATELY on removal):
--   * sponsored + stripe are NOT stored — they're computed live from
--     teacher_student_assignments and subscriptions respectively, so
--     there's a single source of truth and removing a roster edge
--     revokes access with no trigger/drift.
--   * The entitlements TABLE stores only explicit, non-derivable grants
--     (source manual / trial).
--   * Staff (admin/manager/teacher) get 'full' via a role bypass —
--     keeping the plan and role axes separate.
--
-- PARITY: verified against production that 0 non-exempt students have a
-- roster edge (so live-derived sponsored grants no one new), 57 exempt
-- students have one, and 2 exempt students have none — backfilled below
-- as manual grants so has_plan reproduces today's access exactly.
--
-- SWITCHOVER IS FLAG-GATED AND OFF. This migration builds and
-- parity-verifies the resolver but does NOT change the live enforcement
-- path (proxy.js). Flipping feature_flags 'entitlements_gate' to 'on'
-- (after e2e auth verification) is the deliberate switchover — a
-- follow-up, because it changes the live access path for real users.

create table if not exists public.entitlements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  plan       text not null check (plan   in ('preview', 'standard', 'full')),
  source     text not null check (source in ('stripe', 'sponsored', 'trial', 'manual')),
  status     text not null default 'active' check (status in ('active', 'expired')),
  granted_by uuid,
  note       text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.entitlements is
  'Explicit, non-derivable licensing grants (source manual/trial). '
  'sponsored (roster edge) and stripe (subscriptions) are resolved LIVE '
  'by effective_plan(), not stored here. §1.5.';

create index if not exists entitlements_user_active_idx
  on public.entitlements (user_id) where status = 'active';

drop trigger if exists trg_entitlements_updated_at on public.entitlements;
create trigger trg_entitlements_updated_at
  before update on public.entitlements
  for each row execute function public.set_updated_at();

-- RLS: a user sees their own grants; staff see visible users' grants via
-- can_view; only admins write.
alter table public.entitlements enable row level security;
drop policy if exists entitlements_select       on public.entitlements;
drop policy if exists entitlements_admin_write   on public.entitlements;
create policy entitlements_select on public.entitlements
  for select to public using (public.can_view(user_id));
create policy entitlements_admin_write on public.entitlements
  for all to public using (public.is_admin()) with check (public.is_admin());

-- ── Resolver ───────────────────────────────────────────────────────
create or replace function public.plan_rank(p_plan text)
returns integer language sql immutable as $$
  select case p_plan when 'preview' then 1 when 'standard' then 2 when 'full' then 3 else 0 end;
$$;

-- The single licensing resolver. Returns the highest plan the user is
-- entitled to, or NULL. SECURITY DEFINER so it can consult roster /
-- subscriptions / entitlements regardless of the caller's RLS.
create or replace function public.effective_plan(p_user uuid)
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    -- staff role bypass
    select case when p.role in ('admin', 'manager', 'teacher') then 'full' end as plan
      from public.profiles p where p.id = p_user
    union all
    -- sponsored: live-derived from the roster edge
    select 'full' where exists (
      select 1 from public.teacher_student_assignments t where t.student_id = p_user)
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

create or replace function public.has_plan(p_user uuid, p_min_plan text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    public.plan_rank(public.effective_plan(p_user)) >= public.plan_rank(p_min_plan),
    false);
$$;

grant execute on function public.plan_rank(text) to authenticated;
grant execute on function public.effective_plan(uuid) to authenticated;
grant execute on function public.has_plan(uuid, text) to authenticated;

-- ── Backfill for parity ────────────────────────────────────────────
-- The 2 exempt students with no roster edge need an explicit grant so
-- has_plan matches today's subscription_exempt. Everyone else resolves
-- live (sponsored/stripe) or via role bypass.
insert into public.entitlements (user_id, plan, source, status, note)
select p.id, 'full', 'manual', 'active', 'backfill §1.5: exempt student, no roster edge'
from public.profiles p
where p.subscription_exempt is true
  and p.role = 'student'
  and not exists (select 1 from public.teacher_student_assignments t where t.student_id = p.id)
  and not exists (select 1 from public.entitlements e where e.user_id = p.id and e.source = 'manual');

-- ── Switchover flag (OFF) ──────────────────────────────────────────
insert into public.feature_flags (key, value, description)
values ('entitlements_gate', 'off',
  'When on, access resolves via has_plan()/effective_plan() instead of the legacy role+exempt+subscription checks in proxy.js and lib/subscription.js. §1.5 switchover — flip only after verifying parity + e2e auth.')
on conflict (key) do nothing;
