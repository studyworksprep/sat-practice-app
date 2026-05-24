-- =========================================================
-- link_self_to_teacher_by_code(p_code text)
-- =========================================================
-- The post-auth "add a teacher code" surface on /account needs
-- three things that no single RLS policy can express together:
--
--   1. Resolve profiles.teacher_invite_code -> teacher_id, even
--      though students can't otherwise SELECT unassigned teacher
--      rows.
--   2. Insert into teacher_student_assignments, which is admin-
--      only at the RLS layer (20230101000002).
--   3. If the resolved teacher is a Studyworks tutor (their
--      profiles.subscription_exempt is true), flip the caller's
--      own subscription_exempt to true — but only theirs, and
--      only ever to true. After this flip, canceling a paid
--      subscription leaves the student with access via the
--      exempt path in lib/subscription.js.
--
-- The previous server-action did this with a service-role
-- client in Node, which works but means the action holds RLS-
-- bypassing credentials for the duration of the request. A
-- logic bug there could write any row in any of the touched
-- tables. Folding the whole operation into one SECURITY DEFINER
-- function pulls the privilege boundary into SQL where the
-- student_id is always auth.uid() and can't be spoofed by the
-- caller. The Node side stays on the user-scoped client.
--
-- Returns a jsonb envelope rather than raising for the "bad
-- code" cases so the caller can render a clean inline error
-- without parsing exception messages. Real exceptions (caller
-- not authenticated, DB error) still raise.
--
-- Applied out-of-band to production (project noqtadytxyslkoetchrs)
-- and dev (ikzhizgsawzjpuuznfid) on 2026-05-24 via the Supabase
-- MCP, per docs/runbook.md "Applying a hotfix migration". The
-- function is a pure DDL add (no data backfill, no policy
-- changes), so replays normally on dev via `supabase db reset`.

create or replace function public.link_self_to_teacher_by_code(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller          uuid := auth.uid();
  v_caller_role     text;
  v_caller_exempt   boolean;
  v_normalized      text;
  v_teacher_id      uuid;
  v_teacher_first   text;
  v_teacher_last    text;
  v_teacher_exempt  boolean;
  v_teacher_role    text;
  v_granted         boolean := false;
begin
  if v_caller is null then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  -- Trim + uppercase mirrors the normalization the admin tool
  -- applies when setting a code (app/next/(admin)/admin/users/
  -- codes/actions.js). Codes are stored uppercase, so accepting
  -- a lower-case paste from a student keeps the UX forgiving.
  v_normalized := upper(btrim(coalesce(p_code, '')));
  if length(v_normalized) = 0 then
    return jsonb_build_object('ok', false, 'error', 'Enter a teacher code');
  end if;

  -- Caller must be a student / practice user. Teachers and
  -- staff manage rosters through other surfaces.
  select role, subscription_exempt
    into v_caller_role, v_caller_exempt
    from public.profiles
   where id = v_caller;

  if v_caller_role is null then
    return jsonb_build_object('ok', false, 'error', 'Profile not found');
  end if;
  if v_caller_role not in ('student', 'practice') then
    return jsonb_build_object('ok', false, 'error', 'Only students can add a teacher code here');
  end if;

  -- Resolve the code. SECURITY DEFINER lets this read past the
  -- profiles RLS that would otherwise hide unassigned teachers
  -- from a student. We expose only the teacher's display name +
  -- exempt status in the return value; nothing else leaks.
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

  -- Idempotent link. ON CONFLICT DO NOTHING means re-submitting
  -- the same code reports success (and granted_exemption=false
  -- if the flag was already set), matching the legacy Node-side
  -- upsert semantics.
  insert into public.teacher_student_assignments (teacher_id, student_id)
       values (v_teacher_id, v_caller)
  on conflict (teacher_id, student_id) do nothing;

  -- One-way exempt flip. Guarded on teacher's flag AND caller
  -- not already exempt, so the UPDATE only fires when there's a
  -- real change. The `is distinct from true` guard also covers
  -- the (defensively impossible) null case on subscription_exempt.
  if v_teacher_exempt is true and v_caller_exempt is distinct from true then
    update public.profiles
       set subscription_exempt = true
     where id = v_caller;
    v_granted := true;
  end if;

  return jsonb_build_object(
    'ok', true,
    'teacher_id',        v_teacher_id,
    'teacher_first_name', v_teacher_first,
    'teacher_last_name',  v_teacher_last,
    'teacher_exempt',     coalesce(v_teacher_exempt, false),
    'granted_exemption',  v_granted
  );
end;
$$;

comment on function public.link_self_to_teacher_by_code(text) is
  'Resolve a teacher_invite_code, link the caller as the teacher''s student, and one-way flip the caller''s subscription_exempt to true if the teacher is a Studyworks tutor. SECURITY DEFINER so the privilege boundary lives in SQL and student_id is always auth.uid().';

-- Lock down execution. PUBLIC / anon must not call this — only
-- authenticated users, who carry an auth.uid() the function
-- relies on for identity.
revoke all on function public.link_self_to_teacher_by_code(text) from public;
revoke all on function public.link_self_to_teacher_by_code(text) from anon;
grant execute on function public.link_self_to_teacher_by_code(text) to authenticated;

-- Nudge PostgREST so the new RPC is reachable immediately.
notify pgrst, 'reload schema';
