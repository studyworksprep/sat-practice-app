-- =========================================================
-- Demo accounts: two seeded users for the marketing surface
-- =========================================================
-- Creates the two `is_demo` accounts the marketing pages drive
-- screenshots and live-tour CTAs against. Six dependent student
-- profiles (the tutor's roster) are created alongside the
-- manager so the manager's dashboards have realistic data to
-- aggregate.
--
-- Fixed UUIDs (the d3m0… suffix is a sentinel so they're
-- recognisable in queries and logs). ON CONFLICT DO NOTHING
-- keeps the migration safely idempotent across re-runs.
--
-- The encrypted_password column is required by auth.users, so
-- we set a long random value that nobody ever needs to know:
-- demo sessions are minted by the `/auth/demo/[persona]` route
-- via service-role magic-link tokens, never by password sign-
-- in. The plaintext is never reachable from this migration.
--
-- email_confirmed_at is back-set to created_at so the demo
-- users don't get a confirmation email and don't show as
-- pending in the Supabase auth dashboard.
-- =========================================================

-- pgcrypto is enabled in every Supabase project by default, but
-- guarding for non-Supabase clones doesn't hurt.
create extension if not exists pgcrypto;

-- ---- 1) Auth users -------------------------------------------

insert into auth.users (
  instance_id, id, aud, role, email,
  encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at,
  confirmation_token, recovery_token,
  email_change_token_new, email_change
)
values
  -- Demo student. Single high-activity profile: ~250 attempts,
  -- a couple of finished practice tests, populated error log.
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30001',
    'authenticated', 'authenticated',
    'demo.student@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Avery","last_name":"Park"}'::jsonb,
    now(), now(),
    '', '', '', ''
  ),
  -- Demo manager. Oversees six demo students (created below).
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30002',
    'authenticated', 'authenticated',
    'demo.tutor@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Morgan","last_name":"Reyes"}'::jsonb,
    now(), now(),
    '', '', '', ''
  ),
  -- Six demo students on the manager's roster. These accounts
  -- never log in (no auto-login route exposes them) but their
  -- attempts / sessions feed every roster + cohort screen the
  -- manager sees. Each name is clearly fictional.
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30101',
    'authenticated', 'authenticated',
    'demo.s01@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Imani","last_name":"Bellweather"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30102',
    'authenticated', 'authenticated',
    'demo.s02@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Noah","last_name":"Castellanos"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30103',
    'authenticated', 'authenticated',
    'demo.s03@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Priya","last_name":"Okafor"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30104',
    'authenticated', 'authenticated',
    'demo.s04@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Theo","last_name":"Hartwell"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30105',
    'authenticated', 'authenticated',
    'demo.s05@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Linnea","last_name":"Vance"}'::jsonb,
    now(), now(), '', '', '', ''
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '00000000-0000-0000-0000-000000d30106',
    'authenticated', 'authenticated',
    'demo.s06@studyworks.demo',
    crypt(gen_random_uuid()::text, gen_salt('bf')),
    now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    '{"first_name":"Joaquin","last_name":"Mercer"}'::jsonb,
    now(), now(), '', '', '', ''
  )
on conflict (id) do nothing;

-- Backfill auth.identities so Supabase's row-counter and email
-- lookup features behave normally for these accounts. The
-- provider_id is the same uuid as the user id, which mirrors
-- what the normal email-signup path writes.
insert into auth.identities (
  id, user_id, provider_id, provider, identity_data,
  last_sign_in_at, created_at, updated_at
)
select
  u.id,
  u.id,
  u.id::text,
  'email',
  jsonb_build_object('sub', u.id::text, 'email', u.email),
  now(), now(), now()
from auth.users u
where u.id in (
  '00000000-0000-0000-0000-000000d30001',
  '00000000-0000-0000-0000-000000d30002',
  '00000000-0000-0000-0000-000000d30101',
  '00000000-0000-0000-0000-000000d30102',
  '00000000-0000-0000-0000-000000d30103',
  '00000000-0000-0000-0000-000000d30104',
  '00000000-0000-0000-0000-000000d30105',
  '00000000-0000-0000-0000-000000d30106'
)
on conflict (provider, provider_id) do nothing;

-- ---- 2) Profiles --------------------------------------------
-- Each demo profile carries is_demo=true; subscription_exempt=true
-- so the proxy's subscription gate doesn't redirect them; and
-- ui_version='next' so they land in the new tree (which is the
-- design language we want screenshotted).

insert into public.profiles (
  id, email, role, is_demo, subscription_exempt, ui_version,
  first_name, last_name, target_sat_score, graduation_year, high_school
)
values
  (
    '00000000-0000-0000-0000-000000d30001',
    'demo.student@studyworks.demo',
    'student', true, true, 'next',
    'Avery', 'Park', 1450, 2027, 'Lincoln Prep High School'
  ),
  (
    '00000000-0000-0000-0000-000000d30002',
    'demo.tutor@studyworks.demo',
    'manager', true, true, 'next',
    'Morgan', 'Reyes', null, null, null
  ),
  (
    '00000000-0000-0000-0000-000000d30101',
    'demo.s01@studyworks.demo',
    'student', true, true, 'next',
    'Imani', 'Bellweather', 1500, 2027, 'Lincoln Prep High School'
  ),
  (
    '00000000-0000-0000-0000-000000d30102',
    'demo.s02@studyworks.demo',
    'student', true, true, 'next',
    'Noah', 'Castellanos', 1400, 2027, 'Roosevelt Academy'
  ),
  (
    '00000000-0000-0000-0000-000000d30103',
    'demo.s03@studyworks.demo',
    'student', true, true, 'next',
    'Priya', 'Okafor', 1480, 2026, 'Roosevelt Academy'
  ),
  (
    '00000000-0000-0000-0000-000000d30104',
    'demo.s04@studyworks.demo',
    'student', true, true, 'next',
    'Theo', 'Hartwell', 1380, 2027, 'Westview Day School'
  ),
  (
    '00000000-0000-0000-0000-000000d30105',
    'demo.s05@studyworks.demo',
    'student', true, true, 'next',
    'Linnea', 'Vance', 1520, 2026, 'Westview Day School'
  ),
  (
    '00000000-0000-0000-0000-000000d30106',
    'demo.s06@studyworks.demo',
    'student', true, true, 'next',
    'Joaquin', 'Mercer', 1420, 2027, 'Lincoln Prep High School'
  )
on conflict (id) do nothing;

-- ---- 3) Roster wiring --------------------------------------
-- Manager visibility resolves through two joins:
--   manager_teacher_assignments  → teacher_student_assignments
-- so we need both rows in place. The simplest realistic shape:
-- the demo manager is its own teacher of record. Tutoring-firm
-- owners often coach actively as well as supervise, so this
-- matches a real data pattern.
--
-- Schema references:
--   20230101000002_add_teacher_student_assignments.sql
--   20230101000003_create_manager_teacher_assignments.sql

insert into public.manager_teacher_assignments (manager_id, teacher_id)
values (
  '00000000-0000-0000-0000-000000d30002'::uuid,
  '00000000-0000-0000-0000-000000d30002'::uuid
)
on conflict do nothing;

insert into public.teacher_student_assignments (teacher_id, student_id)
select
  '00000000-0000-0000-0000-000000d30002'::uuid,
  s.id
from (values
  ('00000000-0000-0000-0000-000000d30101'::uuid),
  ('00000000-0000-0000-0000-000000d30102'::uuid),
  ('00000000-0000-0000-0000-000000d30103'::uuid),
  ('00000000-0000-0000-0000-000000d30104'::uuid),
  ('00000000-0000-0000-0000-000000d30105'::uuid),
  ('00000000-0000-0000-0000-000000d30106'::uuid)
) as s(id)
on conflict do nothing;
