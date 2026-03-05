-- RPC function to set is_broken on a question, bypassing RLS.
-- Only non-practice authenticated users may call this.
create or replace function set_question_broken(question_uuid uuid, broken boolean)
returns void
language plpgsql
security definer
as $$
declare
  caller_role text;
begin
  -- Look up the caller's role
  select coalesce(p.role, 'practice')
    into caller_role
    from profiles p
   where p.id = auth.uid();

  if caller_role = 'practice' then
    raise exception 'Practice accounts cannot flag questions as broken';
  end if;

  update questions
     set is_broken = broken
   where id = question_uuid;
end;
$$;
