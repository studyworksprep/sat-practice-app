-- Phase 2 step 9, Type A: replace visibility policies with can_view()
--
-- Every SELECT policy that currently uses teacher_can_view_student()
-- plus inline manager-path joins is replaced with a single
-- can_view(target_column) call.
--
-- can_view() is a superset of the current checks:
--   self | is_admin | direct teacher→student (tsa) | direct manager→teacher (mta)
--   | transitive manager→student (mta→tsa) | class-based teacher→student
--
-- Changes per table:
--   profiles              — exact equivalent (all paths already present inline)
--   attempts              — exact equivalent
--   practice_test_attempts — exact equivalent
--   question_status       — expands: adds manager paths (managers can see student question status)
--   lesson_progress       — expands: adds manager paths
--   sat_official_scores   — expands: adds admin + class-based; collapses 3 policies → 1
--   sat_test_registrations — same as sat_official_scores
--
-- All expansions are intentional — the bridge RPCs exist precisely
-- because these policies were too narrow. Once this migration lands,
-- the bridge RPCs can be deleted.

-- ============================================================
-- 1. profiles (SELECT only — UPDATE stays as-is)
-- ============================================================
drop policy "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select to public using (can_view(id));

-- ============================================================
-- 2. attempts (SELECT only — DELETE, INSERT, UPDATE stay as-is)
-- ============================================================
drop policy "attempts_select" on public.attempts;
create policy "attempts_select" on public.attempts
  for select to public using (can_view(user_id));

-- ============================================================
-- 3. practice_test_attempts (SELECT only)
-- ============================================================
drop policy "pta_select" on public.practice_test_attempts;
create policy "pta_select" on public.practice_test_attempts
  for select to public using (can_view(user_id));

-- ============================================================
-- 4. question_status (SELECT only)
-- ============================================================
drop policy "qs_select" on public.question_status;
create policy "qs_select" on public.question_status
  for select to public using (can_view(user_id));

-- ============================================================
-- 5. lesson_progress (SELECT only)
-- ============================================================
drop policy "lesson_progress_select" on public.lesson_progress;
create policy "lesson_progress_select" on public.lesson_progress
  for select to public using (can_view(student_id));

-- ============================================================
-- 6. sat_official_scores (collapse 3 SELECT policies → 1)
-- ============================================================
drop policy "Students can view own scores" on public.sat_official_scores;
drop policy "Teachers can view assigned student scores" on public.sat_official_scores;
drop policy "Managers can view assigned student scores" on public.sat_official_scores;
create policy "sat_official_scores_select" on public.sat_official_scores
  for select to public using (can_view(student_id));

-- ============================================================
-- 7. sat_test_registrations (collapse 3 SELECT policies → 1)
-- ============================================================
drop policy "Students can view own registrations" on public.sat_test_registrations;
drop policy "Teachers can view assigned student registrations" on public.sat_test_registrations;
drop policy "Managers can view assigned student registrations" on public.sat_test_registrations;
create policy "sat_test_registrations_select" on public.sat_test_registrations
  for select to public using (can_view(student_id));
