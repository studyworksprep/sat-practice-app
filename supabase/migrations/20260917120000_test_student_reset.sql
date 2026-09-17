-- =========================================================
-- Test-student reset (admin tooling for the onboarding flow)
-- =========================================================
--
-- Repeated testing of signup → intake → plan needs a way to put a
-- student back at "first login" without creating a new account each
-- time. Two pieces:
--
-- 1. profiles.is_test — an explicit, admin-set flag. Nothing infers
--    test status from an email domain; only flagged accounts can be
--    reset. The dev seed sets it on the *@test.studyworks students.
--
-- 2. reset_test_student(p_student, p_resend_welcome) — one
--    transactional function that deletes everything the student
--    generated (attempts, sessions, plans, intake, mastery, notes,
--    flashcards, saved calculator states, ACT and practice-test
--    attempts, reading-coach sessions, official scores) and clears the
--    plan-shaping profile fields. It leaves the auth user, identity,
--    role, tutor/class links, assignments, subscription/entitlement
--    rows, invite-code claims, and tutor-authored notes alone, so the
--    account is still logged-in-able and still rostered.
--
-- SECURITY DEFINER so the deletes bypass per-table RLS in one audited
-- place, with the guard inside the function: caller must be an admin
-- (is_admin(), JWT-based), target must be a student flagged is_test,
-- never a demo account, and never an account with a live subscription
-- (the signature of a real customer flagged by mistake). Returns the
-- per-table delete counts for the caller's audit log.

alter table public.profiles
  add column if not exists is_test boolean not null default false;

comment on column public.profiles.is_test is
  'Admin-set: this account exists for testing and may be reset to first login via reset_test_student(). Never inferred from the email.';

create or replace function public.reset_test_student(
  p_student uuid,
  p_resend_welcome boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role     text;
  v_is_test  boolean;
  v_is_demo  boolean;
  v_counts   jsonb := '{}'::jsonb;
  v_n        bigint;
  v_target   text;
  -- table:column pairs, in an order that respects the one non-cascading
  -- child: practice_test_item_attempts_v2.attempt_id → attempts (NO
  -- ACTION), so practice-test attempts (which cascade to item attempts)
  -- go before the shared attempts table.
  v_targets  text[] := array[
    'practice_test_attempts_v2:user_id',
    'act_practice_test_attempts:user_id',
    'act_attempts:user_id',
    'attempts:user_id',
    'practice_sessions:user_id',
    'study_plans:student_id',          -- plan_tasks cascade
    'student_intake:student_id',
    'skill_mastery_snapshots:student_id',
    'review_queue:student_id',
    'lesson_progress:student_id',
    'student_notes:user_id',
    'question_error_notes:user_id',
    'question_notes:author_id',
    'flashcard_sets:user_id',          -- flashcards cascade
    'desmos_saved_states:saved_by',
    'sat_vocabulary_progress:user_id',
    'reading_coach_turns:user_id',
    'reading_coach_sessions:user_id',  -- remaining turns cascade
    'sat_official_scores:student_id',
    'sat_test_registrations:student_id'
  ];
begin
  if not public.is_admin() then
    raise exception 'reset_test_student: admin only' using errcode = '42501';
  end if;

  select role, is_test, is_demo
    into v_role, v_is_test, v_is_demo
    from public.profiles
   where id = p_student
     for update;
  if not found then
    raise exception 'reset_test_student: no such user %', p_student;
  end if;
  if v_role <> 'student' then
    raise exception 'reset_test_student: % is a %, not a student', p_student, v_role;
  end if;
  if v_is_test is not true then
    raise exception 'reset_test_student: account is not flagged as a test account';
  end if;
  if v_is_demo is true then
    raise exception 'reset_test_student: demo accounts are read-only';
  end if;
  if exists (
    select 1 from public.subscriptions s
     where s.user_id = p_student and s.status in ('active', 'trialing', 'past_due')
  ) then
    raise exception 'reset_test_student: account has a live subscription — refusing to reset';
  end if;

  foreach v_target in array v_targets loop
    execute format(
      'delete from public.%I where %I = $1',
      split_part(v_target, ':', 1),
      split_part(v_target, ':', 2)
    ) using p_student;
    get diagnostics v_n = row_count;
    if v_n > 0 then
      v_counts := v_counts || jsonb_build_object(split_part(v_target, ':', 1), v_n);
    end if;
  end loop;

  update public.profiles
     set target_sat_score = null,
         sat_test_date = null,
         practice_test_v2_imported_at = null,
         welcome_email_sent_at = case when p_resend_welcome then null else welcome_email_sent_at end
   where id = p_student;

  return jsonb_build_object(
    'student_id', p_student,
    'reset_at', now(),
    'resend_welcome', p_resend_welcome,
    'deleted', v_counts
  );
end;
$$;

revoke all on function public.reset_test_student(uuid, boolean) from public;
grant execute on function public.reset_test_student(uuid, boolean) to authenticated;

comment on function public.reset_test_student(uuid, boolean) is
  'Admin-only: put a flagged test student back at first login (deletes generated data, clears plan-shaping profile fields). Returns per-table delete counts.';
