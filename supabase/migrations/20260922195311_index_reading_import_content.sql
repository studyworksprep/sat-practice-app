-- Hashes keep index entries bounded even for long passages. Recheck full keys
-- after the index lookup: hash equality alone never establishes a duplicate.
create index questions_v2_import_content_hash_idx on public.questions_v2
  (md5(public.import_stem_key(coalesce(stimulus_html,'') || stem_html)));

create or replace function public.find_question_import_matches(p_stem text,p_identifiers text[])
returns table(id uuid) language plpgsql stable security invoker set search_path='' as $match$
declare v_stem_key text;
begin
  if not coalesce(public.is_admin(),false) then return; end if;
  v_stem_key := public.import_stem_key(p_stem);
  -- Separate branches let content matching use its expression index even if
  -- the small identifier lookup needs a sequential scan.
  return query
    select q.id from public.questions_v2 q where q.source_id=any(p_identifiers)
    union
    select q.id from public.questions_v2 q where q.source_external_id=any(p_identifiers)
    union
    select q.id from public.questions_v2 q
      where v_stem_key<>''
        and md5(public.import_stem_key(coalesce(q.stimulus_html,'') || q.stem_html))=md5(v_stem_key)
        and public.import_stem_key(coalesce(q.stimulus_html,'') || q.stem_html)=v_stem_key;
end $match$;
revoke all on function public.find_question_import_matches(text,text[]) from public,anon;
grant execute on function public.find_question_import_matches(text,text[]) to authenticated;
