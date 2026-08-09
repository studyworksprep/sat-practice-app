-- Dev-only: build tutor-facing assignments + attempts over the question
-- content imported by scripts/seed-dev-from-prod.mjs, so the report and
-- presenter surfaces have something real to render locally.
--
-- RUN THIS AGAINST studyworks-dev ONLY (ikzhizgsawzjpuuznfid), and only
-- after the import script has run. The safety guard below aborts before
-- any delete or insert if the curated question set is unavailable.
--
-- No production data is involved. Every person referenced here is one of
-- dev's own synthetic users (Test Teacher, Stu One/Two/Three, all on
-- @test.studyworks). Attempts are generated, not copied: real students'
-- answer histories never leave prod.
--
-- Re-runnable: the three assignments use fixed ids and are deleted and
-- rebuilt on each run, so it converges instead of accumulating.
-- The transaction aborts unless the exact synthetic dev identities and
-- enough imported questions are present. This is the script's dev-only
-- safety guard; do not weaken it to make the script run elsewhere.

begin;

-- Refuse to touch assignment data unless this is the known synthetic-dev
-- roster. Production must never contain this exact identity set.
do $$
begin
  if exists (
    select expected.id, expected.email, expected.role
    from (values
      ('22222222-2222-2222-2222-222222222222'::uuid, 'teacher@test.studyworks', 'teacher'),
      ('33333333-3333-3333-3333-333333333333'::uuid, 'student1@test.studyworks', 'student'),
      ('44444444-4444-4444-4444-444444444444'::uuid, 'student2@test.studyworks', 'student'),
      ('55555555-5555-5555-5555-555555555555'::uuid, 'student3@test.studyworks', 'student')
    ) as expected(id, email, role)
    except
    select u.id, u.email, p.role
    from auth.users u
    join public.profiles p on p.id = u.id
  ) then
    raise exception 'Dev seed guard failed: expected synthetic users are missing or do not match';
  end if;

  if (select count(*) from public.questions_v2
      where is_published and not coalesce(is_broken,false) and deleted_at is null) < 16
     or (select count(*) from public.questions_v2
         where is_published and not coalesce(is_broken,false) and deleted_at is null
           and domain_name in ('Algebra','Advanced Math','Geometry and Trigonometry',
                               'Problem-Solving and Data Analysis')) < 12
     or (select count(*) from public.questions_v2
         where is_published and not coalesce(is_broken,false) and deleted_at is null
           and domain_name in ('Craft and Structure','Information and Ideas',
                               'Expression of Ideas','Standard English Conventions')) < 12 then
    raise exception 'Dev seed guard failed: import the curated question set before assignments';
  end if;
end
$$;

-- Fixed ids so re-runs replace rather than pile up.
-- a11...=math, a22...=reading/writing, a33...=mixed
delete from public.attempts
  where context_type = 'assignment'
    and context_id in ('a1111111-0000-4000-8000-000000000001'::uuid,
                       'a2222222-0000-4000-8000-000000000002'::uuid,
                       'a3333333-0000-4000-8000-000000000003'::uuid);
delete from public.assignment_students_v2
  where assignment_id in ('a1111111-0000-4000-8000-000000000001'::uuid,
                          'a2222222-0000-4000-8000-000000000002'::uuid,
                          'a3333333-0000-4000-8000-000000000003'::uuid);
delete from public.assignments_v2
  where id in ('a1111111-0000-4000-8000-000000000001'::uuid,
               'a2222222-0000-4000-8000-000000000002'::uuid,
               'a3333333-0000-4000-8000-000000000003'::uuid);

-- ── Assignments ─────────────────────────────────────────────────────
-- Math first: those carry the TeX that makes presenter worth looking at.
with picks as (
  select
    (select array_agg(id order by id) from (
       select id from public.questions_v2
       where is_published and not coalesce(is_broken,false) and deleted_at is null
         and domain_name in ('Algebra','Advanced Math','Geometry and Trigonometry',
                             'Problem-Solving and Data Analysis')
       order by id limit 12) m) as math_ids,
    (select array_agg(id order by id) from (
       select id from public.questions_v2
       where is_published and not coalesce(is_broken,false) and deleted_at is null
         and domain_name in ('Craft and Structure','Information and Ideas',
                             'Expression of Ideas','Standard English Conventions')
       order by id limit 12) r) as rw_ids,
    (select array_agg(id order by id) from (
       select id from public.questions_v2
       where is_published and not coalesce(is_broken,false) and deleted_at is null
       order by id limit 16) x) as mixed_ids
)
insert into public.assignments_v2
  (id, teacher_id, assignment_type, title, description, due_date,
   question_ids, test_type, created_by)
select * from (
  select 'a1111111-0000-4000-8000-000000000001'::uuid,
         '22222222-2222-2222-2222-222222222222'::uuid, 'questions',
         'Math: functions, circles and percentages',
         'Seeded from real bank content for local UI work.',
         current_date + 7, math_ids, 'sat',
         '22222222-2222-2222-2222-222222222222'::uuid from picks
  union all
  select 'a2222222-0000-4000-8000-000000000002'::uuid,
         '22222222-2222-2222-2222-222222222222'::uuid, 'questions',
         'Reading and Writing: structure, inference, conventions',
         'Seeded from real bank content for local UI work.',
         current_date + 10, rw_ids, 'sat',
         '22222222-2222-2222-2222-222222222222'::uuid from picks
  union all
  select 'a3333333-0000-4000-8000-000000000003'::uuid,
         '22222222-2222-2222-2222-222222222222'::uuid, 'questions',
         'Mixed review — full taxonomy sweep',
         'Seeded from real bank content for local UI work.',
         current_date + 14, mixed_ids, 'sat',
         '22222222-2222-2222-2222-222222222222'::uuid from picks
) s;

-- ── Roster: three synthetic students per assignment ──────────────────
insert into public.assignment_students_v2 (assignment_id, student_id, test_type, completed_at)
select a.id, s.student_id, 'sat',
       -- Stu One has finished; Two and Three are still in progress, so
       -- the report shows both states.
       case when s.student_id = '33333333-3333-3333-3333-333333333333'::uuid
            then now() - interval '2 days' else null end
from public.assignments_v2 a
cross join (values
  ('33333333-3333-3333-3333-333333333333'::uuid),
  ('44444444-4444-4444-4444-444444444444'::uuid),
  ('55555555-5555-5555-5555-555555555555'::uuid)
) as s(student_id)
where a.id in ('a1111111-0000-4000-8000-000000000001'::uuid,
               'a2222222-0000-4000-8000-000000000002'::uuid,
               'a3333333-0000-4000-8000-000000000003'::uuid);

-- ── Attempts ────────────────────────────────────────────────────────
-- Deterministic but uneven: accuracy varies by student and the harder
-- score bands miss more often, so the report's by-domain and by-band
-- breakdowns show contrast rather than a flat line. Stu Three answers
-- only the first two thirds, leaving a partially-worked report.
insert into public.attempts
  (user_id, question_id, is_correct, response_text, time_spent_ms,
   created_at, source, context_type, context_id)
select
  r.student_id,
  r.qid,
  r.correct,
  case when q.question_type = 'spr' then
       case when r.correct then coalesce(q.correct_answer->>'number', '1') else '0' end
  end,
  30000 + ((r.ord * 6151) % 210000),           -- 30s–4min, deterministic
  now() - (r.ord || ' hours')::interval - (r.student_seed || ' days')::interval,
  'assignment', 'assignment', r.assignment_id
from (
  select a.id as assignment_id,
         s.student_id,
         q.qid,
         q.ord,
         case s.student_id
           when '33333333-3333-3333-3333-333333333333'::uuid then 1
           when '44444444-4444-4444-4444-444444444444'::uuid then 3
           else 5 end as student_seed,
         -- strong / middling / weak, with harder bands missed more
         ((q.ord * 7 + case s.student_id
             when '33333333-3333-3333-3333-333333333333'::uuid then 0
             when '44444444-4444-4444-4444-444444444444'::uuid then 3
             else 5 end) % 10)
           >= (case s.student_id
                 when '33333333-3333-3333-3333-333333333333'::uuid then 2
                 when '44444444-4444-4444-4444-444444444444'::uuid then 4
                 else 6 end) as correct
  from public.assignments_v2 a
  cross join (values
    ('33333333-3333-3333-3333-333333333333'::uuid),
    ('44444444-4444-4444-4444-444444444444'::uuid),
    ('55555555-5555-5555-5555-555555555555'::uuid)
  ) as s(student_id)
  cross join lateral unnest(a.question_ids) with ordinality as q(qid, ord)
  where a.id in ('a1111111-0000-4000-8000-000000000001'::uuid,
                 'a2222222-0000-4000-8000-000000000002'::uuid,
                 'a3333333-0000-4000-8000-000000000003'::uuid)
    -- Stu Three stops two thirds of the way in
    and not (s.student_id = '55555555-5555-5555-5555-555555555555'::uuid
             and q.ord > (array_length(a.question_ids, 1) * 2) / 3)
) r
join public.questions_v2 q on q.id = r.qid;

commit;

-- Sanity check after running:
--   select a.title,
--          (select count(*) from public.assignment_students_v2 s
--           where s.assignment_id = a.id) students,
--          array_length(a.question_ids,1) questions,
--          (select count(*) from public.attempts t
--           where t.context_type = 'assignment' and t.context_id = a.id) attempts
--   from public.assignments_v2 a
--   where a.id in ('a1111111-0000-4000-8000-000000000001',
--                  'a2222222-0000-4000-8000-000000000002',
--                  'a3333333-0000-4000-8000-000000000003');
