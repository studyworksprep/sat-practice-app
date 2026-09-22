-- Preserve complete reading passages through review, duplicate checks and insertion.
-- Keep invoker security, authorization, identity guards and reviewed-duplicate checks.
create or replace function public.import_stem_key(p_html text) returns text
language sql immutable strict set search_path='' as $key$
  select lower(regexp_replace(
    translate(replace(replace(replace(replace(replace(replace(replace(replace(
      regexp_replace(regexp_replace(regexp_replace(p_html,
        '<svg[^>]*>.*?</svg>','','gs'),
        '<span[^>]*class="sr-only"[^>]*>.*?</span>','','gs'),
        '<[^>]*>','','g'),
      '&nbsp;',' '),'&rsquo;',''''),'&#39;',''''),'&apos;',''''),
      '&ldquo;','"'),'&rdquo;','"'),'&quot;','"'),'&amp;','&'),
      '‘’“”','''''""'),
    '[[:space:]]+','','g'))
$key$;

create or replace function public.find_question_import_matches(p_stem text,p_identifiers text[])
returns table(id uuid) language plpgsql stable security invoker set search_path='' as $match$
declare v_stem_key text;
begin
  if not coalesce(public.is_admin(),false) then return; end if;
  v_stem_key := public.import_stem_key(p_stem);
  return query select q.id from public.questions_v2 q
    where q.source_id=any(p_identifiers) or q.source_external_id=any(p_identifiers)
      or (v_stem_key<>'' and public.import_stem_key(coalesce(q.stimulus_html,'') || q.stem_html)=v_stem_key);
end $match$;

CREATE OR REPLACE FUNCTION public.insert_reviewed_question(p_question jsonb, p_batch uuid, p_publish boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_id uuid; v_pool text; v_existing uuid; v_options jsonb; v_answer jsonb; v_domain_code text; v_skill_code text; v_section text; v_number bigint; v_display_code text;
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
  -- Source identity matches cannot be waived. A false-positive override only
  -- covers the exact prompt matches the admin reviewed, at their review version.
  if exists(select 1 from public.questions_v2 q where
    q.source_id=any(array[p_question->>'source_id',p_question->>'source_external_id',p_question->>'original_source_id']) or
    q.source_external_id=any(array[p_question->>'source_id',p_question->>'source_external_id',p_question->>'original_source_id'])) then
    raise exception 'Source identifier duplicate found. Compare again before importing.';
  end if;
  if jsonb_typeof(coalesce(p_question->'reviewed_non_duplicates','[]'::jsonb)) <> 'array' then
    raise exception 'Invalid duplicate review';
  end if;
  if exists(select 1 from public.find_question_import_matches(coalesce(p_question->>'stimulus_html','') || (p_question->>'stem_html'),
      array[p_question->>'source_id',p_question->>'source_external_id',p_question->>'original_source_id']) m
    join public.questions_v2 q on q.id=m.id
    where not exists(select 1 from jsonb_array_elements(coalesce(p_question->'reviewed_non_duplicates','[]'::jsonb)) reviewed
      where reviewed->>'id'=q.id::text and (reviewed->>'updated_at')::timestamptz=q.updated_at)) then
    raise exception 'New or changed possible duplicate found. Compare again before importing.';
  end if;
  v_options := p_question->'options'; v_answer := p_question->'correct_answer';
  if p_publish and (v_answer is null or v_answer='null'::jsonb or
    case when p_question->>'question_type'='mcq' then coalesce(v_answer->>'option_label','') not in ('A','B','C','D')
      else coalesce(v_answer->>'text','') in ('','[]') end) then
    raise exception 'A verified answer is required for publication';
  end if;
  if v_pool='standard' and (nullif(p_question->>'domain_name','') is null or nullif(p_question->>'skill_name','') is null
     or (p_question->>'difficulty') is null) then raise exception 'Regular-bank imports require topic and difficulty metadata'; end if;
  select taxonomy.domain_code, taxonomy.skill_code into v_domain_code, v_skill_code
  from (values
    ('H','Algebra','H.A.','Linear equations in one variable'),
    ('H','Algebra','H.B.','Linear functions'),
    ('H','Algebra','H.C.','Linear equations in two variables'),
    ('H','Algebra','H.D.','Systems of two linear equations in two variables'),
    ('H','Algebra','H.E.','Linear inequalities in one or two variables'),
    ('P','Advanced Math','P.A.','Equivalent expressions'),
    ('P','Advanced Math','P.B.','Nonlinear equations in one variable and systems of equations in two variables'),
    ('P','Advanced Math','P.C.','Nonlinear functions'),
    ('Q','Problem-Solving and Data Analysis','Q.A.','Ratios, rates, proportional relationships, and units'),
    ('Q','Problem-Solving and Data Analysis','Q.B.','Percentages'),
    ('Q','Problem-Solving and Data Analysis','Q.C.','One-variable data: Distributions and measures of center and spread'),
    ('Q','Problem-Solving and Data Analysis','Q.D.','Two-variable data: Models and scatterplots'),
    ('Q','Problem-Solving and Data Analysis','Q.E.','Probability and conditional probability'),
    ('Q','Problem-Solving and Data Analysis','Q.F.','Inference from sample statistics and margin of error'),
    ('Q','Problem-Solving and Data Analysis','Q.G.','Evaluating statistical claims: Observational studies and experiments'),
    ('S','Geometry and Trigonometry','S.A.','Area and volume'),
    ('S','Geometry and Trigonometry','S.B.','Lines, angles, and triangles'),
    ('S','Geometry and Trigonometry','S.C.','Right triangles and trigonometry'),
    ('S','Geometry and Trigonometry','S.D.','Circles'),
    ('INI','Information and Ideas','CID','Central Ideas and Details'),
    ('INI','Information and Ideas','COE','Command of Evidence'),
    ('INI','Information and Ideas','INF','Inferences'),
    ('CAS','Craft and Structure','WIC','Words in Context'),
    ('CAS','Craft and Structure','TSP','Text Structure and Purpose'),
    ('CAS','Craft and Structure','CTC','Cross-Text Connections'),
    ('EOI','Expression of Ideas','SYN','Rhetorical Synthesis'),
    ('EOI','Expression of Ideas','TRA','Transitions'),
    ('SEC','Standard English Conventions','BOU','Boundaries'),
    ('SEC','Standard English Conventions','FSS','Form, Structure, and Sense')
  ) as taxonomy(domain_code,domain_name,skill_code,skill_name)
  where lower(btrim(taxonomy.domain_name))=lower(btrim(p_question->>'domain_name'))
    and lower(btrim(taxonomy.skill_name))=lower(btrim(p_question->>'skill_name'));
  if v_pool='standard' and v_skill_code is null then
    raise exception 'Regular-bank imports require a recognized SAT domain and skill pair';
  end if;
  -- Supplemental questions may omit skills, but their domain still determines the section.
  v_domain_code := coalesce(v_domain_code, case lower(btrim(p_question->>'domain_name'))
    when 'algebra' then 'H'
    when 'advanced math' then 'P'
    when 'problem-solving and data analysis' then 'Q'
    when 'geometry and trigonometry' then 'S'
    when 'information and ideas' then 'INI'
    when 'craft and structure' then 'CAS'
    when 'expression of ideas' then 'EOI'
    when 'standard english conventions' then 'SEC' end);
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
  if v_section='RW' and nullif(btrim(p_question->>'stimulus_html'),'') is null then
    raise exception 'Reading imports require a separate passage. Compare again with reading metadata.';
  end if;
  v_number := case when v_section='M' then nextval('public.questions_v2_math_seq')
    else nextval('public.questions_v2_rw_seq') end;
  v_display_code := v_section || '-' || lpad(v_number::text,greatest(5,length(v_number::text)),'0');
  insert into public.questions_v2(id,display_code,domain_code,skill_code,question_type,stem_html,stimulus_html,rationale_html,options,correct_answer,
    domain_name,skill_name,difficulty,score_band,source,source_id,source_external_id,batch_id,pool,
    is_published,is_broken,created_by,updated_by,stem_rendered,stimulus_rendered,rationale_rendered,options_rendered,rendered_source_hash,rendered_at)
  values (v_id,v_display_code,v_domain_code,v_skill_code,p_question->>'question_type',p_question->>'stem_html',nullif(p_question->>'stimulus_html',''),p_question->>'rationale_html',v_options,v_answer,
    nullif(p_question->>'domain_name',''),nullif(p_question->>'skill_name',''),(p_question->>'difficulty')::integer,
    (p_question->>'score_band')::integer,'admin_import',p_question->>'source_id',p_question->>'source_external_id',
    p_batch,v_pool,p_publish,false,auth.uid(),auth.uid(),p_question->>'stem_rendered',p_question->>'stimulus_rendered',p_question->>'rationale_rendered',p_question->'options_rendered',p_question->>'rendered_source_hash',now());
  return v_id;
end $function$;

revoke all on function public.import_stem_key(text) from public,anon;
grant execute on function public.import_stem_key(text) to authenticated;
revoke all on function public.find_question_import_matches(text,text[]) from public,anon;
grant execute on function public.find_question_import_matches(text,text[]) to authenticated;
revoke all on function public.insert_reviewed_question(jsonb,uuid,boolean) from public,anon;
grant execute on function public.insert_reviewed_question(jsonb,uuid,boolean) to authenticated;
