-- =========================================================
-- Tutor "covered in session" for lessons
-- (docs/foundations-and-question-patterns.md §3.2 tutor roster,
--  §4 step 5, §7.5 item 1)
-- =========================================================
--
-- Tutored students mostly get the foundations live, before the syllabus
-- switch goes on. The generator skips a foundation lesson (and any
-- syllabus lesson step) when lesson_progress.completed_at is set, so a
-- tutor needs a way to record "we covered this in session" per student:
-- a completed lesson_progress row the student never walked in the app.
--
-- Two columns keep that record honest. covered_by is the staff member
-- who recorded it and covered_at is when; a student's own completion
-- leaves both null, so an efficacy review can compare students who got
-- a foundation live against students who took the digitized lesson
-- (§4 step 6). Writes go through two SECURITY DEFINER functions gated
-- on is_teacher() (teacher, manager or admin) and can_view(student):
-- RLS on lesson_progress keeps letting only the student write their own
-- row, and a trigger stops anyone but staff (or the service role) from
-- setting the two attribution columns directly.

alter table public.lesson_progress
  add column if not exists covered_by uuid references public.profiles(id) on delete set null,
  add column if not exists covered_at timestamptz;

comment on column public.lesson_progress.covered_by is
  'Staff member who recorded this lesson as covered in a live session (mark_lesson_covered). Null when the student completed the lesson in the app.';
comment on column public.lesson_progress.covered_at is
  'When the lesson was recorded as covered in session. Equal to completed_at when the tutor''s mark set the completion; earlier when the student later finished the lesson in the app themselves.';

-- ── Guard: only staff may set or change the attribution columns ──────
-- auth.uid() is null for the service role and inside migrations, which
-- stay free to write them (seeds, resets).
create or replace function public.lesson_progress_guard_covered()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if auth.uid() is null or is_teacher() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.covered_by is not null or new.covered_at is not null then
      raise exception 'Only a tutor can record a lesson as covered in session';
    end if;
  elsif new.covered_by is distinct from old.covered_by
     or new.covered_at is distinct from old.covered_at then
    raise exception 'Only a tutor can record a lesson as covered in session';
  end if;
  return new;
end;
$$;

drop trigger if exists lesson_progress_guard_covered on public.lesson_progress;
create trigger lesson_progress_guard_covered
  before insert or update on public.lesson_progress
  for each row execute function public.lesson_progress_guard_covered();

-- ── mark_lesson_covered(student, lesson) ─────────────────────────────
-- Upserts a completed lesson_progress row on the tutor's behalf. A row
-- the student already has keeps everything they did (blocks, check
-- answers, an earlier completion); the first mark wins, so re-marking
-- keeps who covered it and when.
create or replace function public.mark_lesson_covered(
  p_student uuid,
  p_lesson uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_now timestamptz := now();
  v_row lesson_progress%rowtype;
  v_name text;
begin
  if not is_teacher() then
    raise exception 'Tutor, manager or admin only';
  end if;
  if is_demo() then
    raise exception 'Demo accounts are read-only';
  end if;
  if p_student is null or p_lesson is null then
    raise exception 'Student and lesson are required';
  end if;
  if not can_view(p_student) then
    raise exception 'You do not have access to this student';
  end if;
  if not exists (select 1 from profiles where id = p_student and role = 'student') then
    raise exception 'Not a student';
  end if;
  if not exists (select 1 from lessons where id = p_lesson) then
    raise exception 'Lesson not found';
  end if;

  insert into lesson_progress
    (lesson_id, student_id, completed_blocks, check_answers, started_at, completed_at, covered_by, covered_at)
  values
    (p_lesson, p_student, '{}'::text[], '{}'::jsonb, v_now, v_now, v_actor, v_now)
  on conflict (lesson_id, student_id) do update
    set started_at   = coalesce(lesson_progress.started_at, excluded.started_at),
        completed_at = coalesce(lesson_progress.completed_at, excluded.completed_at),
        covered_by   = coalesce(lesson_progress.covered_by, excluded.covered_by),
        covered_at   = case
                         when lesson_progress.covered_by is null then excluded.covered_at
                         else lesson_progress.covered_at
                       end
  returning * into v_row;

  select nullif(trim(coalesce(tutor_name, concat_ws(' ', first_name, last_name))), '')
    into v_name
    from profiles
   where id = v_row.covered_by;

  return jsonb_build_object(
    'lesson_id', v_row.lesson_id,
    'student_id', v_row.student_id,
    'completed_at', v_row.completed_at,
    'covered_by', v_row.covered_by,
    'covered_at', v_row.covered_at,
    'covered_by_name', v_name
  );
end;
$function$;

revoke all on function public.mark_lesson_covered(uuid, uuid) from public;
revoke all on function public.mark_lesson_covered(uuid, uuid) from anon;
grant execute on function public.mark_lesson_covered(uuid, uuid) to authenticated;

comment on function public.mark_lesson_covered(uuid, uuid) is
  'Record a lesson as covered in a live session for a student: a completed lesson_progress row stamped covered_by/covered_at. Tutor, manager or admin who can view the student.';

-- ── unmark_lesson_covered(student, lesson) ───────────────────────────
-- Withdraws a mark. A row the mark created outright (nothing walked,
-- both stamps from the mark) is deleted; anything the student did
-- themselves stays, with only the mark's own completion stamp removed.
create or replace function public.unmark_lesson_covered(
  p_student uuid,
  p_lesson uuid
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_row lesson_progress%rowtype;
begin
  if not is_teacher() then
    raise exception 'Tutor, manager or admin only';
  end if;
  if is_demo() then
    raise exception 'Demo accounts are read-only';
  end if;
  if p_student is null or p_lesson is null then
    raise exception 'Student and lesson are required';
  end if;
  if not can_view(p_student) then
    raise exception 'You do not have access to this student';
  end if;

  select * into v_row
    from lesson_progress
   where lesson_id = p_lesson and student_id = p_student
     for update;
  if not found or v_row.covered_by is null then
    raise exception 'This lesson is not recorded as covered in session';
  end if;

  if coalesce(array_length(v_row.completed_blocks, 1), 0) = 0
     and v_row.check_answers = '{}'::jsonb
     and v_row.started_at = v_row.covered_at
     and v_row.completed_at = v_row.covered_at then
    delete from lesson_progress where lesson_id = p_lesson and student_id = p_student;
    return jsonb_build_object(
      'lesson_id', p_lesson,
      'student_id', p_student,
      'deleted', true,
      'completed_at', null
    );
  end if;

  update lesson_progress
     set completed_at = case when completed_at = covered_at then null else completed_at end,
         covered_by = null,
         covered_at = null
   where lesson_id = p_lesson and student_id = p_student
  returning * into v_row;

  return jsonb_build_object(
    'lesson_id', v_row.lesson_id,
    'student_id', v_row.student_id,
    'deleted', false,
    'completed_at', v_row.completed_at
  );
end;
$function$;

revoke all on function public.unmark_lesson_covered(uuid, uuid) from public;
revoke all on function public.unmark_lesson_covered(uuid, uuid) from anon;
grant execute on function public.unmark_lesson_covered(uuid, uuid) to authenticated;

comment on function public.unmark_lesson_covered(uuid, uuid) is
  'Withdraw a covered-in-session mark: deletes the row the mark created, or clears the mark and its completion stamp while keeping what the student did themselves.';
