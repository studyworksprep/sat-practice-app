import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';

test('batch approval and reviewed false positives preserve existing questions',async({page,baseURL})=>{
  test.skip(process.env.E2E_IMPORT_BATCH_APPROVAL!=='1','Opt in to temporary development records.');
  test.setTimeout(180_000);page.setDefaultTimeout(15_000);loadEnvFile('.env.local');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(new URL(url).hostname).toBe('ikzhizgsawzjpuuznfid.supabase.co');
  expect(['localhost','127.0.0.1']).toContain(new URL(baseURL!).hostname);
  const db=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  expect((await db.auth.signInWithPassword({email:'admin@test.studyworks',password:'devseed123'})).error).toBeNull();
  const run=randomUUID(),existingId=randomUUID(),otherId=randomUUID(),ids=[0,1,2,3].map(i=>`approval-${run}-${i}`),created:string[]=[];
  const stem=`Fixture ${run}: read the diagram and enter the result.`;
  const metadata=ids.map(questionId=>({questionId,primary_class_cd_desc:'Algebra',skill_desc:'Linear functions',difficulty:'E',score_band_range_cd:2}));
  const mmd=ids.map((id,i)=>`\\section*{Question ID: ${id}}\nQuestion\n${i===0?stem:`Fixture ${run} new question ${i}: compute $2+2$.`}\nCorrect Answer: ${i===0?'8':'4'}\nRationale\nUse the given values.`).join('\n\n');
  try{
    expect((await db.from('questions_v2').insert({id:existingId,question_type:'spr',source:'generated',source_id:`existing-${run}`,stem_html:`<p>${stem}</p>`,options:[],correct_answer:{text:'["4"]'},is_published:true,is_broken:false})).error).toBeNull();
    const before=await db.from('questions_v2').select('*').eq('id',existingId).single();expect(before.error).toBeNull();
    // Direct RPC guards: no blanket bypass, stale review, identity conflict, or newly appeared match.
    const payload={id:randomUUID(),question_type:'spr',source_id:ids[0],source_external_id:ids[0],stem_html:`<p>${stem}</p>`,options:[],correct_answer:{text:'["8"]'},domain_name:'Algebra',skill_name:'Linear functions',difficulty:1,section:'M'};
    const insert=async(p:typeof payload & {reviewed_non_duplicates?:unknown})=>db.rpc('insert_reviewed_question',{p_question:p,p_batch:null,p_publish:true});
    expect((await insert(payload)).error?.message).toContain('duplicate');
    const reviewed=[{id:existingId,updated_at:before.data!.updated_at}];
    expect((await insert({...payload,reviewed_non_duplicates:[{id:existingId,updated_at:'2000-01-01'}]})).error?.message).toContain('duplicate');
    expect((await insert({...payload,source_id:`existing-${run}`,reviewed_non_duplicates:reviewed})).error?.message).toContain('identifier duplicate');
    expect((await db.from('questions_v2').insert({id:otherId,question_type:'spr',source:'generated',stem_html:`<p>${stem}</p>`,options:[],correct_answer:{text:'["9"]'}})).error).toBeNull();
    expect((await insert({...payload,reviewed_non_duplicates:reviewed})).error?.message).toContain('duplicate');
    expect((await db.from('questions_v2').delete().eq('id',otherId)).error).toBeNull();
    await page.context().clearCookies();await page.goto('/login',{waitUntil:'domcontentloaded',timeout:60_000});await page.getByLabel(/email/i).fill('admin@test.studyworks');await page.getByLabel('Password',{exact:true}).fill('devseed123');await page.getByRole('button',{name:/^log in$/i}).click();await page.waitForURL(u=>!u.pathname.includes('/login'));
    await page.goto('/admin/questions/import',{waitUntil:'domcontentloaded',timeout:60_000});
    await page.locator('input[name="export"]').setInputFiles({name:'approval.mmd',mimeType:'text/plain',buffer:Buffer.from(mmd)});
    await page.locator('input[name="metadata"]').setInputFiles({name:'metadata.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(metadata))});
    await page.getByRole('button',{name:'Compare with question bank',exact:true}).click();
    await expect(page.getByText(/4 questions · 1 with possible duplicates/)).toBeVisible();
    await page.getByRole('checkbox',{name:/Not a duplicate/}).check();
    const nav=page.getByRole('navigation',{name:'Imported questions'});
    await nav.getByRole('button',{name:new RegExp(ids[3])}).click();await page.getByRole('button',{name:'Needs editing',exact:true}).click();
    await page.getByRole('checkbox',{name:'Select all visible questions',exact:true}).check();
    await page.getByRole('button',{name:'Approve selected for import (4)',exact:true}).click();
    await expect(page.getByRole('region',{name:'Confirm selected imports'})).toContainText('Confirm 3 reviewed questions');
    await expect(page.getByText('3 approved for import. 1 skipped;', {exact:false})).toBeVisible();
    await page.getByRole('button',{name:'Confirm and import selected',exact:true}).click();
    await expect(page.getByText(/3 imported · 0 kept unchanged · 0 failed/)).toBeVisible();
    const saved=await db.from('questions_v2').select('id,source_id,is_published,correct_answer,pool').in('source_id',ids);expect(saved.error).toBeNull();expect(saved.data).toHaveLength(3);
    created.push(...saved.data!.map(q=>q.id));expect(saved.data!.every(q=>q.is_published&&q.pool==='standard')).toBe(true);
    expect(saved.data!.find(q=>q.source_id===ids[0])!.correct_answer).toEqual({text:'["8"]'});
    expect((await db.from('questions_v2').select('*').eq('id',existingId).single()).data).toEqual(before.data);
    await page.getByRole('checkbox',{name:'Select all visible questions',exact:true}).check();
    await expect(page.getByRole('button',{name:'Approve selected for import (1)',exact:true})).toBeVisible();
    await page.screenshot({path:'/private/tmp/import-batch-approval.png',fullPage:true});
    console.log('PASS: batch review, explicit false positive, unchanged existing row, and atomic duplicate guards.');
  }finally{
    const saved=await db.from('questions_v2').select('id').in('source_id',ids);created.push(...(saved.data??[]).map(q=>q.id));
    expect((await db.from('questions_v2').delete().in('id',[existingId,otherId,...created])).error).toBeNull();
    expect((await db.from('questions_v2').select('id').in('id',[existingId,otherId,...created])).data).toEqual([]);
  }
});
