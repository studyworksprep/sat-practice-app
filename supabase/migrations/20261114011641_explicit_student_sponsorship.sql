-- Explicit student sponsorship (owner request 2026-11-13).
--
-- Until now a roster link to a Studyworks (exempt) tutor WAS
-- sponsorship: effective_plan() granted 'full' for any such link, and
-- trg_exempt_student_on_assignment set the student's own
-- profiles.subscription_exempt one-way on every link insert. So no
-- Studyworks tutor could be given a self-serve way to link students
-- without being able to mint free accounts, and none could take on a
-- private, paying student.
--
-- This migration separates "on my roster" from "Studyworks pays":
--
--   * teacher_student_assignments.sponsored marks a link as
--     Studyworks-sponsored. guard_link_sponsorship() rejects any write
--     that turns it on unless it comes from an admin, the service role
--     (signup redeeming an admin-issued invitation), a sponsored
--     invitation redeemed through link_self_to_teacher_by_code, or a
--     direct database session (migrations / maintenance). It holds no
--     matter which policy or function performs the write.
--   * effective_plan() grants the roster candidate only for a sponsored
--     link to a tutor who is still exempt (is_sponsored_student()).
--     Unlinking a student, un-sponsoring the link, or a tutor losing
--     exemption all end sponsorship with no further step.
--   * student_invite_codes.sponsored: admin-issued invitations are
--     sponsored; tutor-issued ones (create_student_invitation) never
--     are. Tutors may read and revoke only the invitations they issued.
--   * link_self_to_teacher_by_code() now also redeems single-use
--     invitations for students who already have an account, and
--     promotes a 'practice' (exploring) account to 'student' on link —
--     a practice-role student was invisible on every tutor surface.
--   * The one-way exemption trigger is dropped. A student's own
--     profiles.subscription_exempt no longer takes part in any access
--     decision while the entitlements gate is on (the resolver never
--     read it); the column remains the Studyworks-tutor marker.
--
-- PARITY: every existing link to an exempt tutor is backfilled as
-- sponsored, so effective_plan() returns the same plan for every user
-- before and after. Verified in dev (ikzhizgsawzjpuuznfid) before
-- applying elsewhere; production must be re-verified the same way.

-- ── 1. Columns ─────────────────────────────────────────────────────

alter table public.teacher_student_assignments
  add column if not exists sponsored boolean not null default false,
  add column if not exists sponsored_by uuid references public.profiles(id) on delete set null,
  add column if not exists sponsored_at timestamptz;

comment on column public.teacher_student_assignments.sponsored is
  'Studyworks sponsors this student''s access through this link (only while the tutor is exempt). Only admins, the service role, or a sponsored invitation can set it — see guard_link_sponsorship().';

alter table public.student_invite_codes
  add column if not exists sponsored boolean not null default false;

comment on column public.student_invite_codes.sponsored is
  'Admin-issued invitations are sponsored (free access while the tutor is exempt). Tutor-issued invitations (create_student_invitation) never are.';

-- ── 2. Backfill — preserves every current access verdict ──────────

update public.teacher_student_assignments t
   set sponsored = true,
       sponsored_at = coalesce(t.created_at, now())
  from public.profiles tp
 where tp.id = t.teacher_id
   and tp.subscription_exempt
   and not t.sponsored;

-- Every invitation issued before this migration came from an admin
-- (the only issuer until now) as a sponsored intake.
update public.student_invite_codes set sponsored = true where not sponsored;

-- ── 3. Guard: only trusted writers can turn sponsorship on ────────

create or replace function public.guard_link_sponsorship()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.sponsored and (tg_op = 'INSERT' or not old.sponsored) then
    if not (
      public.is_admin()
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or coalesce(current_setting('studyworks.sponsorship_grant', true), '') = 'invitation'
      -- Direct database sessions (migrations, SQL editor) carry no
      -- request claims; every PostgREST request, anon included, does.
      or coalesce(current_setting('request.jwt.claims', true), '') = ''
    ) then
      raise exception 'Only an admin can mark a student as sponsored'
        using errcode = '42501';
    end if;
    new.sponsored_at := coalesce(new.sponsored_at, now());
  end if;

  if not new.sponsored then
    new.sponsored_at := null;
    new.sponsored_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_link_sponsorship on public.teacher_student_assignments;
create trigger trg_guard_link_sponsorship
  before insert or update on public.teacher_student_assignments
  for each row execute function public.guard_link_sponsorship();

-- ── 4. Resolver ────────────────────────────────────────────────────

create or replace function public.is_sponsored_student(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
      from public.teacher_student_assignments t
      join public.profiles tp on tp.id = t.teacher_id
     where t.student_id = p_user
       and t.sponsored
       and tp.subscription_exempt);
$$;

comment on function public.is_sponsored_student(uuid) is
  'True when the user has a sponsored roster link to a tutor who is still a Studyworks (exempt) tutor. The only sponsorship input to effective_plan().';

revoke execute on function public.is_sponsored_student(uuid) from public, anon;
grant execute on function public.is_sponsored_student(uuid) to authenticated, service_role;

-- Copied from the live definition (20260818214228); only the roster
-- candidate changes.
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
    -- sponsored: an explicitly sponsored link to a still-exempt tutor.
    -- A plain roster link grants nothing.
    select 'full' where public.is_sponsored_student(p_user)
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

-- ── 5. Retire the one-way exemption trigger ───────────────────────

drop trigger if exists trg_exempt_student_on_assignment on public.teacher_student_assignments;
drop function if exists public.exempt_student_on_teacher_assignment();

-- ── 6. Policies ────────────────────────────────────────────────────

-- Admins toggle sponsorship on existing links (there was no UPDATE
-- policy, so the column could not be changed through the API at all).
drop policy if exists tsa_update on public.teacher_student_assignments;
create policy tsa_update on public.teacher_student_assignments
  for update using (public.is_admin()) with check (public.is_admin());

-- Tutors see and revoke only the invitations they issued. Creation goes
-- through create_student_invitation() so the cap and sponsored = false
-- are enforced in one place.
drop policy if exists student_invite_codes_issuer_select on public.student_invite_codes;
create policy student_invite_codes_issuer_select on public.student_invite_codes
  for select using (created_by = auth.uid() and teacher_id = auth.uid());

drop policy if exists student_invite_codes_issuer_delete on public.student_invite_codes;
create policy student_invite_codes_issuer_delete on public.student_invite_codes
  for delete using (
    created_by = auth.uid()
    and teacher_id = auth.uid()
    and used_by is null
    and not public.is_demo()
  );

-- ── 7. Tutor-issued invitations ───────────────────────────────────

create or replace function public.create_student_invitation(p_email text, p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_caller   uuid := auth.uid();
  v_role     text;
  v_email    text := lower(btrim(coalesce(p_email, '')));
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_recent   integer;
  v_existing record;
  v_id       uuid;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;
  if public.is_demo() then
    return jsonb_build_object('ok', false, 'error', 'Demo accounts are read-only.');
  end if;

  select role into v_role from public.profiles where id = v_caller;
  if v_role is null or v_role not in ('teacher', 'manager', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'Only tutors can invite students.');
  end if;

  if length(v_email) > 254 or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    return jsonb_build_object('ok', false, 'error', 'Enter a valid email address.');
  end if;

  -- One live invitation per tutor and email: hand the same code back
  -- so the caller can resend it instead of piling up codes.
  select id, code into v_existing
    from public.student_invite_codes
   where teacher_id = v_caller
     and created_by = v_caller
     and lower(email) = v_email
     and used_by is null
   order by created_at desc
   limit 1;
  if found then
    return jsonb_build_object('ok', true, 'id', v_existing.id, 'code', v_existing.code,
                              'email', v_email, 'reused', true);
  end if;

  select count(*) into v_recent
    from public.student_invite_codes
   where created_by = v_caller
     and created_at > now() - interval '24 hours';
  if v_recent >= 25 then
    return jsonb_build_object('ok', false,
      'error', 'You have sent 25 invitations in the last 24 hours. Try again tomorrow.');
  end if;

  if v_code !~ '^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$' then
    raise exception 'invalid invitation code format' using errcode = '22023';
  end if;

  begin
    insert into public.student_invite_codes (code, teacher_id, email, created_by, sponsored)
    values (v_code, v_caller, v_email, v_caller, false)
    returning id into v_id;
  exception when unique_violation then
    return jsonb_build_object('ok', false, 'retry', true, 'error', 'Code collision. Try again.');
  end;

  return jsonb_build_object('ok', true, 'id', v_id, 'code', v_code,
                            'email', v_email, 'reused', false);
end;
$$;

comment on function public.create_student_invitation(text, text) is
  'Tutor-issued, single-use, never-sponsored student invitation. Caps a tutor at 25 per 24 hours and reuses a live code for the same email.';

revoke execute on function public.create_student_invitation(text, text) from public, anon;
grant execute on function public.create_student_invitation(text, text) to authenticated;

-- ── 8. Redeeming codes from an existing account ───────────────────

create or replace function public.link_self_to_teacher_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_caller          uuid := auth.uid();
  v_caller_role     text;
  v_normalized      text;
  v_invite          record;
  v_teacher         record;
  v_sponsor         boolean := false;
  v_teacher_id      uuid;
  v_teacher_first   text;
  v_teacher_last    text;
  v_teacher_exempt  boolean;
  v_teacher_role    text;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  v_normalized := upper(btrim(coalesce(p_code, '')));
  if length(v_normalized) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Enter a teacher or invitation code');
  end if;

  if public.is_demo() then
    return jsonb_build_object('ok', false, 'error', 'Demo accounts are read-only.');
  end if;

  select role into v_caller_role from public.profiles where id = v_caller;

  if v_caller_role is null then
    return jsonb_build_object('ok', false, 'error', 'Profile not found');
  end if;
  if v_caller_role not in ('student', 'practice') then
    return jsonb_build_object('ok', false, 'error', 'Only students can add a teacher code here');
  end if;

  -- 1. Single-use invitation (admin- or tutor-issued).
  select id, teacher_id, created_by, sponsored, used_by
    into v_invite
    from public.student_invite_codes
   where code = v_normalized
   for update;

  if found then
    if v_invite.used_by is not null then
      return jsonb_build_object('ok', false, 'error', 'This invitation code has already been used.');
    end if;

    select id, first_name, last_name, role, subscription_exempt
      into v_teacher
      from public.profiles
     where id = v_invite.teacher_id;
    if not found or v_teacher.role not in ('teacher', 'manager', 'admin') then
      return jsonb_build_object('ok', false, 'error', 'This invitation is no longer valid.');
    end if;
    if v_teacher.id = v_caller then
      return jsonb_build_object('ok', false, 'error', 'That is your own code');
    end if;

    v_sponsor := v_invite.sponsored and coalesce(v_teacher.subscription_exempt, false);
    if v_sponsor then
      perform set_config('studyworks.sponsorship_grant', 'invitation', true);
    end if;

    -- Never downgrades an existing sponsored link.
    insert into public.teacher_student_assignments as t
           (teacher_id, student_id, sponsored, sponsored_by, sponsored_at)
    values (v_teacher.id, v_caller, v_sponsor,
            case when v_sponsor then v_invite.created_by end,
            case when v_sponsor then now() end)
    on conflict (teacher_id, student_id) do update
       set sponsored    = t.sponsored or excluded.sponsored,
           sponsored_by = case when t.sponsored then t.sponsored_by else excluded.sponsored_by end,
           sponsored_at = case when t.sponsored then t.sponsored_at else excluded.sponsored_at end;

    perform set_config('studyworks.sponsorship_grant', '', true);

    update public.student_invite_codes
       set used_by = v_caller, used_at = now()
     where id = v_invite.id and used_by is null;

    update public.profiles set role = 'student'
     where id = v_caller and role = 'practice';

    return jsonb_build_object(
      'ok',                 true,
      'teacher_id',         v_teacher.id,
      'teacher_first_name', v_teacher.first_name,
      'teacher_last_name',  v_teacher.last_name,
      'teacher_exempt',     coalesce(v_teacher.subscription_exempt, false),
      'sponsored',          v_sponsor,
      'granted_exemption',  v_sponsor,
      'via',                'invitation'
    );
  end if;

  -- 2. A tutor's multi-use roster code. Roster-only: never sponsors,
  -- and refused for Studyworks tutors (owner policy 2026-07-16).
  select id, first_name, last_name, subscription_exempt, role
    into v_teacher_id, v_teacher_first, v_teacher_last,
         v_teacher_exempt, v_teacher_role
    from public.profiles
   where teacher_invite_code = v_normalized;

  if v_teacher_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'That code did not match a teacher or an invitation. Double-check with your teacher and try again.'
    );
  end if;
  if v_teacher_id = v_caller then
    return jsonb_build_object('ok', false, 'error', 'That is your own teacher code');
  end if;
  if v_teacher_role not in ('teacher', 'manager', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'That code does not belong to a teacher');
  end if;

  if v_teacher_exempt is true then
    return jsonb_build_object(
      'ok', false,
      'error', 'This tutor''s students join by personal invitation. '
               'Ask your tutor to send an invitation to your email.'
    );
  end if;

  insert into public.teacher_student_assignments (teacher_id, student_id)
       values (v_teacher_id, v_caller)
  on conflict (teacher_id, student_id) do nothing;

  update public.profiles set role = 'student'
   where id = v_caller and role = 'practice';

  return jsonb_build_object(
    'ok', true,
    'teacher_id',         v_teacher_id,
    'teacher_first_name', v_teacher_first,
    'teacher_last_name',  v_teacher_last,
    'teacher_exempt',     false,
    'sponsored',          false,
    'granted_exemption',  false,
    'via',                'teacher_code'
  );
end;
$function$;
