-- Scope the policies that trusted every teacher (owner request
-- 2026-11-14).
--
-- These were written when every 'teacher' account was a Studyworks
-- tutor, so is_teacher() meant "staff". Codeless tutor signup is open
-- to outside, paying tutors, and through the database API (the public
-- key plus their own session) any of them could:
--
--   * add or delete ANY student's official scores and test
--     registrations (INSERT/DELETE were bare is_teacher());
--   * put any student UUID on their own assignment
--     (asv2_insert_teacher never checked the student);
--   * read and approve other people's Bluebook submissions and read
--     calibration responses;
--   * read every Studyworks tutor's question notes. The owner chose to
--     leave that one on 2026-10-26 while all tutors were Studyworks
--     tutors; multi-org tutoring is the condition that reopened it.
--
-- The app's own actions already checked can_view or role; the database
-- now enforces the same thing. Studyworks staff (admin, manager, or an
-- exempt teacher) keep every read they had.

-- ── Studyworks staff ──────────────────────────────────────────────

create or replace function public.is_studyworks_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.is_manager()  -- manager or admin, from the JWT
      or exists (
        select 1 from public.profiles p
         where p.id = auth.uid()
           and p.role = 'teacher'
           and p.subscription_exempt);
$$;

comment on function public.is_studyworks_staff() is
  'Admin, manager, or a Studyworks (exempt) teacher. What is_teacher() meant before outside tutors could sign up.';

revoke execute on function public.is_studyworks_staff() from public, anon;
grant execute on function public.is_studyworks_staff() to authenticated, service_role;

-- ── Official scores and test registrations: own students only ─────

drop policy if exists "Teachers can insert scores for assigned students" on public.sat_official_scores;
drop policy if exists "Teachers can delete scores" on public.sat_official_scores;
create policy sat_official_scores_tutor_insert on public.sat_official_scores
  for insert with check (public.is_teacher() and public.can_view(student_id));
create policy sat_official_scores_tutor_delete on public.sat_official_scores
  for delete using (public.is_teacher() and public.can_view(student_id));

drop policy if exists "Teachers can insert registrations for assigned students" on public.sat_test_registrations;
drop policy if exists "Teachers can delete registrations for assigned students" on public.sat_test_registrations;
create policy sat_test_registrations_tutor_insert on public.sat_test_registrations
  for insert with check (public.is_teacher() and public.can_view(student_id));
create policy sat_test_registrations_tutor_delete on public.sat_test_registrations
  for delete using (public.is_teacher() and public.can_view(student_id));

-- ── Assignments: only students the tutor can see ──────────────────

drop policy if exists asv2_insert_teacher on public.assignment_students_v2;
create policy asv2_insert_teacher on public.assignment_students_v2
  for insert with check (
    (public.is_v2_assignment_teacher(assignment_id, auth.uid()) and public.can_view(student_id))
    or public.is_admin()
  );

-- ── Bluebook contributions: Studyworks staff review ──────────────

drop policy if exists bluebook_submissions_staff_select on public.bluebook_submissions;
create policy bluebook_submissions_staff_select on public.bluebook_submissions
  for select to authenticated using ((select public.is_studyworks_staff()));

drop policy if exists bluebook_submissions_staff_review on public.bluebook_submissions;
create policy bluebook_submissions_staff_review on public.bluebook_submissions
  for update to authenticated
  using ((select public.is_studyworks_staff()) and contributor_id <> auth.uid())
  with check ((select public.is_studyworks_staff()) and contributor_id <> auth.uid());

drop policy if exists bluebook_calibration_responses_staff_read on public.bluebook_calibration_responses;
create policy bluebook_calibration_responses_staff_read on public.bluebook_calibration_responses
  for select to authenticated using ((select public.is_studyworks_staff()));

-- ── Question notes: Studyworks staff read all; others their own ──
-- The app shows notes through lib/practice/load-question-notes.js
-- (service client, author-hierarchy filter), so on-screen behavior is
-- unchanged; this closes direct API reads.

drop policy if exists question_notes_select on public.question_notes;
create policy question_notes_select on public.question_notes
  for select using (
    public.is_teacher()
    and (author_id = auth.uid() or (select public.is_studyworks_staff()))
  );
