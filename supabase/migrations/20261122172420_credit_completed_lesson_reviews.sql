-- A spaced-review session can contain several lessons and standalone questions.
-- Credit each due lesson only after the student submits the session and answers
-- every question from that lesson in it. The question-level schedule is independent.
create function public.credit_due_lesson_review(p_session_id uuid)
returns void
language sql
security invoker
set search_path = ''
as $$
  with results as (
    select r.id, s.created_at as started_at, max(a.created_at) as reviewed_at,
           bool_and(a.is_correct is true) as all_correct
    from public.practice_sessions s
    join public.review_queue r on r.student_id = s.user_id
      and r.item_type = 'lesson_check' and r.due_at <= s.created_at
    join public.lessons l on l.id::text = r.item_ref
    join public.questions_v2 q on q.drill_lesson_id = l.id and q.pool = 'lesson_drill'
      and s.question_ids ? q.id::text
    left join lateral (
      select attempt.is_correct, attempt.created_at from public.attempts attempt
      where attempt.context_id = s.id and attempt.context_type = 'review'
        and attempt.user_id = s.user_id and attempt.question_id = q.id
      order by attempt.created_at, attempt.id limit 1
    ) a on true
    where s.id = p_session_id and s.status = 'completed'
      and s.mode = 'review' and s.test_type = 'sat' and s.filter_criteria->>'kind' = 'srs_due'
      and (auth.uid() is null or s.user_id = auth.uid())
    group by r.id, s.created_at
    having count(a.created_at) = count(*)
  ), schedule as (
    -- Same Good/Again intervals as lib/review/schedule.ts.
    select x.*, case when not x.all_correct then 1 when r.interval_days < 3 then 3
                     else least(30, round(r.interval_days * r.ease)) end as days
    from results x join public.review_queue r on r.id = x.id
  )
  update public.review_queue r
  set due_at = x.reviewed_at + x.days * interval '24 hours',
      interval_days = x.days, last_reviewed_at = x.reviewed_at,
      last_result = case when x.all_correct then 'good' else 'again' end,
      lapses = r.lapses + case when x.all_correct then 0 else 1 end,
      ease = case when x.all_correct then r.ease else greatest(1.3, r.ease - 0.2) end
  from schedule x
  -- Also checked on the target row so overlapping completions cannot advance it twice.
  where r.id = x.id and r.due_at <= x.started_at;
$$;
revoke all on function public.credit_due_lesson_review(uuid) from public, anon;
grant execute on function public.credit_due_lesson_review(uuid) to authenticated, service_role;

create function public.lesson_review_from_finished_session()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  perform public.credit_due_lesson_review(new.id);
  return new;
end;
$$;
revoke all on function public.lesson_review_from_finished_session() from public, anon, authenticated;

create trigger trg_lesson_review_from_finished_session
after update of status on public.practice_sessions
for each row when (old.status is distinct from new.status and new.status = 'completed'
  and new.mode = 'review' and new.test_type = 'sat' and new.filter_criteria->>'kind' = 'srs_due')
execute function public.lesson_review_from_finished_session();

-- Replay real completed review sessions in order. Partial sessions cannot earn
-- credit and a second session started during the same due period is a no-op.
do $$
declare
  session_id uuid;
begin
  for session_id in
    select s.id from public.practice_sessions s
    where s.status = 'completed' and s.mode = 'review' and s.test_type = 'sat'
      and s.filter_criteria->>'kind' = 'srs_due'
      and exists (select from public.review_queue r where r.student_id = s.user_id
        and r.item_type = 'lesson_check' and r.due_at <= s.created_at)
    order by s.last_activity_at, s.id
  loop
    perform public.credit_due_lesson_review(session_id);
  end loop;
end;
$$;
