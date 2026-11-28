-- Disposable CI database. Exercise the production function with caller RLS.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select current_setting('request.jwt.claim.sub')::uuid
$$;
grant usage on schema auth to authenticated;
create table public.lesson_progress (
  lesson_id uuid, student_id uuid, completed_blocks text[] not null default '{}',
  check_answers jsonb not null default '{}', primary key (lesson_id, student_id)
);
alter table public.lesson_progress enable row level security;
create policy own_work on public.lesson_progress to authenticated
  using (student_id = auth.uid()) with check (student_id = auth.uid());
grant select, insert, update on public.lesson_progress to authenticated;
\ir ../../supabase/migrations/20261128180000_record_lesson_step.sql
set local role authenticated;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000001';
do $$
declare
  lesson uuid := md5('lesson')::uuid;
  a uuid := md5('a')::uuid;
  b uuid := md5('b')::uuid;
  original jsonb := '{"selected":1,"correct":false}';
  updated jsonb := '{"selected":2,"correct":true}';
begin
  assert record_lesson_step(lesson, a, false, null, original);
  assert record_lesson_step(lesson, b, true);
  assert not record_lesson_step(lesson, a, true, null, updated), 'stale write accepted';
  assert record_lesson_step(lesson, a, true, original, updated);
  assert record_lesson_step(lesson, a, true);
  assert (select completed_blocks = array[b::text, a::text] and check_answers -> a::text = updated
    from lesson_progress where lesson_id = lesson);
  assert not has_function_privilege('anon', 'record_lesson_step(uuid,uuid,boolean,jsonb,jsonb)', 'execute');
end $$;
set local request.jwt.claim.sub = 'f0000000-0000-4000-8000-000000000002';
do $$ begin
  assert (select count(*) = 0 from lesson_progress);
  assert record_lesson_step(md5('lesson')::uuid, md5('b')::uuid, true);
  assert (select check_answers = '{}' and student_id = auth.uid() from lesson_progress);
end $$;
rollback;
