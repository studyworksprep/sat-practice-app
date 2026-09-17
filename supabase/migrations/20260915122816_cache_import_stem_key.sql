-- Normalize the potentially image-heavy input once, rather than once per bank row.
-- Preserve candidate matching, admin authorization, RLS, signature and grants.
create or replace function public.find_question_import_matches(p_stem text,p_identifiers text[])
returns table(id uuid) language plpgsql stable security invoker set search_path='' as $$
declare
  v_stem_key text;
begin
  if not coalesce(public.is_admin(),false) then return; end if;
  v_stem_key := public.import_stem_key(p_stem);
  return query
    select q.id from public.questions_v2 q
    where q.source_id=any(p_identifiers) or q.source_external_id=any(p_identifiers)
      or public.import_stem_key(q.stem_html)=v_stem_key;
end $$;
revoke all on function public.find_question_import_matches(text,text[]) from public,anon;
grant execute on function public.find_question_import_matches(text,text[]) to authenticated;
