-- Default privileges can grant anon directly, independently of PUBLIC.
revoke execute on function public.import_stem_key(text) from anon;
revoke execute on function public.find_question_import_matches(text,text[]) from anon;
revoke execute on function public.insert_reviewed_question(jsonb,uuid,boolean) from anon;
