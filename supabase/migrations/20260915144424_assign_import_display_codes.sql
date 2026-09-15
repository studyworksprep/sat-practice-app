-- Assign a friendly ID without inventing topic metadata for supplemental questions.
create or replace function public.insert_reviewed_question(p_question jsonb,p_batch uuid,p_publish boolean)
returns uuid language plpgsql security invoker set search_path='' as $$
declare v_id uuid; v_pool text; v_existing uuid; v_options jsonb; v_answer jsonb; v_domain_code text; v_section text; v_number bigint; v_display_code text;
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
    array[p_question->>'source_id',p_question->>'source_external_id',p_question->>'original_source_id'])) then
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
  v_domain_code := case p_question->>'domain_name'
    when 'Algebra' then 'H' when 'Advanced Math' then 'P'
    when 'Problem-Solving and Data Analysis' then 'S' when 'Geometry and Trigonometry' then 'Q'
    when 'Information and Ideas' then 'INI' when 'Craft and Structure' then 'CAS'
    when 'Expression of Ideas' then 'EOI' when 'Standard English Conventions' then 'SEC' end;
  v_section := public.questions_v2_section_prefix(v_domain_code);
  if nullif(p_question->>'section','') is not null and
    ((p_question->>'section') not in ('M','RW') or
      (v_section is not null and v_section <> (p_question->>'section'))) then
    raise exception 'Selected section conflicts with question metadata';
  end if;
  v_section := coalesce(v_section,nullif(p_question->>'section',''));
  if v_section is null or v_section not in ('M','RW') then
    raise exception 'Choose Math or Reading and Writing before importing';
  end if;
  v_number := case when v_section='M' then nextval('public.questions_v2_math_seq')
    else nextval('public.questions_v2_rw_seq') end;
  v_display_code := v_section || '-' || lpad(v_number::text,greatest(5,length(v_number::text)),'0');
  insert into public.questions_v2(id,display_code,domain_code,question_type,stem_html,rationale_html,options,correct_answer,
    domain_name,skill_name,difficulty,score_band,source,source_id,source_external_id,batch_id,pool,
    is_published,is_broken,created_by,updated_by,stem_rendered,rationale_rendered,options_rendered)
  values (v_id,v_display_code,v_domain_code,p_question->>'question_type',p_question->>'stem_html',p_question->>'rationale_html',v_options,v_answer,
    nullif(p_question->>'domain_name',''),nullif(p_question->>'skill_name',''),(p_question->>'difficulty')::integer,
    (p_question->>'score_band')::integer,'admin_import',p_question->>'source_id',p_question->>'source_external_id',
    p_batch,v_pool,p_publish,false,auth.uid(),auth.uid(),p_question->>'stem_rendered',p_question->>'rationale_rendered',p_question->'options_rendered');
  return v_id;
end $$;
revoke all on function public.insert_reviewed_question(jsonb,uuid,boolean) from public,anon;
grant execute on function public.insert_reviewed_question(jsonb,uuid,boolean) to authenticated;
