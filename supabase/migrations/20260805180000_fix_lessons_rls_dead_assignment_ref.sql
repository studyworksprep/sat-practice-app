-- Fix student-facing lesson RLS broken by the v1 archival.
--
-- lesson_assignments / lesson_assignment_students were moved to
-- _legacy, but public.student_has_lesson_assignment() (search_path
-- pinned to '') still reads public.lesson_assignments. Under RLS,
-- every student SELECT on lessons — and on lesson_blocks /
-- lesson_topics via can_view_lesson() — fails with 42P01
-- ("relation public.lesson_assignments does not exist"), so /learn
-- renders an empty library and the viewer would load zero blocks.
-- Author/admin paths avoided the failing clause, which kept the
-- breakage invisible from the authoring side.
--
-- Fix: drop the dead assignment clause from lessons_select and
-- can_view_lesson(), then drop student_has_lesson_assignment().
-- Per-student lesson gating can return alongside the lesson_packs
-- work when a live assignment table exists again.
--
-- is_lesson_assignment_student / is_lesson_assignment_teacher are
-- intentionally kept: _legacy.lesson_assignments policies still
-- depend on them; they get dropped together with _legacy.

drop policy lessons_select on public.lessons;
create policy lessons_select on public.lessons
  for select using (
    (visibility = 'shared' and status = 'published')
    or author_id = auth.uid()
    or public.is_admin()
  );

create or replace function public.can_view_lesson(p_lesson_id uuid)
returns boolean
language sql security definer set search_path = ''
as $$
  select exists (
    select 1 from public.lessons
    where id = p_lesson_id
      and (
        (visibility = 'shared' and status = 'published')
        or author_id = auth.uid()
        or public.is_admin()
      )
  );
$$;

drop function public.student_has_lesson_assignment(uuid, uuid);
