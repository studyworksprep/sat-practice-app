-- =========================================================
-- "Reviewed" flag on assigned work
-- =========================================================
--
-- The tutor's student page used to list only open assignments on its
-- Overview, so finished homework dropped off the moment the student
-- completed it, which is exactly when a tutor wants to go over it.
-- Tutors now mark each student's copy of an assignment as reviewed once
-- they have gone over it together; anything not yet reviewed stays on
-- the Overview and at the top of the Assignments tab.
--
-- The flag is per student (assignment_students_v2), because one
-- assignment can go to several students and is reviewed with each one
-- separately. reviewed_by records who marked it.
--
-- Writes go through set_assignment_reviewed(), a SECURITY DEFINER
-- function gated on is_teacher() (teacher, manager or admin) and
-- can_view(student): any staff member who can open the student's page
-- may mark it, including a co-tutor who did not create the assignment.
-- RLS still lets a student update their own row (to set completed_at),
-- so a trigger stops anyone but staff (or the service role, or a
-- migration) from changing the two review columns directly. Same shape
-- as lesson_progress.covered_by / covered_at (20260924180000).
--
-- Backfill: work finished more than 14 days before this migration
-- starts out reviewed, so the Overview opens on recent homework rather
-- than every assignment a student ever finished. reviewed_by stays null
-- on those rows, which marks them as backfilled.

alter table public.assignment_students_v2
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null;

comment on column public.assignment_students_v2.reviewed_at is
  'When a tutor marked this student''s copy of the assignment as reviewed with the student (set_assignment_reviewed). Null means not yet reviewed.';
comment on column public.assignment_students_v2.reviewed_by is
  'Staff member who marked the assignment reviewed. Null when unreviewed, and on rows the 2026-11-15 backfill marked reviewed.';

-- ── Backfill (before the guard exists) ───────────────────────────────
update public.assignment_students_v2
   set reviewed_at = now()
 where completed_at is not null
   and completed_at < now() - interval '14 days'
   and reviewed_at is null;

-- ── Guard: only staff may set or change the review columns ───────────
-- auth.uid() is null for the service role and inside migrations, which
-- stay free to write them (seeds, resets).
create or replace function public.assignment_students_guard_reviewed()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  if new.reviewed_at is null then
    new.reviewed_by := null;
  end if;
  if auth.uid() is null or is_teacher() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.reviewed_at is not null or new.reviewed_by is not null then
      raise exception 'Only a tutor can mark an assignment reviewed';
    end if;
  elsif new.reviewed_at is distinct from old.reviewed_at
     or new.reviewed_by is distinct from old.reviewed_by then
    raise exception 'Only a tutor can mark an assignment reviewed';
  end if;
  return new;
end;
$$;

drop trigger if exists assignment_students_guard_reviewed on public.assignment_students_v2;
create trigger assignment_students_guard_reviewed
  before insert or update on public.assignment_students_v2
  for each row execute function public.assignment_students_guard_reviewed();

-- ── set_assignment_reviewed(assignment, student, reviewed) ───────────
-- Marks or clears the flag on one student's copy of an assignment.
-- Marking an already-reviewed row keeps who marked it and when.
create or replace function public.set_assignment_reviewed(
  p_assignment uuid,
  p_student uuid,
  p_reviewed boolean
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_row assignment_students_v2%rowtype;
  v_name text;
begin
  if not is_teacher() then
    raise exception 'Tutor, manager or admin only';
  end if;
  if is_demo() then
    raise exception 'Demo accounts are read-only';
  end if;
  if p_assignment is null or p_student is null or p_reviewed is null then
    raise exception 'Assignment, student and reviewed are required';
  end if;
  if not can_view(p_student) then
    raise exception 'You do not have access to this student';
  end if;

  update assignment_students_v2
     set reviewed_at = case
                         when not p_reviewed then null
                         else coalesce(reviewed_at, now())
                       end,
         reviewed_by = case
                         when not p_reviewed then null
                         when reviewed_at is null then v_actor
                         else reviewed_by
                       end
   where assignment_id = p_assignment
     and student_id = p_student
  returning * into v_row;

  if not found then
    raise exception 'This student does not have that assignment';
  end if;

  select nullif(trim(coalesce(tutor_name, concat_ws(' ', first_name, last_name))), '')
    into v_name
    from profiles
   where id = v_row.reviewed_by;

  return jsonb_build_object(
    'assignment_id', v_row.assignment_id,
    'student_id', v_row.student_id,
    'reviewed_at', v_row.reviewed_at,
    'reviewed_by', v_row.reviewed_by,
    'reviewed_by_name', v_name
  );
end;
$function$;

revoke all on function public.set_assignment_reviewed(uuid, uuid, boolean) from public;
revoke all on function public.set_assignment_reviewed(uuid, uuid, boolean) from anon;
grant execute on function public.set_assignment_reviewed(uuid, uuid, boolean) to authenticated;

comment on function public.set_assignment_reviewed(uuid, uuid, boolean) is
  'Mark (or clear) a student''s copy of an assignment as reviewed with the student. Tutor, manager or admin who can view the student.';
