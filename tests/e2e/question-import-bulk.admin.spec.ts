import {test,expect} from '@playwright/test';
import {createClient} from '@supabase/supabase-js';
import {loadEnvFile} from 'node:process';
import {randomUUID} from 'node:crypto';

test('reviewed mixed bulk import preserves choices, reports failures and excludes completed items',async({page,baseURL})=>{
  test.skip(process.env.E2E_IMPORT_BULK!=='1','Opt in to temporary development records.');
  test.setTimeout(120_000);page.setDefaultTimeout(12_000);loadEnvFile('.env.local');
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL!;
  expect(new URL(url).hostname).toBe('ikzhizgsawzjpuuznfid.supabase.co');expect(['localhost','127.0.0.1']).toContain(new URL(baseURL!).hostname);
  const db=createClient(url,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
  expect((await db.auth.signInWithPassword({email:'admin@test.studyworks',password:'devseed123'})).error).toBeNull();
  await page.context().clearCookies();
  const run=randomUUID(), label=`Bulk review test ${run}`, ids=Array.from({length:5},(_,i)=>`bulk-${run}-${i}`);
  let batchId='';const existingIds=[randomUUID(),randomUUID(),randomUUID()];
  try {
    await page.goto('/login');await page.getByLabel(/email/i).fill('admin@test.studyworks');await page.getByLabel('Password',{exact:true}).fill('devseed123');await page.getByRole('button',{name:/^log in$/i}).click();await page.waitForURL(u=>!u.pathname.includes('/login'));
    await page.goto('/admin/questions/import');await page.setViewportSize({width:1440,height:1000});
    await page.locator('summary').filter({hasText:'Supplemental sets & student access'}).click();await page.getByText('Create a new set',{exact:true}).click();
    await page.getByLabel('Set name',{exact:true}).fill(label);await page.getByLabel('Source',{exact:true}).fill('Bulk integration test');await page.getByRole('button',{name:'Create supplemental set',exact:true}).click();await expect(page.getByText('Set created. You can now choose it as an import destination.')).toBeVisible();
    const batch=await db.from('question_batches').select('id').eq('label',label).single();expect(batch.error).toBeNull();batchId=batch.data!.id;
    const fixtures=existingIds.map((id,i)=>({id,batch_id:batchId,pool:'opt_in',is_published:true,question_type:'spr',source:'generated',source_id:ids[i+2],display_code:`BULK-${run.slice(0,5)}-${i}`,stem_html:`<p>Fixture ${run} question ${i+2}: what is 2 + 2?</p>`,rationale_html:'<p>Four.</p>',options:[],correct_answer:{text:'["4"]'}}));
    expect((await db.from('questions_v2').insert(fixtures)).error).toBeNull();
    const before=await db.from('questions_v2').select('*').in('id',existingIds);expect(before.error).toBeNull();
    const mmd=ids.map((id,i)=>`\\section*{Question ID: ${id}}\nQuestion\nFixture ${run} question ${i}: what is $2+2$?${i===1?'':'\nCorrect Answer: 4'}\nRationale\nFour.`).join('\n\n');
    await page.locator('input[name="export"]').setInputFiles({name:'bulk.mmd',mimeType:'text/plain',buffer:Buffer.from(mmd)});await page.getByRole('button',{name:'Compare with question bank',exact:true}).click();await expect(page.getByText(/5 questions · 3 with possible duplicates/)).toBeVisible();
    const nav=page.getByRole('navigation',{name:'Imported questions'});
    const pick=async(i:number)=>{await nav.getByRole('button',{name:new RegExp(ids[i])}).click();};
    const approve=async()=>{await page.getByRole('checkbox',{name:/Reviewed and ready/}).check();};
    await nav.getByRole('checkbox',{name:`Select ${ids[0]} for import`,exact:true}).check();
    await expect(page.getByRole('button',{name:'Import all selected (1)',exact:true})).toBeDisabled();
    for(let i=0;i<5;i++) {
      await pick(i);await page.getByRole('button',{name:i===4?'Keep existing':'Prefer imported',exact:true}).click();
      if(i<2)await page.getByRole('combobox',{name:'SAT section',exact:true}).selectOption(i===0?'M':'RW');
      if(i===0)await page.getByRole('combobox',{name:'Availability',exact:true}).selectOption('published');
      if(i===1)await expect(page.getByRole('combobox',{name:'Availability',exact:true})).toHaveValue('draft');
      await approve();
    }
    // Returning to an item retains its own reviewed choice and availability.
    await pick(0);await expect(page.getByRole('checkbox',{name:/Reviewed and ready/})).toBeChecked();await expect(page.getByRole('combobox',{name:'Availability',exact:true})).toHaveValue('published');
    await page.getByRole('combobox',{name:'Availability',exact:true}).selectOption('draft');await expect(page.getByRole('checkbox',{name:/Reviewed and ready/})).not.toBeChecked();
    await pick(1);await expect(page.getByRole('checkbox',{name:/Reviewed and ready/})).toBeChecked();
    await pick(0);await page.getByRole('combobox',{name:'Availability',exact:true}).selectOption('published');await approve();
    await page.getByRole('button',{name:'Select reviewed',exact:true}).click();
    await expect(page.getByRole('button',{name:'Import all selected (5)',exact:true})).toBeEnabled();
    // A stale replacement fails, but later replacements and keeps still finish.
    expect((await db.from('questions_v2').update({difficulty:2}).eq('id',existingIds[0])).error).toBeNull();
    await page.getByRole('button',{name:'Import all selected (5)',exact:true}).click();
    await expect(page.getByRole('region',{name:'Confirm selected imports'})).toContainText('Keep existing · no change');
    await page.getByRole('button',{name:'Confirm and import selected',exact:true}).click();
    await expect(page.getByText(/3 imported · 1 kept unchanged · 1 failed/)).toBeVisible();
    await expect(page.getByRole('button',{name:'Import all selected (1)',exact:true})).toBeEnabled();
    const saved=await db.from('questions_v2').select('*').eq('batch_id',batchId);expect(saved.data).toHaveLength(5);
    expect(saved.data!.find(q=>q.source_id===ids[0])!.is_published).toBe(true);expect(saved.data!.find(q=>q.source_id===ids[1])!.is_published).toBe(false);
    for (let i=0;i<2;i++) {
      const q=saved.data!.find(q=>q.source_id===ids[i])!;
      expect(q.display_code).toMatch(i===0?/^M-\d{5,}$/:/^RW-\d{5,}$/);
      expect(q.domain_code).toBeNull();expect(q.domain_name).toBeNull();expect(q.difficulty).toBeNull();
    }
    expect(saved.data!.find(q=>q.id===existingIds[0])!.stem_html).toBe(fixtures[0].stem_html);
    expect(saved.data!.find(q=>q.id===existingIds[1])!.stem_html).not.toBe(fixtures[1].stem_html);
    expect(saved.data!.find(q=>q.id===existingIds[2])).toEqual(before.data!.find(q=>q.id===existingIds[2]));
    await pick(2);await expect(page.getByRole('region',{name:'Question review'}).getByRole('alert')).toContainText('This question changed or was already applied.');
    const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Export review choices',exact:true}).click();const download=await downloadPromise;const stream=await download.createReadStream();let content='';for await(const chunk of stream!)content+=chunk.toString();const report=JSON.parse(content);
    expect(report.items.filter((q:{outcome:{status:string}})=>q.outcome.status==='success')).toHaveLength(3);expect(report.items[2].outcome.status).toBe('error');
    // Search and grants use names; the account ID drives writes.
    await page.locator('summary').filter({hasText:'Supplemental sets & student access'}).click();
    // A details element may have remained open; ensure the user search is visible.
    if(!await page.getByRole('searchbox',{name:'Find a user',exact:true}).isVisible())await page.locator('summary').filter({hasText:'Supplemental sets & student access'}).click();
    await page.getByRole('searchbox',{name:'Find a user',exact:true}).fill('student1@test.studyworks');await page.getByRole('button',{name:'Search users',exact:true}).click();
    const student=await db.from('profiles').select('id,first_name,last_name').eq('email','student1@test.studyworks').single();expect(student.error).toBeNull();const fullName=[student.data!.first_name,student.data!.last_name].filter(Boolean).join(' ')||'Unnamed account';
    await page.getByRole('button',{name:`Grant access to ${fullName}`,exact:true}).click();await expect(page.getByRole('list',{name:'People with access'})).toContainText(fullName);
    if(fullName!=='Unnamed account')await expect(page.getByRole('list',{name:'People with access'})).not.toContainText('student1@test.studyworks');
    await page.getByRole('button',{name:`Revoke access for ${fullName}`,exact:true}).click();await expect(page.getByRole('list',{name:'People with access'}).getByRole('listitem')).toHaveCount(0);
    await page.screenshot({path:'/private/tmp/import-facelift-desktop.png',fullPage:true});
    await page.setViewportSize({width:390,height:844});await expect(page.getByRole('button',{name:'Import all selected (1)',exact:true})).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
    await page.screenshot({path:'/private/tmp/import-facelift-mobile.png',fullPage:true});
    console.log('PASS: persistent per-question reviews, selection gating, mixed bulk results, names/search, and responsive layout.');
  }finally{
    const batches=await db.from('question_batches').select('id').eq('label',label);
    for(const b of batches.data??[]){expect((await db.from('questions_v2').delete().eq('batch_id',b.id)).error).toBeNull();expect((await db.from('question_batches').delete().eq('id',b.id)).error).toBeNull();}
    expect((await db.from('question_batches').select('id').eq('label',label)).data).toEqual([]);console.log('CLEANUP: temporary bulk fixtures removed.');
  }
});
