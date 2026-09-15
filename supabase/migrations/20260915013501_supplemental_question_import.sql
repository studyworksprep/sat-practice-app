-- Supplemental imports: explicit access, atomic insert and duplicate checks.
create table public.question_batch_access (
  batch_id uuid not null references public.question_batches(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  granted_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key(batch_id,user_id)
);
create index question_batch_access_user_idx on public.question_batch_access(user_id,batch_id);
alter table public.question_batch_access enable row level security;
grant select,insert,delete on public.question_batch_access to authenticated;
create policy batch_access_read on public.question_batch_access for select to authenticated
  using (user_id=(select auth.uid()) or (select public.is_admin()));
create policy batch_access_add on public.question_batch_access for insert to authenticated
  with check ((select public.is_admin()) and not (select public.is_demo()) and granted_by=(select auth.uid()));
create policy batch_access_remove on public.question_batch_access for delete to authenticated
  using ((select public.is_admin()) and not (select public.is_demo()));

-- Restrictive policies also constrain the existing broad authenticated-read policies.
-- Staff can review drafts. Students require both publication and a per-set grant.
create policy supplemental_question_access on public.questions_v2 as restrictive for select to authenticated
using (pool='standard' or (select public.is_admin()) or (select public.is_teacher()) or (select public.is_manager()) or
  (is_published and not is_broken and deleted_at is null and batch_id in
    (select a.batch_id from public.question_batch_access a where a.user_id=(select auth.uid()))));
create policy supplemental_batch_access on public.question_batches as restrictive for select to authenticated
using (pool='standard' or (select public.is_admin()) or (select public.is_teacher()) or (select public.is_manager()) or
  id in (select a.batch_id from public.question_batch_access a where a.user_id=(select auth.uid())));

-- Conservative candidate matching: equal visible stem text is a possible duplicate,
-- never permission to merge. Retain punctuation/numbers; ignore layout and spacing.
create function public.import_stem_key(p_html text) returns text
language sql immutable strict set search_path='' as $$
  select lower(regexp_replace(regexp_replace(p_html,'<[^>]*>','','g'),'[[:space:]]+','','g'))
$$;
revoke all on function public.import_stem_key(text) from public;
grant execute on function public.import_stem_key(text) to authenticated;
create function public.find_question_import_matches(p_stem text,p_identifiers text[])
returns table(id uuid) language sql stable security invoker set search_path='' as $$
  select q.id from public.questions_v2 q where public.is_admin() and
    (q.source_id=any(p_identifiers) or q.source_external_id=any(p_identifiers) or
     public.import_stem_key(q.stem_html)=public.import_stem_key(p_stem))
$$;
revoke all on function public.find_question_import_matches(text,text[]) from public;
grant execute on function public.find_question_import_matches(text,text[]) to authenticated;

create function public.insert_reviewed_question(p_question jsonb,p_batch uuid,p_publish boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_pool text; v_existing uuid; v_options jsonb; v_answer jsonb;
begin
  if not public.is_admin() or public.is_demo() or auth.uid() is null then raise exception 'Admin access required'; end if;
  v_id := (p_question->>'id')::uuid;
  perform pg_advisory_xact_lock(754831902);
  -- A retry of the same signed review returns the original insertion, never overwrites it.
  select q.id into v_existing from public.questions_v2 q where q.id=v_id and q.created_by=auth.uid();
  if v_existing is not null then return v_existing; end if;
  if p_batch is null then v_pool := 'standard';
  else select b.pool into v_pool from public.question_batches b where b.id=p_batch;
    if v_pool is distinct from 'opt_in' then raise exception 'Select a supplemental set'; end if;
  end if;
  if nullif(trim(p_question->>'stem_html'),'') is null then raise exception 'Question prompt required'; end if;
  if exists(select 1 from public.find_question_import_matches(p_question->>'stem_html',
    array[p_question->>'source_id',p_question->>'source_external_id'])) then
    raise exception 'Possible duplicate found. Compare again before importing.';
  end if;
  v_options := p_question->'options'; v_answer := p_question->'correct_answer';
  if p_publish and (v_answer is null or v_answer='null'::jsonb or
    case when p_question->>'question_type'='mcq' then coalesce(v_answer->>'option_label','') not in ('A','B','C','D')
      else coalesce(v_answer->>'text','') in ('','[]') end) then
    raise exception 'A verified answer is required for publication';
  end if;
  if v_pool='standard' and (nullif(p_question->>'domain_name','') is null or nullif(p_question->>'skill_name','') is null
     or (p_question->>'difficulty') is null) then raise exception 'Regular-bank imports require topic and difficulty metadata'; end if;
  insert into public.questions_v2(id,question_type,stem_html,rationale_html,options,correct_answer,
    domain_name,skill_name,difficulty,score_band,source,source_id,source_external_id,batch_id,pool,
    is_published,is_broken,created_by,updated_by,stem_rendered,rationale_rendered,options_rendered)
  values (v_id,p_question->>'question_type',p_question->>'stem_html',p_question->>'rationale_html',v_options,v_answer,
    nullif(p_question->>'domain_name',''),nullif(p_question->>'skill_name',''),(p_question->>'difficulty')::integer,
    (p_question->>'score_band')::integer,'admin_import',p_question->>'source_id',p_question->>'source_external_id',
    p_batch,v_pool,p_publish,false,auth.uid(),auth.uid(),p_question->>'stem_rendered',p_question->>'rationale_rendered',p_question->'options_rendered');
  return v_id;
end $$;
revoke all on function public.insert_reviewed_question(jsonb,uuid,boolean) from public;
grant execute on function public.insert_reviewed_question(jsonb,uuid,boolean) to authenticated;
