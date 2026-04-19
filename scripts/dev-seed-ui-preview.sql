-- Dev-DB UI-preview seed for Phase 4 primitive visual verification.
--
-- Adds just enough content that every new-tree page in the checklist
-- has something real to render:
--   - 3 more students (total 5) so the tutor dashboard / admin users
--     table have real rows
--   - 1 published lesson so the 'lesson' assignment type has a title
--   - 5 assignments covering all three types + active / overdue /
--     archived states
--   - Attempts spread so student1 has partial progress on A1 and
--     student2 has fully completed A1 (triggering the per-student
--     completed_at path)
--   - A handful of score_conversion + skill_learnability rows
--   - A second teacher_code so the admin codes page has > 1 row
--
-- NOT a production migration. Dev-DB only. Idempotent (stable UUIDs
-- + ON CONFLICT). Run via the Supabase MCP execute_sql tool. Depends
-- on scripts/dev-seed-practice-test-v2.sql having already run (pulls
-- in the existing questions, practice test, and admin/teacher/
-- student1/student2 accounts).

-- ============================================================
-- 1. ADDITIONAL STUDENTS (student3, student4, student5)
-- ============================================================

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_sso_user, is_anonymous
) values
  ('55555555-5555-5555-5555-555555555555', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'student3@test.studyworks', 'x', now(), now(), now(),
   '{"role":"student"}'::jsonb, '{}'::jsonb, false, false),
  ('66666666-6666-6666-6666-666666666666', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'student4@test.studyworks', 'x', now(), now(), now(),
   '{"role":"student"}'::jsonb, '{}'::jsonb, false, false),
  ('77777777-7777-7777-7777-777777777777', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'student5@test.studyworks', 'x', now(), now(), now(),
   '{"role":"student"}'::jsonb, '{}'::jsonb, false, false)
on conflict (id) do nothing;

insert into public.profiles (
  id, role, email, first_name, last_name,
  is_active, target_sat_score, high_school, graduation_year,
  ui_version
) values
  ('55555555-5555-5555-5555-555555555555', 'student', 'student3@test.studyworks', 'Stu', 'Three', true, 1500, 'Test High',  2026, 'next'),
  ('66666666-6666-6666-6666-666666666666', 'student', 'student4@test.studyworks', 'Stu', 'Four',  true, 1100, 'Other High', 2027, 'next'),
  ('77777777-7777-7777-7777-777777777777', 'student', 'student5@test.studyworks', 'Stu', 'Five',  true, 1350, 'Test High',  2026, 'next')
on conflict (id) do update set
  role=excluded.role, email=excluded.email, first_name=excluded.first_name,
  last_name=excluded.last_name, is_active=excluded.is_active,
  target_sat_score=excluded.target_sat_score,
  high_school=excluded.high_school, graduation_year=excluded.graduation_year,
  ui_version=excluded.ui_version;

update auth.users
set encrypted_password = crypt('devseed123', gen_salt('bf', 10))
where id in (
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666',
  '77777777-7777-7777-7777-777777777777'
);

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select u.id, u.id, u.id::text, 'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email,
    'email_verified', true, 'phone_verified', false),
  now(), now(), now()
from auth.users u
where u.id in (
  '55555555-5555-5555-5555-555555555555',
  '66666666-6666-6666-6666-666666666666',
  '77777777-7777-7777-7777-777777777777'
)
on conflict (id) do nothing;

-- Assign all 5 students to the teacher.
insert into public.teacher_student_assignments (teacher_id, student_id)
values
  ('22222222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444'),
  ('22222222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555'),
  ('22222222-2222-2222-2222-222222222222', '66666666-6666-6666-6666-666666666666'),
  ('22222222-2222-2222-2222-222222222222', '77777777-7777-7777-7777-777777777777')
on conflict do nothing;

-- ============================================================
-- 2. LESSON (one published lesson for the lesson assignment)
-- ============================================================

insert into public.lessons (id, author_id, title, description, visibility, status)
values (
  'aaaa1111-aaaa-1111-aaaa-111111111111',
  '22222222-2222-2222-2222-222222222222',
  'Intro to Linear Equations',
  'Quick refresher on solving and graphing linear equations in one variable.',
  'shared',
  'published'
) on conflict (id) do nothing;

-- ============================================================
-- 3. ASSIGNMENTS v2
--    5 assignments covering every type and state shown in the
--    student panel + teacher dashboard + tutor student-detail page.
-- ============================================================

insert into public.assignments_v2 (
  id, teacher_id, assignment_type, title, description, due_date,
  archived_at, question_ids, filter_criteria, lesson_id, practice_test_id,
  created_by, updated_by, created_at
) values
  -- A1: questions, active, due in 3 days. student1 partial, student2 done.
  ('aa000001-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222', 'questions',
   'Linear Equations Set 1', 'Starter problems on one-variable linear equations.',
   now() + interval '3 days',
   null,
   array[
     'a0000001-0000-0000-0000-000000000001'::uuid,
     'a0000002-0000-0000-0000-000000000002'::uuid,
     'a0000003-0000-0000-0000-000000000003'::uuid,
     'a0000004-0000-0000-0000-000000000004'::uuid,
     'a0000005-0000-0000-0000-000000000005'::uuid
   ],
   '{"domains":["Algebra"],"size":5}'::jsonb,
   null, null,
   '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   now() - interval '4 days'),

  -- A2: questions, overdue (past due_date), no one has started.
  ('aa000002-0000-0000-0000-000000000002',
   '22222222-2222-2222-2222-222222222222', 'questions',
   'Words in Context (overdue)', 'Vocabulary-in-context passages.',
   now() - interval '2 days',
   null,
   array[
     'a0000006-0000-0000-0000-000000000006'::uuid,
     'a0000007-0000-0000-0000-000000000007'::uuid,
     'a0000008-0000-0000-0000-000000000008'::uuid
   ],
   '{"domains":["Craft and Structure"],"size":3}'::jsonb,
   null, null,
   '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   now() - interval '10 days'),

  -- A3: questions, teacher-archived (preserves v1 "completed_at" intent).
  ('aa000003-0000-0000-0000-000000000003',
   '22222222-2222-2222-2222-222222222222', 'questions',
   'Quadratics Intro (retired)', null,
   now() - interval '20 days',
   now() - interval '1 day',
   array[
     'a0000001-0000-0000-0000-000000000001'::uuid,
     'a0000002-0000-0000-0000-000000000002'::uuid
   ],
   null,
   null, null,
   '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   now() - interval '30 days'),

  -- A4: practice_test, active, two students enrolled.
  ('aa000004-0000-0000-0000-000000000004',
   '22222222-2222-2222-2222-222222222222', 'practice_test',
   'Take Practice Test 1', 'Full-length diagnostic.',
   now() + interval '7 days',
   null,
   null,
   jsonb_build_object(
     'type', 'practice_test',
     'practice_test_id', 'c0000001-0000-0000-0000-000000000001',
     'sections', 'both'
   ),
   null,
   'c0000001-0000-0000-0000-000000000001',
   '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   now() - interval '1 day'),

  -- A5: lesson, active.
  ('aa000005-0000-0000-0000-000000000005',
   '22222222-2222-2222-2222-222222222222', 'lesson',
   null, null,
   now() + interval '5 days',
   null,
   null, null,
   'aaaa1111-aaaa-1111-aaaa-111111111111',
   null,
   '22222222-2222-2222-2222-222222222222',
   '22222222-2222-2222-2222-222222222222',
   now() - interval '2 days')
on conflict (id) do nothing;

-- ============================================================
-- 4. ASSIGNMENT_STUDENTS_V2
--    A1: student1 (partial progress), student2 (fully completed).
--    A2: student3 only — nobody's touched it, so overdue is loud.
--    A3: student4 only (archived but with completion preserved).
--    A4: student1, student3.
--    A5: student5.
-- ============================================================

insert into public.assignment_students_v2 (
  assignment_id, student_id, completed_at, created_at
) values
  ('aa000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', null, now() - interval '4 days'),
  ('aa000001-0000-0000-0000-000000000001', '44444444-4444-4444-4444-444444444444', now() - interval '6 hours', now() - interval '4 days'),

  ('aa000002-0000-0000-0000-000000000002', '55555555-5555-5555-5555-555555555555', null, now() - interval '10 days'),

  ('aa000003-0000-0000-0000-000000000003', '66666666-6666-6666-6666-666666666666', null, now() - interval '30 days'),

  ('aa000004-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', null, now() - interval '1 day'),
  ('aa000004-0000-0000-0000-000000000004', '55555555-5555-5555-5555-555555555555', null, now() - interval '1 day'),

  ('aa000005-0000-0000-0000-000000000005', '77777777-7777-7777-7777-777777777777', null, now() - interval '2 days')
on conflict (assignment_id, student_id) do nothing;

-- ============================================================
-- 5. ATTEMPTS for the "progress" scenario on A1
--    student1: 3 of 5 questions answered (mix of right/wrong) → partial.
--    student2: 5 of 5 answered (mostly right, one wrong) → triggers the
--              teacher-facing "all done" view even though completed_at
--              was set directly by the junction insert above.
-- ============================================================

insert into public.attempts (
  user_id, question_id, is_correct, response_text, source, created_at
) values
  -- student1 — 3 of 5
  ('33333333-3333-3333-3333-333333333333', 'a0000001-0000-0000-0000-000000000001', true,  'A', 'practice', now() - interval '3 days'),
  ('33333333-3333-3333-3333-333333333333', 'a0000002-0000-0000-0000-000000000002', false, 'B', 'practice', now() - interval '2 days 5 hours'),
  ('33333333-3333-3333-3333-333333333333', 'a0000003-0000-0000-0000-000000000003', true,  'C', 'practice', now() - interval '1 day'),

  -- student2 — 5 of 5 (4 correct, 1 wrong)
  ('44444444-4444-4444-4444-444444444444', 'a0000001-0000-0000-0000-000000000001', true,  'A', 'practice', now() - interval '2 days'),
  ('44444444-4444-4444-4444-444444444444', 'a0000002-0000-0000-0000-000000000002', true,  'A', 'practice', now() - interval '2 days 1 hour'),
  ('44444444-4444-4444-4444-444444444444', 'a0000003-0000-0000-0000-000000000003', true,  'C', 'practice', now() - interval '1 day 22 hours'),
  ('44444444-4444-4444-4444-444444444444', 'a0000004-0000-0000-0000-000000000004', false, '12', 'practice', now() - interval '1 day 5 hours'),
  ('44444444-4444-4444-4444-444444444444', 'a0000005-0000-0000-0000-000000000005', true,  'D', 'practice', now() - interval '8 hours'),

  -- student3 — a couple of generic practice attempts so the dashboard
  -- "Total attempts" + "Last activity" aren't zero.
  ('55555555-5555-5555-5555-555555555555', 'a0000007-0000-0000-0000-000000000007', false, 'A', 'practice', now() - interval '4 hours'),
  ('55555555-5555-5555-5555-555555555555', 'a0000008-0000-0000-0000-000000000008', true,  'B', 'practice', now() - interval '2 hours')
;

-- ============================================================
-- 6. SCORE CONVERSION — a handful of rows so the admin page's
--    "existing mappings" table has content.
-- ============================================================

insert into public.score_conversion (
  test_id, test_name, section, module1_correct, module2_correct, scaled_score
) values
  ('SEED-PT-1', 'Seed Practice Test 1', 'reading_writing', 15, 18, 620),
  ('SEED-PT-1', 'Seed Practice Test 1', 'reading_writing', 18, 22, 700),
  ('SEED-PT-1', 'Seed Practice Test 1', 'reading_writing', 12, 14, 520),
  ('SEED-PT-1', 'Seed Practice Test 1', 'math',            14, 16, 600),
  ('SEED-PT-1', 'Seed Practice Test 1', 'math',            18, 21, 720)
on conflict on constraint score_conversion_unique do nothing;

-- ============================================================
-- 7. SKILL LEARNABILITY — seed one row per skill the question bank
--    references. Varied values make the bar graph readable.
-- ============================================================

insert into public.skill_learnability (skill_code, learnability)
values
  ('FUN', 7),
  ('QUA', 5),
  ('LEQ', 8),
  ('TSP', 6),
  ('WIC', 9),
  ('CID', 4),
  ('INF', 3)
on conflict (skill_code) do update set learnability = excluded.learnability;

-- ============================================================
-- 8. TEACHER CODES — add 2 more so the admin codes page shows a mix
--    of used + available entries. Leave any existing codes in place.
-- ============================================================

insert into public.teacher_codes (id, code, used_by, used_at, created_at)
values
  ('dc000001-0000-0000-0000-000000000001', 'DEV-PREV-01', null, null, now() - interval '3 days'),
  ('dc000002-0000-0000-0000-000000000002', 'DEV-PREV-02', null, null, now() - interval '1 day')
on conflict (id) do nothing;

-- ============================================================
-- 9. BROKEN/FLAGGED QUESTIONS — flag one more question so the
--    admin content page shows a non-trivial list.
-- ============================================================

update public.questions_v2
set is_broken = true
where id = 'a0000007-0000-0000-0000-000000000007'
  and is_broken = false;
