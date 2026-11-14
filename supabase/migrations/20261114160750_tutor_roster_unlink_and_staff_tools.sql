-- Tutor readiness, round 2 (owner request 2026-11-14).
--
-- 1. Unlinking. Only an admin could remove a tutor–student link, so an
--    outside tutor could never drop a student and a student could never
--    leave a tutor. Now:
--      * a tutor may delete their OWN link to a student, unless
--        Studyworks sponsors that link (ending sponsorship stays an
--        admin decision);
--      * a student may delete any of their own links. Leaving a
--        sponsoring tutor ends that sponsorship — the student's choice,
--        confirmed in the UI.
--    Demo accounts stay read-only through the existing restrictive
--    demo_readonly_delete policy.
--
-- 2. Studyworks-internal tools. Bluebook contributions and lesson-edit
--    drafting were open to every teacher because every teacher was a
--    Studyworks tutor. Outside tutors now get neither: can_contribute()
--    and the lesson_revisions write policies use is_studyworks_staff()
--    (migration 20261114115428) instead of is_teacher(). The dedicated
--    'contributor' role keeps contributing.

-- ── 1. Unlinking ───────────────────────────────────────────────────

drop policy if exists tsa_delete_own_tutor on public.teacher_student_assignments;
create policy tsa_delete_own_tutor on public.teacher_student_assignments
  for delete to authenticated using (teacher_id = auth.uid() and not sponsored);

drop policy if exists tsa_delete_own_student on public.teacher_student_assignments;
create policy tsa_delete_own_student on public.teacher_student_assignments
  for delete to authenticated using (student_id = auth.uid());

-- ── 2. Contributions: Studyworks staff or the contributor role ────

create or replace function public.can_contribute()
returns boolean
language sql
stable
set search_path to 'public'
as $function$
  select public.is_studyworks_staff() or public.is_contributor();
$function$;

comment on function public.can_contribute() is
  'True when the session may create bluebook_submissions rows: Studyworks staff (is_studyworks_staff: admin, manager, exempt teacher) or the outside-contributor role. Outside, paying tutors are excluded (2026-11-14).';

-- ── 2. Lesson-edit drafting: Studyworks staff ─────────────────────
-- create_lesson_revision() is SECURITY INVOKER, so the insert policy
-- below is what stops an outside tutor from opening a draft.

drop policy if exists lesson_revisions_insert on public.lesson_revisions;
create policy lesson_revisions_insert on public.lesson_revisions
  for insert to authenticated with check (
    (select public.is_studyworks_staff())
    and not (select public.is_demo())
    and owner_id = (select auth.uid())
    and state = 'draft'
  );

drop policy if exists lesson_revisions_update on public.lesson_revisions;
create policy lesson_revisions_update on public.lesson_revisions
  for update to authenticated
  using (
    (select public.is_admin())
    or (owner_id = (select auth.uid())
        and state = any (array['draft', 'changes_requested'])
        and (select public.is_studyworks_staff())
        and not (select public.is_demo()))
  )
  with check (
    (select public.is_admin())
    or (owner_id = (select auth.uid())
        and state = any (array['draft', 'changes_requested', 'submitted'])
        and (select public.is_studyworks_staff())
        and not (select public.is_demo()))
  );
