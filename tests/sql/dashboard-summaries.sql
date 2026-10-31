-- Run only against an empty disposable PostgreSQL 17 database:
-- psql -v ON_ERROR_STOP=1 -f tests/sql/dashboard-summaries.sql
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated;

create table public.attempts (
  id uuid primary key, user_id uuid, question_id uuid,
  is_correct boolean, created_at timestamptz
);
create table public.act_attempts (like public.attempts including all);
create table public.act_questions (
  id uuid primary key, section text, category text, category_code text,
  visible boolean default true
);
create table public.practice_sessions (
  id uuid primary key, user_id uuid, test_type text, created_at timestamptz,
  question_ids jsonb, filter_criteria jsonb default '{}',
  status text default 'completed', mode text default 'practice'
);
create table public.assignments_v2 (
  id uuid primary key, assignment_type text, question_ids uuid[],
  archived_at timestamptz, deleted_at timestamptz
);
create table public.assignment_students_v2 (
  assignment_id uuid, student_id uuid, completed_at timestamptz
);
create index on attempts(user_id, question_id);
create index on act_attempts(user_id, question_id);
grant select on all tables in schema public to authenticated;
alter table public.attempts enable row level security;
alter table public.act_attempts enable row level security;
alter table public.act_questions enable row level security;
alter table public.practice_sessions enable row level security;
alter table public.assignments_v2 enable row level security;
alter table public.assignment_students_v2 enable row level security;

-- Tutor ...003 may see student ...001, but never unrelated ...002.
create policy attempts_read on public.attempts for select to authenticated using (
  user_id = (select auth.uid()) or
  ((select auth.uid()) = '10000000-0000-0000-0000-000000000003' and
   user_id = '10000000-0000-0000-0000-000000000001')
);
create policy act_attempts_read on public.act_attempts for select to authenticated using (
  user_id = (select auth.uid()) or
  ((select auth.uid()) = '10000000-0000-0000-0000-000000000003' and
   user_id = '10000000-0000-0000-0000-000000000001')
);
create policy question_read on public.act_questions for select to authenticated using (visible);
create policy session_read on public.practice_sessions for select to authenticated
  using (user_id = (select auth.uid()));
create policy enrollment_read on public.assignment_students_v2 for select to authenticated
  using (student_id = (select auth.uid()));
create policy assignment_read on public.assignments_v2 for select to authenticated using (
  exists (select 1 from public.assignment_students_v2 e
    where e.assignment_id = assignments_v2.id and e.student_id = (select auth.uid()))
);

\ir ../../supabase/migrations/20261031131201_dashboard_summaries.sql

insert into act_questions(id, section, category, category_code, visible) values
  ('20000000-0000-0000-0000-000000000001', 'english', 'Grammar', 'G', true),
  ('20000000-0000-0000-0000-000000000002', 'math', 'Algebra', 'A', true),
  ('20000000-0000-0000-0000-000000000003', 'reading', 'Hidden', 'H', false),
  ('20000000-0000-0000-0000-000000000004', null, null, null, true);
insert into act_attempts values
  (md5('a1')::uuid, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', false, '2026-10-29'),
  (md5('a2')::uuid, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', true, '2026-10-30'),
  (md5('a3')::uuid, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', false, '2026-06-01'),
  (md5('a4')::uuid, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', true, '2026-10-29'),
  (md5('a5')::uuid, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', true, '2026-10-29'),
  (md5('a6')::uuid, '10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000004', null, '2026-10-29'),
  (md5('a7')::uuid, '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', true, '2026-10-29');

-- More distinct questions than the REST max-rows default. All must count.
insert into act_questions(id, section, category, category_code)
select md5('bank' || g)::uuid, 'math', 'Algebra', 'A' from generate_series(1, 1201) g;
insert into act_attempts
select md5('bank-attempt' || g)::uuid, '10000000-0000-0000-0000-000000000001',
  md5('bank' || g)::uuid, true, '2026-10-30'::timestamptz
from generate_series(1, 1201) g;

insert into practice_sessions(id, user_id, test_type, created_at, question_ids) values
  ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'sat', '2026-10-20',
   '["40000000-0000-0000-0000-000000000001","40000000-0000-0000-0000-000000000002","40000000-0000-0000-0000-000000000003","40000000-0000-0000-0000-000000000001"]'),
  ('30000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'act', '2026-10-28',
   '["20000000-0000-0000-0000-000000000001"]'),
  ('30000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'sat', '2026-10-20', '[]'),
  ('30000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000002', 'sat', '2026-10-20',
   '["40000000-0000-0000-0000-000000000001"]');
insert into attempts values
  (md5('s1')::uuid, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', true, '2026-10-10'),
  (md5('s2')::uuid, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', false, '2026-10-21'),
  (md5('s3')::uuid, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', true, '2026-10-22'),
  (md5('s4')::uuid, '10000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000002', null, '2026-10-23'),
  (md5('s5')::uuid, '10000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000002', true, '2026-10-24');
-- These unrelated recent answers pushed a session's real answers out of
-- the old 2,000-row slice. They must not make its accuracy disappear.
insert into attempts
select md5('noise' || g)::uuid, '10000000-0000-0000-0000-000000000001',
  md5('noise-question')::uuid, true, '2026-10-31'::timestamptz
from generate_series(1, 2501) g;

insert into assignments_v2 values
  ('50000000-0000-0000-0000-000000000001', 'questions',
   '{40000000-0000-0000-0000-000000000001,40000000-0000-0000-0000-000000000002}', null, null),
  ('50000000-0000-0000-0000-000000000002', 'lesson_pack',
   '{40000000-0000-0000-0000-000000000001}', null, '2026-10-30'),
  ('50000000-0000-0000-0000-000000000003', 'questions',
   '{40000000-0000-0000-0000-000000000001}', null, null);
insert into assignment_students_v2 values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '2026-10-25'),
  ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', '2026-10-25'),
  ('50000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', null);

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$
declare r record; e jsonb;
begin
  select * into strict r from get_act_student_dashboard_stats(
    '10000000-0000-0000-0000-000000000001', '2026-10-24', '2026-08-02');
  assert r.total_attempts = 1207 and r.correct_attempts = 1204 and r.week_attempts = 1206,
    'ACT lifetime/week totals or row-limit handling changed';
  assert jsonb_array_length(r.per_section) = 3, 'Question RLS or unknown section bucket lost';
  e := r.per_section->0;
  assert e->>'section' = 'english' and (e->>'correct')::int = 0 and (e->>'total')::int = 1,
    'ACT categories must count first answers rather than retries';
  e := r.per_section->1;
  assert e->>'section' = 'math' and (e->>'correct')::int = 1202 and (e->>'total')::int = 1202,
    'ACT lookback must ignore older answers and include questions beyond max-rows';
  assert r.per_section->2->>'section' = 'unknown', 'Unknown sections must sort last';
  assert r.per_section->2->'categories'->0->>'name' = 'Other', 'Null category fallback changed';
  select * into strict r from get_dashboard_recent_accuracy(
    '10000000-0000-0000-0000-000000000001',
    '{30000000-0000-0000-0000-000000000001}', '{}');
  assert r.kind = 'session' and r.attempted = 2 and r.correct = 1,
    'SAT latest-answer/null-answer/dedup/history-cap accuracy changed';
  select * into strict r from get_dashboard_recent_accuracy(
    '10000000-0000-0000-0000-000000000001',
    '{30000000-0000-0000-0000-000000000002}', '{}');
  assert r.kind = 'act_session' and r.attempted = 1 and r.correct = 1,
    'ACT session cards must keep latest-answer semantics';
  select * into strict r from get_dashboard_recent_accuracy(
    '10000000-0000-0000-0000-000000000001', '{}',
    '{50000000-0000-0000-0000-000000000001,50000000-0000-0000-0000-000000000002,50000000-0000-0000-0000-000000000003}');
  assert r.kind = 'assignment' and r.attempted = 2 and r.correct = 1,
    'Assignment metrics or completed/deleted filtering changed';
  assert not exists (select from get_dashboard_recent_accuracy(
    '10000000-0000-0000-0000-000000000001',
    '{30000000-0000-0000-0000-000000000003,30000000-0000-0000-0000-000000000004}', '{}')),
    'Empty or foreign sessions must not return metrics';
  assert not exists (select from get_dashboard_recent_accuracy(
    '10000000-0000-0000-0000-000000000002',
    '{30000000-0000-0000-0000-000000000004}', '{}')),
    'Forged student id must not reveal another student session';
  assert not exists (select from get_dashboard_recent_accuracy(
    '10000000-0000-0000-0000-000000000001', '{}', '{}')), 'Empty inputs must be cheap/empty';
  begin
    perform * from get_dashboard_recent_accuracy('10000000-0000-0000-0000-000000000001',
      array_fill('30000000-0000-0000-0000-000000000001'::uuid, array[21]), '{}');
    raise exception 'Oversized request accepted';
  exception when invalid_parameter_value then null;
  end;
end;
$$;

-- Tutor can still use ACT stats for an assigned student through RLS.
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$
declare r record;
begin
  select * into strict r from get_act_student_dashboard_stats(
    '10000000-0000-0000-0000-000000000001', '2026-10-24', '2026-08-02');
  assert r.total_attempts = 1207, 'Authorized tutor lost student stats';
  select * into strict r from get_act_student_dashboard_stats(
    '10000000-0000-0000-0000-000000000002', '2026-10-24', '2026-08-02');
  assert r.total_attempts = 0 and r.per_section = '[]', 'Tutor gained unrelated student stats';
end;
$$;

select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000004', true);
do $$
declare r record;
begin
  select * into strict r from get_act_student_dashboard_stats(
    '10000000-0000-0000-0000-000000000001', '2026-10-24', '2026-08-02');
  assert r.total_attempts = 0 and r.per_section = '[]', 'Cross-user stats leaked';
end;
$$;
reset role;
do $$
begin
  assert not has_function_privilege('anon', 'get_act_student_dashboard_stats(uuid,timestamptz,timestamptz)', 'execute'),
    'Anonymous callers must not execute ACT stats';
  assert not has_function_privilege('anon', 'get_dashboard_recent_accuracy(uuid,uuid[],uuid[])', 'execute'),
    'Anonymous callers must not execute accuracy';
  assert not exists (select from pg_proc where proname in
    ('get_act_student_dashboard_stats', 'get_dashboard_recent_accuracy') and prosecdef),
    'Dashboard summaries must never bypass caller RLS';
end;
$$;
rollback;
\echo 'Dashboard summary SQL regressions passed (large histories, retries, RLS and bounds).'
