import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';

test('supplemental import, drafts, duplicates and per-student access',async({page,baseURL})=>{
  test.skip(process.env.E2E_IMPORT_SETS!=='1','Opt in to temporary development fixtures.');
  test.setTimeout(180_000);loadEnvFile('.env.local');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(new URL(url).hostname).toBe('ikzhizgsawzjpuuznfid.supabase.co');
  expect(['localhost','127.0.0.1']).toContain(new URL(baseURL!).hostname);
  const client=()=>createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  const admin=client(),student=client(),other=client();
  for(const [db,email] of [[admin,'admin@test.studyworks'],[student,'student1@test.studyworks'],[other,'student2@test.studyworks']] as const) expect((await db.auth.signInWithPassword({email,password:'devseed123'})).error).toBeNull();
  const label='Import access test '+randomUUID();let batchId='';const regularSource='regular-'+randomUUID();
  const text=`## Question 1\nTest ${label}: what is $2+2$?\nA. 3\nB. 4\nC. 5\nD. 6\nCorrect Answer: B\nRationale\nAdding gives four.\n\n## Question 2\nTest ${label}: what is $3+3$?`;
  try {
    await page.goto('/login');await page.getByLabel(/email/i).fill('admin@test.studyworks');await page.getByLabel('Password',{exact:true}).fill('devseed123');await page.getByRole('button',{name:/^log in$/i}).click();await page.waitForURL(u=>!u.pathname.includes('/login'));
    await page.goto('/admin/questions/import');
    await page.getByLabel('Set name',{exact:true}).fill(label);await page.getByLabel('Source',{exact:true}).fill('Development test');
    await page.getByRole('button',{name:'Create supplemental set',exact:true}).click();
    await expect(page.getByText('Set created. Select it as the destination below.')).toBeVisible();
    const batch=await admin.from('question_batches').select('id').eq('label',label).single();expect(batch.error).toBeNull();batchId=batch.data!.id;
    await page.locator('input[name="export"]').setInputFiles({name:'numbered.mmd',mimeType:'text/plain',buffer:Buffer.from(text)});
    await page.getByRole('button',{name:'Compare with question bank',exact:true}).click();
    await expect(page.getByText(/2 questions · 0 with possible duplicates/)).toBeVisible();
    await page.getByRole('checkbox',{name:/Publish for practice/}).check();
    await page.getByRole('checkbox',{name:/I reviewed the question, checked for duplicates/}).check();
    await page.getByRole('combobox',{name:'Destination',exact:true}).selectOption('regular');
    await page.getByRole('checkbox',{name:/I reviewed the question, checked for duplicates/}).check();
    await page.getByRole('button',{name:'Import and publish question',exact:true}).click();
    await expect(page.getByRole('region',{name:'Import new question'})).toContainText('Choose a supplemental set for questions without topic and difficulty metadata.');
    await page.getByRole('combobox',{name:'Destination',exact:true}).selectOption('supplemental');
    await page.getByRole('checkbox',{name:/I reviewed the question, checked for duplicates/}).check();
    await page.getByRole('button',{name:'Import and publish question',exact:true}).click();
    await expect(page.getByRole('region',{name:'Import new question'})).toContainText('Imported.');
    await page.getByRole('navigation',{name:'Imported questions'}).getByRole('button').nth(1).click();
    await expect(page.getByRole('checkbox',{name:/Publish for practice/})).toBeDisabled();
    await page.getByRole('checkbox',{name:/I reviewed the question, checked for duplicates/}).check();
    await page.getByRole('button',{name:'Save question as draft',exact:true}).click();
    await expect(page.getByRole('region',{name:'Import new question'})).toContainText('Imported.');
    let questions=await admin.from('questions_v2').select('*').eq('batch_id',batchId);
    expect(questions.error).toBeNull();expect(questions.data).toHaveLength(2);
    const published=questions.data!.find(q=>q.is_published)!;const draft=questions.data!.find(q=>!q.is_published)!;
    const anonymous=client();
    const anonymousSets=await anonymous.from('question_batches').select('id').eq('id',batchId);
    expect(anonymousSets.data ?? []).toEqual([]);
    if(anonymousSets.error) expect(anonymousSets.error.code).toBe('42501');
    const anonymousQuestions=await anonymous.from('questions_v2').select('id').eq('id',published.id);
    expect(anonymousQuestions.data ?? []).toEqual([]);
    if(anonymousQuestions.error) expect(anonymousQuestions.error.code).toBe('42501');
    expect(published.pool).toBe('opt_in');expect(published.difficulty).toBeNull();expect(published.skill_name).toBeNull();
    expect((await student.from('questions_v2').select('id').eq('batch_id',batchId)).data).toEqual([]);
    expect((await student.from('published_question_batches').select('id').eq('id',batchId)).data).toEqual([]);
    await page.getByLabel('Student account email',{exact:true}).fill('student1@test.studyworks');await page.getByRole('button',{name:'Grant access',exact:true}).click();await expect(page.getByText('Student access granted.',{exact:true})).toBeVisible();
    expect((await student.from('questions_v2').select('id').eq('batch_id',batchId)).data).toEqual([{id:published.id}]);
    expect((await student.from('questions_v2').select('id').eq('pool','standard').eq('id',published.id)).data).toEqual([]);
    expect((await other.from('questions_v2').select('id').eq('id',published.id)).data).toEqual([]);
    expect((await student.from('published_question_batches').select('question_count').eq('id',batchId)).data).toEqual([{question_count:1}]);
    expect((await student.from('question_batch_access').insert({batch_id:batchId,user_id:(await other.auth.getUser()).data.user!.id})).error).not.toBeNull();
    // Duplicate checks cover source IDs and differently numbered identical prompts.
    await page.getByRole('button',{name:'Compare with question bank',exact:true}).click();
    await expect(page.getByRole('button',{name:'Compare with question bank',exact:true})).toBeEnabled();
    await expect(page.getByText(/2 questions · 2 with possible duplicates/)).toBeVisible();
    const duplicate=await admin.rpc('insert_reviewed_question',{p_question:{...published,id:randomUUID(),source_id:randomUUID(),source_external_id:randomUUID()},p_batch:batchId,p_publish:true});
    expect(duplicate.error?.message).toContain('duplicate');
    // Grant does not expose unanswered drafts; publication requires a reviewed answer.
    await page.getByRole('button',{name:'Refresh sets and drafts',exact:true}).click();
    await page.getByRole('checkbox',{name:'I verified the question and answer',exact:true}).check();
    await page.getByRole('button',{name:'Publish verified draft',exact:true}).click();
    await expect(page.getByText('Add a correct answer in the question editor first.',{exact:true})).toBeVisible();
    expect((await admin.from('questions_v2').update({correct_answer:{text:'["6"]'}}).eq('id',draft.id)).error).toBeNull();
    await page.getByRole('button',{name:'Publish verified draft',exact:true}).click();
    await expect(page.getByText('Published within this restricted set.',{exact:true})).toBeVisible();
    expect((await student.from('questions_v2').select('id').eq('batch_id',batchId)).data).toHaveLength(2);
    await page.getByRole('button',{name:'Revoke access',exact:true}).click();await expect(page.getByText('Access revoked.',{exact:true})).toBeVisible();
    expect((await student.from('questions_v2').select('id').eq('id',published.id)).data).toEqual([]);
    questions=await admin.from('questions_v2').select('id').eq('batch_id',batchId);expect(questions.data).toHaveLength(2);
    // Fully tagged questions can instead enter the regular bank.
    await page.locator('input[name="export"]').setInputFiles({name:'regular.mmd',mimeType:'text/plain',buffer:Buffer.from(`\\section*{Question ID: ${regularSource}}\nQuestion\nRegular ${label}: what is $4+4$?\nCorrect Answer: 8`)});
    await page.locator('input[name="metadata"]').setInputFiles({name:'metadata.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify([{questionId:regularSource,primary_class_cd_desc:'Algebra',skill_desc:'Linear equations in one variable',difficulty:'E',score_band_range_cd:1}]))});
    await page.getByRole('button',{name:'Compare with question bank',exact:true}).click();
    await expect(page.getByRole('button',{name:'Compare with question bank',exact:true})).toBeEnabled();
    await expect(page.getByText(/1 questions · 0 with possible duplicates/)).toBeVisible();
    await page.getByRole('combobox',{name:'Destination',exact:true}).selectOption('regular');
    await page.getByRole('checkbox',{name:/Publish for practice/}).check();
    await page.getByRole('checkbox',{name:/I reviewed the question, checked for duplicates/}).check();
    await page.getByRole('button',{name:'Import and publish question',exact:true}).click();
    await expect(page.getByRole('region',{name:'Import new question'})).toContainText('Imported.');
    const regular=await admin.from('questions_v2').select('id,pool,batch_id,difficulty').eq('source_id',regularSource).single();
    expect(regular.error).toBeNull();expect(regular.data!.pool).toBe('standard');expect(regular.data!.batch_id).toBeNull();expect(regular.data!.difficulty).toBe(1);
    expect((await student.from('questions_v2').select('id').eq('id',regular.data!.id)).data).toHaveLength(1);
    console.log('PASS: supplemental publication, held draft, duplicate rejection, grants, revocation and isolation from standard practice.');
  } finally {
    expect((await admin.from('questions_v2').delete().eq('source_id',regularSource)).error).toBeNull();
    const batches=await admin.from('question_batches').select('id').eq('label',label);
    for(const b of batches.data??[]) {
      expect((await admin.from('questions_v2').delete().eq('batch_id',b.id)).error).toBeNull();
      expect((await admin.from('question_batches').delete().eq('id',b.id)).error).toBeNull();
    }
    expect((await admin.from('question_batches').select('id').eq('label',label)).data).toEqual([]);
    console.log('CLEANUP: test set, questions and grants removed.');
  }
});
