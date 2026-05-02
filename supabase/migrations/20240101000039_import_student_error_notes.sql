-- Per-student error-note backfill. Copies a student's existing
-- legacy Error Log entries (question_status.notes, v1-keyed) into
-- the v2-native question_error_notes table (questions_v2(id)
-- keyed) so a flipped student doesn't lose notes they wrote
-- pre-cutover.
--
-- Used by migrateUserToNext as part of the per-student cutover
-- alongside import_student_practice_history. Idempotent — the
-- ON CONFLICT clause keeps anything the user has already written
-- on the v2 side (e.g. if they re-flipped to legacy and back),
-- and DISTINCT ON collapses multiple v1 versions of the same
-- question to a single v2 row, picking the most recently
-- updated note.
--
-- security definer because question_status RLS scopes reads to
-- auth.uid() and we're called from a service-role context. The
-- p_user_id arg is supplied by migrateUserToNext, which already
-- gates on admin role.

create or replace function public.import_student_error_notes(
  p_user_id uuid
)
returns table (
  imported_count int,
  skipped_existing int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inserted int := 0;
  v_skipped  int := 0;
begin
  with src as (
    select distinct on (qs.user_id, qim.new_question_id)
      qs.user_id,
      qim.new_question_id as question_id,
      qs.notes,
      coalesce(qs.updated_at, now()) as updated_at
    from public.question_status qs
    join public.question_id_map qim
      on qim.old_question_id = qs.question_id
    where qs.user_id = p_user_id
      and qs.notes is not null
      and length(trim(qs.notes)) > 0
    order by qs.user_id, qim.new_question_id, qs.updated_at desc
  ),
  ins as (
    insert into public.question_error_notes (
      user_id, question_id, body, created_at, updated_at
    )
    select user_id, question_id, notes, updated_at, updated_at
    from src
    on conflict (user_id, question_id) do nothing
    returning 1
  )
  select count(*)::int into v_inserted from ins;

  -- For observability: how many candidates we considered.
  select count(*)::int into v_skipped
  from public.question_status qs
  join public.question_id_map qim on qim.old_question_id = qs.question_id
  where qs.user_id = p_user_id
    and qs.notes is not null
    and length(trim(qs.notes)) > 0;
  v_skipped := v_skipped - v_inserted;
  if v_skipped < 0 then v_skipped := 0; end if;

  return query select v_inserted, v_skipped;
end;
$$;

grant execute on function public.import_student_error_notes(uuid) to authenticated;
