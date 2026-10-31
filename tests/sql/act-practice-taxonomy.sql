-- Empty disposable PostgreSQL 17 database only; all fixture work rolls back.
\set ON_ERROR_STOP on
begin;
create role anon;
create role authenticated;
create role service_role;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated, anon;
-- Emulate broad hosted defaults to prove the migration narrows view access.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
create table public.act_questions (
  id integer generated always as identity primary key,
  section text, category text, subcategory text,
  is_broken boolean default false, deleted_at timestamptz,
  audience uuid
);
alter table act_questions enable row level security;
create policy question_read on act_questions for select to authenticated using (
  audience is null or audience = (select auth.uid())
);

insert into act_questions(section,category,subcategory)
select 'math','Algebra','Equations' from generate_series(1,1507);
insert into act_questions(section,category,subcategory,is_broken,deleted_at,audience) values
  ('english','Grammar','Usage',false,null,null),
  ('math','Algebra',null,false,null,null),
  ('reading','',null,false,null,null),
  ('science',null,null,false,null,null),
  ('math',' ',' ',false,null,null),
  ('unknown','Other','Other',false,null,null),
  (null,null,null,false,null,null),
  ('math','Algebra','Equations',true,null,null),
  ('math','Algebra','Equations',false,now(),null),
  ('math','Algebra','Equations',null,null,null),
  ('math','Private A','Private',false,null,'10000000-0000-0000-0000-000000000001'),
  ('math','Private B','Private',false,null,'10000000-0000-0000-0000-000000000002');

\ir ../../supabase/migrations/20261031165829_act_practice_taxonomy.sql

do $$ begin
  assert (select reloptions @> array['security_invoker=true'] from pg_class
    where oid='act_practice_taxonomy'::regclass), 'View must apply caller RLS';
  assert has_table_privilege('authenticated','act_practice_taxonomy','select'), 'Missing signed-in read';
  assert not has_table_privilege('anon','act_practice_taxonomy','select'), 'Anonymous view access';
  assert not has_table_privilege('service_role','act_practice_taxonomy','select'), 'Inherited service-role grant';
  assert not has_table_privilege('authenticated','act_practice_taxonomy','insert,update,delete'),
    'Signed-in view must be read only';
end; $$;

create function public.assert_taxonomy_matches() returns void language plpgsql security invoker as $$
declare differences integer;
begin
  with expected as (
    select section,category,subcategory,count(*)::bigint as question_count
    from act_questions where is_broken=false and deleted_at is null
    group by section,category,subcategory
  ), differences as (
    (select * from expected except all select * from act_practice_taxonomy)
    union all (select * from act_practice_taxonomy except all select * from expected)
  )
  select count(*) into differences from differences;
  assert differences=0, 'Summary differs from visible question counts';
end; $$;

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
select assert_taxonomy_matches();
do $$ begin
  assert (select question_count from act_practice_taxonomy where section='math'
    and category='Algebra' and subcategory='Equations')=1507, 'Large group truncated or hidden question counted';
  assert exists (select from act_practice_taxonomy where category='Private A'), 'Own group missing';
  assert not exists (select from act_practice_taxonomy where category='Private B'), 'Other user leaked through view';
  assert (select sum(question_count) from act_practice_taxonomy)=1515, 'Parent totals changed';
end; $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
select assert_taxonomy_matches();
do $$ begin
  assert exists (select from act_practice_taxonomy where category='Private B'), 'Second user group missing';
  assert not exists (select from act_practice_taxonomy where category='Private A'), 'First user leaked';
end; $$;

select set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
select assert_taxonomy_matches();
do $$ begin
  assert not exists (select from act_practice_taxonomy where category like 'Private%'), 'Unrelated group leaked';
end; $$;
reset role;
set local role anon;
do $$ begin
  begin
    perform * from act_practice_taxonomy;
    raise exception 'Anonymous query unexpectedly succeeded';
  exception when insufficient_privilege then null;
  end;
end; $$;
reset role;

-- A normal view reflects imports and retirements immediately, without cache invalidation.
update act_questions set deleted_at=now() where category='Algebra';
set local role authenticated;
select assert_taxonomy_matches();
do $$ begin
  assert not exists (select from act_practice_taxonomy where category='Algebra'), 'Retirement count is stale';
end; $$;
reset role;
rollback;
\echo 'ACT taxonomy passed (large counts, visibility, caller RLS, grants and live updates).'
