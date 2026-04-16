-- Dev-DB seed for verification of the v2 practice test schema,
-- the /tutor and /admin pages, and the practice-page filters.
--
-- NOT a production migration. Do not apply this to prod. Run via
-- the Supabase MCP execute_sql tool against the dev project only.
-- The script is idempotent (stable UUIDs + ON CONFLICT), so it's
-- safe to re-run after tweaking.

-- ============================================================
-- 0. Dev-DB GRANTS PARITY (production has these out-of-band).
--    A separate grants-drift migration would fix this permanently;
--    for now this section bootstraps the dev DB so the seed and
--    the app queries work. Safe to re-run.
-- ============================================================
grant select                         on public.profiles                    to authenticated;
grant select                         on public.teacher_student_assignments to authenticated;
grant select                         on public.manager_teacher_assignments to authenticated;
grant select                         on public.class_enrollments           to authenticated;
grant select                         on public.classes                    to authenticated;
grant select, insert, update, delete on public.attempts                   to authenticated;
grant select, insert, update, delete on public.question_status            to authenticated;
grant select                         on public.questions                  to authenticated;
grant select                         on public.practice_test_attempts     to authenticated;

-- ============================================================
-- 1. USERS (auth.users + profiles)
-- ============================================================

insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data,
  is_sso_user, is_anonymous
) values
  ('11111111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'admin@test.studyworks', 'x', now(), now(), now(),
   '{"role":"admin"}'::jsonb, '{}'::jsonb, false, false),
  ('22222222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'teacher@test.studyworks', 'x', now(), now(), now(),
   '{"role":"teacher"}'::jsonb, '{}'::jsonb, false, false),
  ('33333333-3333-3333-3333-333333333333', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'student1@test.studyworks', 'x', now(), now(), now(),
   '{"role":"student"}'::jsonb, '{}'::jsonb, false, false),
  ('44444444-4444-4444-4444-444444444444', '00000000-0000-0000-0000-000000000000',
   'authenticated', 'authenticated', 'student2@test.studyworks', 'x', now(), now(), now(),
   '{"role":"student"}'::jsonb, '{}'::jsonb, false, false)
on conflict (id) do nothing;

-- Profiles are auto-created by trigger when auth.users rows land.
-- Upsert to set the shape we want for tests.
insert into public.profiles (
  id, role, email, first_name, last_name,
  is_active, target_sat_score, high_school, graduation_year
) values
  ('11111111-1111-1111-1111-111111111111', 'admin',   'admin@test.studyworks',    'Test', 'Admin',   true, null, null, null),
  ('22222222-2222-2222-2222-222222222222', 'teacher', 'teacher@test.studyworks',  'Test', 'Teacher', true, null, null, null),
  ('33333333-3333-3333-3333-333333333333', 'student', 'student1@test.studyworks', 'Stu',  'One',     true, 1400, 'Test High', 2026),
  ('44444444-4444-4444-4444-444444444444', 'student', 'student2@test.studyworks', 'Stu',  'Two',     true, 1200, 'Test High', 2025)
on conflict (id) do update set
  role             = excluded.role,
  email            = excluded.email,
  first_name       = excluded.first_name,
  last_name        = excluded.last_name,
  is_active        = excluded.is_active,
  target_sat_score = excluded.target_sat_score,
  high_school      = excluded.high_school,
  graduation_year  = excluded.graduation_year;

-- Teacher gets student1 (not student2).
insert into public.teacher_student_assignments (teacher_id, student_id)
values ('22222222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333')
on conflict do nothing;

-- ============================================================
-- 2a. Questions (v1) SHIM ROWS.
--     The `attempts` table has a FK to public.questions(id). That FK
--     survived the v1→v2 question migration in the dev DB; production
--     may have dropped it out-of-band. To seed attempts in the dev DB
--     without also fixing that drift right now, we insert minimal v1
--     `questions` rows with the SAME UUIDs we use for questions_v2.
--     The app-layer reads the actual content from questions_v2; the
--     v1 row exists only as the FK target for attempts.
-- ============================================================

insert into public.questions (id) values
  ('a0000001-0000-0000-0000-000000000001'),
  ('a0000002-0000-0000-0000-000000000002'),
  ('a0000003-0000-0000-0000-000000000003'),
  ('a0000004-0000-0000-0000-000000000004'),
  ('a0000005-0000-0000-0000-000000000005'),
  ('a0000006-0000-0000-0000-000000000006'),
  ('a0000007-0000-0000-0000-000000000007'),
  ('a0000008-0000-0000-0000-000000000008')
on conflict (id) do nothing;

-- ============================================================
-- 2b. QUESTIONS v2 — eight across four domains, varied difficulty
--     and score band, one flagged broken for the content page.
-- ============================================================

insert into public.questions_v2 (
  id, question_type, stem_html, rationale_html, options, correct_answer,
  domain_code, domain_name, skill_code, skill_name,
  difficulty, score_band, source, is_published, is_broken
) values
  ('a0000001-0000-0000-0000-000000000001', 'mcq',
   'The passage describes the author''s trip to the museum. Which choice best captures the author''s purpose?',
   'The opening paragraph states the purpose explicitly.',
   '[{"id":"A","text":"To inform"},{"id":"B","text":"To persuade"},{"id":"C","text":"To entertain"},{"id":"D","text":"To narrate"}]'::jsonb,
   '"A"'::jsonb,
   'INI', 'Information and Ideas', 'CID', 'Central Ideas and Details',
   1, 1, 'custom', true, false),

  ('a0000002-0000-0000-0000-000000000002', 'mcq',
   'Based on the passage, which inference about the artist is best supported?',
   'Lines 8–12 describe the artist''s early influences.',
   '[{"id":"A","text":"Alpha claim"},{"id":"B","text":"Beta claim"},{"id":"C","text":"Gamma claim"},{"id":"D","text":"Delta claim"}]'::jsonb,
   '"C"'::jsonb,
   'INI', 'Information and Ideas', 'INF', 'Inferences',
   2, 2, 'custom', true, true),  -- flagged broken for content-page testing

  ('a0000003-0000-0000-0000-000000000003', 'mcq',
   'As used in line 5, the word "surveyed" most nearly means…',
   '"Surveyed" in context means "examined carefully."',
   '[{"id":"A","text":"measured"},{"id":"B","text":"examined"},{"id":"C","text":"polled"},{"id":"D","text":"glanced"}]'::jsonb,
   '"B"'::jsonb,
   'CAS', 'Craft and Structure', 'WIC', 'Words in Context',
   3, 3, 'custom', true, false),

  ('a0000004-0000-0000-0000-000000000004', 'mcq',
   'Which choice best describes the overall structure of the passage?',
   'The passage sets up a problem, then provides a resolution.',
   '[{"id":"A","text":"Chronological account"},{"id":"B","text":"Compare/contrast"},{"id":"C","text":"Cause and effect"},{"id":"D","text":"Problem/solution"}]'::jsonb,
   '"D"'::jsonb,
   'CAS', 'Craft and Structure', 'TSP', 'Text Structure and Purpose',
   2, 2, 'custom', true, false),

  ('a0000005-0000-0000-0000-000000000005', 'mcq',
   'If $2x + 5 = 11$, what is the value of $x$?',
   'Subtract 5 from both sides, divide by 2.',
   '[{"id":"A","text":"2"},{"id":"B","text":"3"},{"id":"C","text":"4"},{"id":"D","text":"6"}]'::jsonb,
   '"B"'::jsonb,
   'H', 'Algebra', 'LEQ', 'Linear equations in one variable',
   1, 1, 'custom', true, false),

  ('a0000006-0000-0000-0000-000000000006', 'spr',
   'What is the value of $y$ when $3y - 7 = 14$?',
   'Add 7, divide by 3.',
   null,
   '"7"'::jsonb,
   'H', 'Algebra', 'LEQ', 'Linear equations in one variable',
   3, 3, 'custom', true, false),

  ('a0000007-0000-0000-0000-000000000007', 'mcq',
   'If $f(x) = x^2 + 3x + 2$, what is $f(2)$?',
   'Substitute 2 and simplify.',
   '[{"id":"A","text":"6"},{"id":"B","text":"8"},{"id":"C","text":"10"},{"id":"D","text":"12"}]'::jsonb,
   '"D"'::jsonb,
   'P', 'Advanced Math', 'FUN', 'Functions',
   2, 2, 'custom', true, false),

  ('a0000008-0000-0000-0000-000000000008', 'mcq',
   'What are the solutions of $x^2 - 5x + 6 = 0$?',
   'Factor into (x-2)(x-3).',
   '[{"id":"A","text":"1, 6"},{"id":"B","text":"2, 3"},{"id":"C","text":"-2, -3"},{"id":"D","text":"0, 5"}]'::jsonb,
   '"B"'::jsonb,
   'P', 'Advanced Math', 'QUA', 'Quadratics',
   3, 3, 'custom', true, false)
on conflict (id) do nothing;

-- Bump attempt_count / correct_count on the questions the seed
-- will register attempts for — so the performance page's
-- hardest/easiest ranking has something non-trivial to show.
update public.questions_v2 set attempt_count = 10, correct_count = 3 where id = 'a0000001-0000-0000-0000-000000000001';
update public.questions_v2 set attempt_count = 15, correct_count = 11 where id = 'a0000003-0000-0000-0000-000000000003';
update public.questions_v2 set attempt_count = 12, correct_count = 4 where id = 'a0000005-0000-0000-0000-000000000005';
update public.questions_v2 set attempt_count = 8,  correct_count = 7 where id = 'a0000007-0000-0000-0000-000000000007';

-- question_taxonomy is intentionally NOT seeded: its question_id
-- column has a FK to the v1 questions table, not questions_v2.
-- All taxonomy fields (domain, skill, difficulty, score_band) live
-- inline on questions_v2 already — the single-table point of v2.
-- The new-tree filters should read from questions_v2 directly.

-- ============================================================
-- 3. ATTEMPTS — student1 has attempted 6 of 8 questions.
--    Mix of correct/incorrect, spread over the last 20 days so
--    the 30-day performance queries have data.
-- ============================================================

insert into public.attempts (id, user_id, question_id, is_correct, selected_option_id, response_text, time_spent_ms, source, created_at) values
  ('b0000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333', 'a0000001-0000-0000-0000-000000000001', true,  null, '"A"', 45000, 'practice', now() - interval '2 days'),
  ('b0000002-0000-0000-0000-000000000002', '33333333-3333-3333-3333-333333333333', 'a0000002-0000-0000-0000-000000000002', false, null, '"A"', 90000, 'practice', now() - interval '5 days'),
  ('b0000003-0000-0000-0000-000000000003', '33333333-3333-3333-3333-333333333333', 'a0000003-0000-0000-0000-000000000003', true,  null, '"B"', 60000, 'practice', now() - interval '7 days'),
  ('b0000004-0000-0000-0000-000000000004', '33333333-3333-3333-3333-333333333333', 'a0000005-0000-0000-0000-000000000005', false, null, '"A"', 30000, 'practice', now() - interval '10 days'),
  ('b0000005-0000-0000-0000-000000000005', '33333333-3333-3333-3333-333333333333', 'a0000006-0000-0000-0000-000000000006', true,  null, '"7"', 75000, 'practice', now() - interval '14 days'),
  ('b0000006-0000-0000-0000-000000000006', '33333333-3333-3333-3333-333333333333', 'a0000007-0000-0000-0000-000000000007', false, null, '"C"', 55000, 'practice', now() - interval '18 days')
on conflict (id) do nothing;

-- question_status rows mirror the attempts — needed for any
-- dashboard/filter logic that reads question_status (unanswered
-- filter, last_is_correct, etc.).
insert into public.question_status (user_id, question_id, is_done, attempts_count, correct_attempts_count, last_attempt_at, last_is_correct) values
  ('33333333-3333-3333-3333-333333333333', 'a0000001-0000-0000-0000-000000000001', true, 1, 1, now() - interval '2 days',  true),
  ('33333333-3333-3333-3333-333333333333', 'a0000002-0000-0000-0000-000000000002', true, 1, 0, now() - interval '5 days',  false),
  ('33333333-3333-3333-3333-333333333333', 'a0000003-0000-0000-0000-000000000003', true, 1, 1, now() - interval '7 days',  true),
  ('33333333-3333-3333-3333-333333333333', 'a0000005-0000-0000-0000-000000000005', true, 1, 0, now() - interval '10 days', false),
  ('33333333-3333-3333-3333-333333333333', 'a0000006-0000-0000-0000-000000000006', true, 1, 1, now() - interval '14 days', true),
  ('33333333-3333-3333-3333-333333333333', 'a0000007-0000-0000-0000-000000000007', true, 1, 0, now() - interval '18 days', false)
on conflict (user_id, question_id) do nothing;

-- ============================================================
-- 4. PRACTICE TEST v2 — one adaptive test, four modules, items
--    drawn from the eight seeded questions.
-- ============================================================

insert into public.practice_tests_v2 (
  id, code, name, is_published, is_adaptive, is_frozen,
  rw_route_threshold, math_route_threshold
) values
  ('c0000001-0000-0000-0000-000000000001', 'SEED-PT-1', 'Seed Practice Test 1',
   true, true, false, 3, 2)  -- "correct >= 3" on RW M1 → hard; "correct >= 2" on Math M1 → hard
on conflict (id) do nothing;

insert into public.practice_test_modules_v2 (
  id, practice_test_id, subject_code, module_number, route_code, time_limit_seconds
) values
  ('c1000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'RW',   1, 'std',  1920),
  ('c1000002-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001', 'RW',   2, 'hard', 1920),
  ('c1000003-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000001', 'MATH', 1, 'std',  2100),
  ('c1000004-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000001', 'MATH', 2, 'hard', 2100)
on conflict (id) do nothing;

-- Module items. RW M1 has the two easy-ish RW questions; RW M2
-- hard has the harder two. Math M1 has the easy Algebra + easy
-- Adv Math; Math M2 hard has the harder ones.
insert into public.practice_test_module_items_v2 (
  id, practice_test_module_id, question_id, ordinal
) values
  -- RW M1
  ('c2000001-0000-0000-0000-000000000001', 'c1000001-0000-0000-0000-000000000001', 'a0000001-0000-0000-0000-000000000001', 0),
  ('c2000002-0000-0000-0000-000000000002', 'c1000001-0000-0000-0000-000000000001', 'a0000004-0000-0000-0000-000000000004', 1),
  -- RW M2 hard
  ('c2000003-0000-0000-0000-000000000003', 'c1000002-0000-0000-0000-000000000002', 'a0000002-0000-0000-0000-000000000002', 0),
  ('c2000004-0000-0000-0000-000000000004', 'c1000002-0000-0000-0000-000000000002', 'a0000003-0000-0000-0000-000000000003', 1),
  -- Math M1
  ('c2000005-0000-0000-0000-000000000005', 'c1000003-0000-0000-0000-000000000003', 'a0000005-0000-0000-0000-000000000005', 0),
  ('c2000006-0000-0000-0000-000000000006', 'c1000003-0000-0000-0000-000000000003', 'a0000007-0000-0000-0000-000000000007', 1),
  -- Math M2 hard
  ('c2000007-0000-0000-0000-000000000007', 'c1000004-0000-0000-0000-000000000004', 'a0000006-0000-0000-0000-000000000006', 0),
  ('c2000008-0000-0000-0000-000000000008', 'c1000004-0000-0000-0000-000000000004', 'a0000008-0000-0000-0000-000000000008', 1)
on conflict (id) do nothing;

-- A single practice_test_attempt_v2 by student1, in progress, just
-- enough to verify the attempt tables and RLS work end-to-end.
insert into public.practice_test_attempts_v2 (
  id, user_id, practice_test_id, started_at, status, source
) values
  ('c3000001-0000-0000-0000-000000000001', '33333333-3333-3333-3333-333333333333',
   'c0000001-0000-0000-0000-000000000001', now() - interval '1 day', 'in_progress', 'app')
on conflict (id) do nothing;
