-- Empty disposable PostgreSQL 17 database only; all fixture work rolls back.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated, anon;
create table public.attempts (
  id uuid primary key, user_id uuid, question_id uuid, source text,
  is_correct boolean, created_at timestamptz, response_json jsonb
);
create index on attempts(user_id, question_id);
create table public.questions_v2 (
  id uuid primary key, domain_code text, skill_code text,
  difficulty integer, score_band integer, visible boolean
);
grant select on all tables in schema public to authenticated, anon;
alter table attempts enable row level security;
alter table questions_v2 enable row level security;
create policy attempts_read on attempts for select to authenticated using (
  user_id = (select auth.uid()) or (
    (select auth.uid()) = '10000000-0000-0000-0000-000000000003' and
    user_id in (select md5('student' || g)::uuid from generate_series(1,20) g)
  )
);
create policy question_read on questions_v2 for select to authenticated using (visible);
\ir fixtures/roster-mastery-baseline.sql

-- A custom execute ACL proves CREATE OR REPLACE retains existing grants.
create function public.get_roster_skill_trend(uuid[], integer default 28, text default 'sat')
returns table (domain_code text, skill_code text, students integer,
  avg_mastery_now numeric, avg_mastery_then numeric, avg_delta numeric)
language sql stable set search_path='public' as $$
  select * from public.baseline_get_roster_skill_trend($1,$2,$3)
$$;
revoke all on function public.get_roster_skill_trend(uuid[],integer,text) from public, anon;
grant execute on function public.get_roster_skill_trend(uuid[],integer,text) to authenticated;
create temp table original_acl as select proacl from pg_proc
where oid='public.get_roster_skill_trend(uuid[],integer,text)'::regprocedure;
\ir ../../supabase/migrations/20261031143042_roster_mastery_batch.sql
do $$
begin
  assert (select proacl from pg_proc where oid='get_roster_skill_trend(uuid[],integer,text)'::regprocedure)
    is not distinct from (select proacl from original_acl), 'Execute grants changed';
  assert not (select prosecdef from pg_proc where oid='get_roster_skill_trend(uuid[],integer,text)'::regprocedure),
    'Roster summaries must retain caller RLS';
end;
$$;

insert into questions_v2
select md5('question' || q)::uuid,
  case when q%19=0 then null when q%2=0 then 'MATH' else 'RW' end,
  case when q%23=0 then null else 'SK' || (q%12) end,
  case when q%13=0 then null when q%11=0 then 9 else q%3+1 end,
  case when q%11=0 then null when q%17=0 then 9 else q%7+1 end,
  q%17<>0 from generate_series(1,120) q;
insert into attempts
select md5('first-' || s || '-' || q)::uuid, md5('student' || s)::uuid,
  md5('question' || q)::uuid, case when q%13=0 then 'assignment' else 'practice' end,
  case when q%11=0 then null else q%4<>0 end,
  (current_date-((q+s*7)%70))::timestamptz+(q%24)*interval '1 hour',
  jsonb_build_object('hints_used',case when q%7=0 then '' when q%3=0 then '2' else '0' end)
from generate_series(1,30) s cross join generate_series(1,120) q;
-- Later opposite-answer retries must never replace the first answer.
insert into attempts
select md5('retry-' || id)::uuid, user_id, question_id, source, not is_correct,
  created_at+interval '1 day', '{}' from attempts;
-- Conflicting first answers with an identical timestamp must use the
-- old helper's selection, not a new arbitrary global-sort tie order.
insert into attempts
select md5('tied-' || id)::uuid,user_id,question_id,source,not is_correct,
  created_at,jsonb_build_object('hints_used','2')
from attempts where id in (md5('first-1-1')::uuid,md5('first-1-3')::uuid);
-- A first answer in the future must not appear on either as-of side.
insert into questions_v2 values (md5('future')::uuid,'MATH','FUTURE',2,4,true);
insert into attempts values (md5('future-answer')::uuid,md5('student1')::uuid,
  md5('future')::uuid,'practice',true,current_date+interval '1 day','{}');
analyze attempts;
analyze questions_v2;

create function public.assert_roster_matches(roster uuid[], days integer, test_type text)
returns void language plpgsql security invoker as $$
declare differences integer;
begin
  with expected as materialized (select * from baseline_get_roster_skill_trend(roster,days,test_type)),
    actual as materialized (select * from get_roster_skill_trend(roster,days,test_type)),
    differences as (
      (select * from expected except all select * from actual)
      union all (select * from actual except all select * from expected)
    )
  select count(*) into differences from differences;
  assert differences=0, format('Roster results changed: days=%s, test type=%s',days,test_type);
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
do $$
declare roster uuid[]; days integer; test_type text;
begin
  select array_agg(md5('student' || g)::uuid) into roster from generate_series(1,30) g;
  foreach days in array array[-1,0,1,14,28,70,365,null] loop
    foreach test_type in array array['sat','act',null] loop
      perform assert_roster_matches(roster,days,test_type);
    end loop;
  end loop;
  perform assert_roster_matches(null,28,'sat');
  perform assert_roster_matches('{}',28,'sat');
  perform assert_roster_matches(array[md5('student1')::uuid,md5('student1')::uuid,
    md5('student2')::uuid,null,md5('student21')::uuid],28,'sat');
  assert not exists (select from get_roster_skill_trend(array[md5('student21')::uuid])),
    'Tutor saw an unrelated student';
  assert not exists (select from get_roster_skill_trend(array[md5('student1')::uuid]) where skill_code='FUTURE'),
    'Future first answer leaked into current mastery';
end;
$$;

-- Date casts intentionally follow the caller/session timezone, like the
-- original as-of helper. Check both sides of UTC day boundaries.
set local timezone='Pacific/Auckland';
select assert_roster_matches(array[md5('student1')::uuid,md5('student2')::uuid],28,'sat');
set local timezone='America/Los_Angeles';
select assert_roster_matches(array[md5('student1')::uuid,md5('student2')::uuid],1,'sat');
set local timezone='UTC';

-- Student claims can only contribute that student's rows, even when
-- a forged roster includes other students.
select set_config('request.jwt.claim.sub',md5('student1')::uuid::text,true);
select assert_roster_matches(array[md5('student1')::uuid,md5('student2')::uuid],28,'sat');
do $$ begin
  assert not exists (select from get_roster_skill_trend(array[md5('student2')::uuid])),
    'Student claims widened to another student';
end; $$;

-- No visible history: same empty result. Anonymous execution remains
-- forbidden by the pre-existing custom execute ACL.
select set_config('request.jwt.claim.sub',md5('no-history')::uuid::text,true);
select assert_roster_matches(array[md5('student1')::uuid],28,'sat');
reset role;
do $$ begin
  assert not has_function_privilege('anon','get_roster_skill_trend(uuid[],integer,text)','execute'),
    'Anonymous execute privilege changed';
end; $$;
rollback;
\echo 'Roster mastery parity passed (RLS, hints, retries, recency, dates and duplicate inputs).'
