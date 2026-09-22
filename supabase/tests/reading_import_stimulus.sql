-- Run inside a transaction and ROLLBACK. Requires an existing admin profile.
-- Synthetic questions are never committed. As with any rolled-back insert,
-- PostgreSQL display-code sequences may advance.
do $test$
declare admin_id uuid; test_id uuid := gen_random_uuid(); saved_id uuid; q jsonb; existing public.questions_v2;
begin
  select id into admin_id from public.profiles where role='admin' limit 1;
  if admin_id is null then raise exception 'Test requires an admin profile'; end if;
  perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_id,'role','authenticated','app_metadata',jsonb_build_object('role','admin'))::text,true);
  if not public.is_admin() then raise exception 'Admin test context failed'; end if;

  if public.import_stem_key('<p>Two &amp; three</p><svg><text>99</text></svg>') <> public.import_stem_key('<p>Two &amp; three</p><img src="chart.png">') then
    raise exception 'Graph representation should not conceal passage matches';
  end if;
  if public.import_stem_key('<p>2+2</p>')=public.import_stem_key('<p>2+3</p>') then raise exception 'Numbers must remain significant'; end if;

  select * into existing from public.questions_v2 where stimulus_html is not null and display_code like 'RW-%' limit 1;
  if not exists(select 1 from public.find_question_import_matches(existing.stimulus_html||existing.stem_html,array[]::text[]) where id=existing.id) then raise exception 'Separate passage matching failed'; end if;
  if exists(select 1 from public.find_question_import_matches('<p>Entirely different passage '||test_id||'</p>'||existing.stem_html,array[]::text[]) where id=existing.id) then raise exception 'Generic prompt caused a false duplicate'; end if;

  q:=jsonb_build_object('id',test_id,'source_id',test_id::text,'source_external_id',test_id::text,
    'question_type','mcq','stimulus_html','<p>Research notes '||test_id||'</p><ul><li>A note.</li></ul>',
    'stem_html','<p>The student wants to describe a detail. Which choice?</p>',
    'stimulus_rendered','<p>Rendered notes</p>','rendered_source_hash','test-hash',
    'rationale_html','<p>Test rationale.</p>','options','[{"label":"A","content_html":"<p>One.</p>"},{"label":"B","content_html":"<p>Two.</p>"},{"label":"C","content_html":"<p>Three.</p>"},{"label":"D","content_html":"<p>Four.</p>"}]'::jsonb,
    'correct_answer','{"option_label":"A"}'::jsonb,'domain_name','Expression of Ideas','skill_name','Rhetorical Synthesis','difficulty',1,'section','RW');
  saved_id:=public.insert_reviewed_question(q,null,false);
  if not exists(select 1 from public.questions_v2 where id=saved_id and stimulus_html=q->>'stimulus_html' and stem_html=q->>'stem_html' and stimulus_rendered=q->>'stimulus_rendered' and rendered_source_hash='test-hash' and skill_code='SYN') then raise exception 'Separate stimulus did not survive insertion'; end if;
  if public.insert_reviewed_question(q,null,false)<>saved_id then raise exception 'Retry is not idempotent'; end if;

  begin
    perform public.insert_reviewed_question((q-'stimulus_html')||jsonb_build_object('id',gen_random_uuid(),'source_id',gen_random_uuid()::text,'source_external_id',gen_random_uuid()::text),null,false);
    raise exception 'Missing reading stimulus accepted';
  exception when others then
    if sqlerrm not like 'Reading imports require%' then raise; end if;
  end;
  begin
    perform public.insert_reviewed_question(q||jsonb_build_object('id',gen_random_uuid(),'source_id',gen_random_uuid()::text,'source_external_id',gen_random_uuid()::text),null,false);
    raise exception 'Duplicate content accepted';
  exception when others then
    if sqlerrm not like 'New or changed possible duplicate%' then raise; end if;
  end;
  perform set_config('request.jwt.claims','{}',true);
  if exists(select 1 from public.find_question_import_matches(existing.stimulus_html||existing.stem_html,array[]::text[])) then raise exception 'Non-admin duplicate lookup allowed'; end if;
end $test$;
