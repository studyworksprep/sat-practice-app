-- Add audit columns for tracking who flagged a question as broken and when.
alter table questions
  add column if not exists broken_by uuid references auth.users(id),
  add column if not exists broken_at timestamptz;

-- Update the RPC to record the caller and timestamp when flagging broken.
create or replace function set_question_broken(question_uuid uuid, broken boolean)
returns void
language plpgsql
security definer
as $$
declare
  caller_role text;
begin
  select coalesce(p.role, 'practice')
    into caller_role
    from profiles p
   where p.id = auth.uid();

  if caller_role = 'practice' then
    raise exception 'Practice accounts cannot flag questions as broken';
  end if;

  update questions
     set is_broken  = broken,
         broken_by  = case when broken then auth.uid() else null end,
         broken_at  = case when broken then now()      else null end
   where id = question_uuid;
end;
$$;
