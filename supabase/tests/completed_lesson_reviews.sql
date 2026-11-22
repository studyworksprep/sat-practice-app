-- Run on the seeded development database. Fixture edits roll back.
begin;
create temporary table review_fixture on commit drop as
select '33333333-3333-3333-3333-333333333333'::uuid as student,
  (select id from public.lessons where status = 'published' order by id limit 1) as lesson,
  array(select id from public.questions_v2 where pool = 'standard' and batch_id is null
    and is_published and not is_broken and deleted_at is null order by id limit 2) as questions,
  gen_random_uuid() as partial_id, gen_random_uuid() as good_id, gen_random_uuid() as missed_id;
update public.questions_v2 q set pool = 'lesson_drill', drill_lesson_id = f.lesson,
  difficulty = 1, drill_phase = 'later_review', drill_sequence = array_position(f.questions,q.id)
from review_fixture f where q.id = any(f.questions);
insert into public.review_queue(student_id,item_type,item_ref,due_at,interval_days)
select student,'lesson_check',lesson::text,now()-interval '1 hour',2 from review_fixture
on conflict (student_id,item_type,item_ref) do update set due_at = excluded.due_at,
  interval_days = 2, ease = 2.5, lapses = 0, last_result = null, last_reviewed_at = null;
grant select on review_fixture to authenticated;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated"}',true);
do $$
declare
  f record;
  item public.review_queue;
begin
  select * into strict f from review_fixture;
  if f.lesson is null or cardinality(f.questions) <> 2 then raise exception 'missing development fixtures'; end if;
  insert into public.practice_sessions(id,user_id,mode,test_type,filter_criteria,question_ids)
    select id,f.student,'review','sat','{"kind":"srs_due"}',to_jsonb(f.questions)
    from unnest(array[f.partial_id,f.good_id,f.missed_id]) id;
  insert into public.attempts(user_id,question_id,is_correct,context_type,context_id)
    values(f.student,f.questions[1],true,'review',f.partial_id);
  update public.practice_sessions set status='completed' where id=f.partial_id;
  if exists(select from public.review_queue where student_id=f.student and item_ref=f.lesson::text
    and last_result is not null) then raise exception 'partial lesson credited'; end if;
  insert into public.attempts(user_id,question_id,is_correct,context_type,context_id)
    select f.student,q,true,'review',f.good_id from unnest(f.questions) q;
  update public.practice_sessions set status='completed' where id=f.good_id;
  perform public.credit_due_lesson_review(f.good_id);
  select * into strict item from public.review_queue where student_id=f.student
    and item_type='lesson_check' and item_ref=f.lesson::text;
  if item.last_result is distinct from 'good' or item.interval_days<>3
    or item.due_at<>item.last_reviewed_at+interval '72 hours' then raise exception 'good/replay schedule'; end if;
  -- The third session was already open. Finishing it cannot double-count a due period.
  insert into public.attempts(user_id,question_id,is_correct,context_type,context_id)
    select f.student,q,q=f.questions[1],'review',f.missed_id from unnest(f.questions) q;
  update public.practice_sessions set status='completed' where id=f.missed_id;
  if exists(select from public.review_queue where id=item.id and last_result<>'good')
    then raise exception 'overlapping session credited twice'; end if;
  update public.review_queue set due_at=now()-interval '1 minute' where id=item.id;
  perform public.credit_due_lesson_review(f.missed_id);
  if not exists(select from public.review_queue where id=item.id and last_result='again'
    and lapses=1 and interval_days=1 and due_at=last_reviewed_at+interval '24 hours')
    then raise exception 'missed answer schedule'; end if;
end;
$$;
rollback;
