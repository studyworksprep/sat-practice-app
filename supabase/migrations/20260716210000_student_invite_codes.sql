-- =========================================================
-- Single-use student invitation codes (owner policy 2026-07-16)
-- =========================================================
-- Incident: a student signed up with a Studyworks tutor's PERMANENT
-- multi-use invite code (profiles.teacher_invite_code) that was never
-- sent to them — the code is a bearer token for free access
-- (roster edge + subscription_exempt), so students can share it.
--
-- Fix, per owner decision: sponsored (free) student access is granted
-- ONLY through admin-issued, single-use invitation codes:
--
--   * An admin invites a student from /admin/users (email + tutor).
--     The system generates a code, emails the invitation, and tracks
--     the code on /admin/users/codes (claimed when / by whom / tutor).
--   * At signup the code is valid exactly once — a reused code fails
--     at code-entry time, so the student still lands in the normal
--     subscribe/trial flow. The invited email is the CONTACT POINT,
--     not a lock (students often sign up under a different address
--     than the family contact); the tracker's claimed-by column is
--     the audit record of who actually redeemed each code.
--   * The multi-use teacher_invite_code becomes ROSTER-ONLY and stops
--     working entirely for Studyworks (exempt) tutors — otherwise a
--     shared code would still grant sponsored access via the roster
--     edge once the entitlements_gate flips. Outside (non-exempt)
--     tutors keep it for self-serve rostering; sharing it grants
--     nothing free (their students subscribe regardless).
--
-- Mirrors teacher_codes conventions (unique code, used_by/used_at,
-- admin-only RLS via is_admin()).

create table if not exists public.student_invite_codes (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  -- The tutor the invited student will roster to.
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  -- The invited student's contact email (recorded for the tracker; the
  -- code itself is redeemable from any signup address — used_by is the
  -- record of who claimed it).
  email      text not null,
  created_by uuid references public.profiles(id) on delete set null,
  used_by    uuid references public.profiles(id) on delete set null,
  used_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.student_invite_codes is
  'Admin-issued, single-use student invitations. The ONLY path to '
  'sponsored (free) student access — the multi-use teacher_invite_code '
  'is roster-only and rejected for Studyworks (exempt) tutors. The '
  'email column is the invited contact point, not a lock; used_by '
  'records who actually claimed the code. Owner policy 2026-07-16.';

create index if not exists student_invite_codes_teacher_idx
  on public.student_invite_codes (teacher_id);
create index if not exists student_invite_codes_email_idx
  on public.student_invite_codes (lower(email));

alter table public.student_invite_codes enable row level security;

-- Admin-only management (the signup route runs service-role).
drop policy if exists student_invite_codes_admin_all on public.student_invite_codes;
create policy student_invite_codes_admin_all on public.student_invite_codes
  for all using (public.is_admin());

grant select, insert, update, delete on public.student_invite_codes to authenticated;
grant all on public.student_invite_codes to service_role;

-- ── link_self_to_teacher_by_code: roster-only, never exemption ──────
-- The in-app /account "add a teacher code" path used the same
-- multi-use code AND flipped the caller's subscription_exempt when the
-- teacher was a Studyworks tutor — the identical sharing leak. The
-- replacement:
--   * never touches subscription_exempt (granted_exemption is kept in
--     the return envelope for caller compatibility, always false);
--   * rejects codes belonging to Studyworks (exempt) tutors outright —
--     their students join by personal invitation at signup;
--   * keeps roster-only linking for outside (non-exempt) tutors.

create or replace function public.link_self_to_teacher_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller          uuid := auth.uid();
  v_caller_role     text;
  v_normalized      text;
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
    return jsonb_build_object('ok', false, 'error', 'Enter a teacher code');
  end if;

  select role into v_caller_role from public.profiles where id = v_caller;

  if v_caller_role is null then
    return jsonb_build_object('ok', false, 'error', 'Profile not found');
  end if;
  if v_caller_role not in ('student', 'practice') then
    return jsonb_build_object('ok', false, 'error', 'Only students can add a teacher code here');
  end if;

  select id, first_name, last_name, subscription_exempt, role
    into v_teacher_id, v_teacher_first, v_teacher_last,
         v_teacher_exempt, v_teacher_role
    from public.profiles
   where teacher_invite_code = v_normalized;

  if v_teacher_id is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'That code did not match a teacher. Double-check with your teacher and try again.'
    );
  end if;
  if v_teacher_id = v_caller then
    return jsonb_build_object('ok', false, 'error', 'That is your own teacher code');
  end if;
  if v_teacher_role not in ('teacher', 'manager', 'admin') then
    return jsonb_build_object('ok', false, 'error', 'That code does not belong to a teacher');
  end if;

  -- Studyworks tutors' students join by personal invitation — the
  -- shared multi-use code must not create the roster edge that grants
  -- sponsored access.
  if v_teacher_exempt is true then
    return jsonb_build_object(
      'ok', false,
      'error', 'This tutor''s students join by personal invitation. '
               'Ask your tutor to have an invitation sent to your email.'
    );
  end if;

  insert into public.teacher_student_assignments (teacher_id, student_id)
       values (v_teacher_id, v_caller)
  on conflict (teacher_id, student_id) do nothing;

  return jsonb_build_object(
    'ok', true,
    'teacher_id',        v_teacher_id,
    'teacher_first_name', v_teacher_first,
    'teacher_last_name',  v_teacher_last,
    'teacher_exempt',     false,
    'granted_exemption',  false
  );
end;
$$;

comment on function public.link_self_to_teacher_by_code(text) is
  'Resolve a teacher_invite_code and link the caller as the teacher''s '
  'student — ROSTER ONLY, never exemption (owner policy 2026-07-16). '
  'Codes of Studyworks (exempt) tutors are rejected: their students '
  'join by admin-issued single-use invitation (student_invite_codes).';

revoke all on function public.link_self_to_teacher_by_code(text) from public;
revoke all on function public.link_self_to_teacher_by_code(text) from anon;
grant execute on function public.link_self_to_teacher_by_code(text) to authenticated;

notify pgrst, 'reload schema';
