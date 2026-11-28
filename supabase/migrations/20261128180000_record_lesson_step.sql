-- Merge one block at a time. A submission from another tab must not erase
-- another block's history. A simultaneous retry on this block is refolded
-- by the caller when its expected entry no longer matches.
create function public.record_lesson_step(
  p_lesson_id uuid, p_block_id uuid, p_complete boolean,
  p_expected jsonb default null, p_entry jsonb default null
) returns boolean
language plpgsql security invoker set search_path = '' as $$
declare
  student uuid := auth.uid();
  block_key text := p_block_id::text;
begin
  if student is null then raise exception 'Sign in to save lesson progress'; end if;
  insert into public.lesson_progress (lesson_id, student_id)
    values (p_lesson_id, student) on conflict do nothing;

  update public.lesson_progress
  set completed_blocks = case when p_complete and not (block_key = any(completed_blocks))
        then array_append(completed_blocks, block_key) else completed_blocks end,
      check_answers = case when p_entry is null then check_answers
        else jsonb_set(check_answers, array[block_key], p_entry) end
  where lesson_id = p_lesson_id and student_id = student
    and (p_entry is null or (check_answers -> block_key) is not distinct from p_expected);
  return found;
end;
$$;
revoke all on function public.record_lesson_step(uuid, uuid, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.record_lesson_step(uuid, uuid, boolean, jsonb, jsonb) to authenticated;
