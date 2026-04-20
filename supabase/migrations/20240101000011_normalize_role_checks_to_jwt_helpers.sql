-- Phase 2 step 9, Type B: normalize all profiles-table role checks
-- to JWT-based helper functions.
--
-- Every policy that currently does:
--   exists (select 1 from profiles where id = auth.uid() and role = ...)
-- is replaced with the equivalent JWT-based helper:
--   profiles.role = 'admin'                        → is_admin()
--   profiles.role in ('manager','admin')            → is_manager()
--   profiles.role in ('teacher','manager','admin')  → is_teacher()
--
-- This is a mechanical replacement. No behavior change — the JWT
-- app_metadata.role is already kept in sync with profiles.role by the
-- auth system, and half the existing policies already use the JWT
-- helpers. This migration brings the other half into line.

-- ============================================================
-- 1. Create is_manager() — missing from the helper set until now
-- ============================================================
create or replace function public.is_manager()
returns boolean
language sql
stable
set search_path to 'public'
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') in ('manager', 'admin');
$$;

-- ============================================================
-- 2. answer_choice_tags (4 policies)
-- ============================================================
drop policy "answer_choice_tags_delete" on public.answer_choice_tags;
create policy "answer_choice_tags_delete" on public.answer_choice_tags
  for delete to public using (is_admin());

drop policy "answer_choice_tags_insert" on public.answer_choice_tags;
create policy "answer_choice_tags_insert" on public.answer_choice_tags
  for insert to public with check (is_manager());

drop policy "answer_choice_tags_select" on public.answer_choice_tags;
create policy "answer_choice_tags_select" on public.answer_choice_tags
  for select to public using (is_teacher());

drop policy "answer_choice_tags_update" on public.answer_choice_tags;
create policy "answer_choice_tags_update" on public.answer_choice_tags
  for update to public using (is_admin());

-- ============================================================
-- 3. concept_tags (4 policies)
-- ============================================================
drop policy "concept_tags_delete" on public.concept_tags;
create policy "concept_tags_delete" on public.concept_tags
  for delete to public using (is_admin());

drop policy "concept_tags_insert" on public.concept_tags;
create policy "concept_tags_insert" on public.concept_tags
  for insert to public with check (is_manager());

drop policy "concept_tags_select" on public.concept_tags;
create policy "concept_tags_select" on public.concept_tags
  for select to public using (is_teacher());

drop policy "concept_tags_update" on public.concept_tags;
create policy "concept_tags_update" on public.concept_tags
  for update to public using (is_admin());

-- ============================================================
-- 4. option_answer_choice_tags (3 policies)
-- ============================================================
drop policy "option_answer_choice_tags_delete" on public.option_answer_choice_tags;
create policy "option_answer_choice_tags_delete" on public.option_answer_choice_tags
  for delete to public using (is_admin());

drop policy "option_answer_choice_tags_insert" on public.option_answer_choice_tags;
create policy "option_answer_choice_tags_insert" on public.option_answer_choice_tags
  for insert to public with check (is_manager());

drop policy "option_answer_choice_tags_select" on public.option_answer_choice_tags;
create policy "option_answer_choice_tags_select" on public.option_answer_choice_tags
  for select to public using (is_teacher());

-- ============================================================
-- 5. question_concept_tags (3 policies)
-- ============================================================
drop policy "question_concept_tags_delete" on public.question_concept_tags;
create policy "question_concept_tags_delete" on public.question_concept_tags
  for delete to public using (is_admin());

drop policy "question_concept_tags_insert" on public.question_concept_tags;
create policy "question_concept_tags_insert" on public.question_concept_tags
  for insert to public with check (is_manager());

drop policy "question_concept_tags_select" on public.question_concept_tags;
create policy "question_concept_tags_select" on public.question_concept_tags
  for select to public using (is_teacher());

-- ============================================================
-- 6. desmos_saved_states (3 policies — select already uses is_teacher)
-- ============================================================
drop policy "desmos_saved_states_delete" on public.desmos_saved_states;
create policy "desmos_saved_states_delete" on public.desmos_saved_states
  for delete to public using (is_manager());

drop policy "desmos_saved_states_insert" on public.desmos_saved_states;
create policy "desmos_saved_states_insert" on public.desmos_saved_states
  for insert to public with check (is_manager());

drop policy "desmos_saved_states_update" on public.desmos_saved_states;
create policy "desmos_saved_states_update" on public.desmos_saved_states
  for update to public using (is_manager());

-- ============================================================
-- 7. questions_v2_fix_suggestions (4 policies)
-- ============================================================
drop policy "qv2_fix_suggestions_admin_delete" on public.questions_v2_fix_suggestions;
create policy "qv2_fix_suggestions_admin_delete" on public.questions_v2_fix_suggestions
  for delete to public using (is_admin());

drop policy "qv2_fix_suggestions_admin_insert" on public.questions_v2_fix_suggestions;
create policy "qv2_fix_suggestions_admin_insert" on public.questions_v2_fix_suggestions
  for insert to public with check (is_admin());

drop policy "qv2_fix_suggestions_admin_select" on public.questions_v2_fix_suggestions;
create policy "qv2_fix_suggestions_admin_select" on public.questions_v2_fix_suggestions
  for select to public using (is_admin());

drop policy "qv2_fix_suggestions_admin_update" on public.questions_v2_fix_suggestions;
create policy "qv2_fix_suggestions_admin_update" on public.questions_v2_fix_suggestions
  for update to public using (is_admin());

-- ============================================================
-- 8. question_assignments (1 policy)
-- ============================================================
drop policy "Teachers manage own assignments" on public.question_assignments;
create policy "Teachers manage own assignments" on public.question_assignments
  for all to public using (teacher_id = auth.uid() or is_admin());

-- ============================================================
-- 9. question_assignment_students (2 policies)
-- ============================================================
drop policy "Teachers manage assignment students" on public.question_assignment_students;
create policy "Teachers manage assignment students" on public.question_assignment_students
  for all to public using (is_assignment_teacher(assignment_id, auth.uid()) or is_admin());

drop policy "View assignment students" on public.question_assignment_students;
create policy "View assignment students" on public.question_assignment_students
  for select to public using (
    student_id = auth.uid()
    or is_assignment_teacher(assignment_id, auth.uid())
    or is_admin()
  );

-- ============================================================
-- 10. sat_official_scores (2 policies — insert, delete)
-- ============================================================
drop policy "Teachers can delete scores" on public.sat_official_scores;
create policy "Teachers can delete scores" on public.sat_official_scores
  for delete to public using (is_teacher());

drop policy "Teachers can insert scores for assigned students" on public.sat_official_scores;
create policy "Teachers can insert scores for assigned students" on public.sat_official_scores
  for insert to public with check (is_teacher());

-- ============================================================
-- 11. sat_test_registrations (2 policies — insert, delete)
-- ============================================================
drop policy "Teachers can delete registrations for assigned students" on public.sat_test_registrations;
create policy "Teachers can delete registrations for assigned students" on public.sat_test_registrations
  for delete to public using (is_teacher());

drop policy "Teachers can insert registrations for assigned students" on public.sat_test_registrations;
create policy "Teachers can insert registrations for assigned students" on public.sat_test_registrations
  for insert to public with check (is_teacher());

-- ============================================================
-- 12. skill_learnability (1 policy)
-- ============================================================
drop policy "Admins can manage skill_learnability" on public.skill_learnability;
create policy "Admins can manage skill_learnability" on public.skill_learnability
  for all to public using (is_manager());

-- ============================================================
-- 13. bug_reports (1 policy)
-- ============================================================
drop policy "Admins can do everything on bug_reports" on public.bug_reports;
create policy "Admins can do everything on bug_reports" on public.bug_reports
  for all to public using (is_admin()) with check (is_admin());
