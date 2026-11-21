-- Reuse question rendering, grading, and attempt history for lesson-authored drills.
alter table public.questions_v2
  add column drill_lesson_id uuid references public.lessons(id) on delete set null,
  add column drill_phase text,
  add column drill_sequence integer,
  drop constraint questions_v2_pool_check,
  add constraint questions_v2_pool_check check (pool in ('standard', 'opt_in', 'lesson_drill')),
  add constraint questions_v2_lesson_drill_fields_check check (
    (
      pool = 'lesson_drill'
      and batch_id is null
      and difficulty is not null
      and drill_phase is not null and drill_phase in ('practice', 'later_review')
      and drill_sequence is not null and drill_sequence > 0
    ) or (
      pool <> 'lesson_drill'
      and drill_lesson_id is null and drill_phase is null and drill_sequence is null
    )
  );

-- Also covers the lesson FK's lookup on deletion. The drill row survives
-- deletion so existing attempts keep their question ID.
create index questions_v2_drill_lesson_idx
  on public.questions_v2 (drill_lesson_id, difficulty, drill_sequence)
  where drill_lesson_id is not null;

comment on column public.questions_v2.pool is
  'Visibility pool: standard SAT bank, opt-in import batches, or original drills linked to a lesson.';

alter policy supplemental_question_access on public.questions_v2 using (
  case when pool = 'lesson_drill' then
    (select public.is_admin())
    or (
      is_published and not is_broken and deleted_at is null
      and exists (
        select 1 from public.lessons l where l.id = drill_lesson_id and l.status = 'published'
      )
    )
  else
    pool = 'standard' or (select public.is_admin()) or (select public.is_teacher()) or (select public.is_manager())
    or (is_published and not is_broken and deleted_at is null and batch_id in (
      select a.batch_id from public.question_batch_access a where a.user_id = (select auth.uid())
    ))
  end
);
