'use server';

import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, actionOk } from '@/lib/api/response';
import { sectionFromDomain } from '@/lib/sat-import/section';
import { scorableAnswer } from '@/lib/sat-import/answers';
import { readReview } from '@/lib/sat-import/review';
import { renderRow } from '@/lib/content/render-math.mjs';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';

export async function listImportSets() {
  try {
    const { supabase } = await requireRole(['admin']);
    const [sets, grants, drafts] = await Promise.all([
      supabase.from('question_batches').select('id,label,source,administration_date').eq('pool','opt_in').order('created_at',{ascending:false}),
      supabase.from('question_batch_access').select('batch_id,user_id,profiles!question_batch_access_user_id_fkey(email,first_name,last_name)'),
      supabase.from('questions_v2').select('id,batch_id,source_id,display_code').eq('pool','opt_in').eq('is_published',false).is('deleted_at',null).order('created_at',{ascending:false}).limit(200),
    ]);
    if (sets.error || grants.error || drafts.error) throw new Error('Could not load supplemental sets. Check that the import migration is installed.');
    return actionOk({ sets:sets.data, grants:grants.data, drafts:drafts.data });
  } catch(error) { return actionFail(error instanceof Error ? error : 'Unable to load sets.'); }
}
export async function createImportSet(form: FormData) {
  try {
    const ctx = await requireRole(['admin']); assertWriter(ctx);
    const label=String(form.get('label') ?? '').trim(); const source=String(form.get('source') ?? '').trim();
    const date=String(form.get('date') ?? ''); const notes=String(form.get('notes') ?? '').trim();
    if (!label || !source || label.length>150 || source.length>150 || notes.length>2000 || (date && !/^\d{4}-\d{2}-\d{2}$/.test(date))) throw new Error('Provide a set name and source, with a valid optional date.');
    const {data,error}=await ctx.supabase.from('question_batches').insert({label,source,administration_date:date || null,notes:notes || null,pool:'opt_in',created_by:ctx.user.id}).select('id').single();
    if(error) throw new Error('Could not create the set. A set with this name and source may already exist.');
    return actionOk(data);
  } catch(error) { return actionFail(error instanceof Error ? error : 'Unable to create set.'); }
}
export async function changeSetAccess(batchId:string,userId:string,allow:boolean) {
  try {
    const ctx=await requireRole(['admin']); assertWriter(ctx);
    if(typeof userId!=='string' || !/^[0-9a-f-]{36}$/i.test(userId) || typeof allow!=='boolean') throw new Error('Select a user from the search results.');
    const batch=await ctx.supabase.from('question_batches').select('id').eq('id',batchId).eq('pool','opt_in').single();
    if(batch.error) throw new Error('Supplemental set not found.');
    const recipient=await ctx.supabase.from('profiles').select('id').eq('id',userId).single();
    if(recipient.error) throw new Error('That user account could not be found. Search again.');
    const result=allow ? await ctx.supabase.from('question_batch_access').upsert({batch_id:batchId,user_id:recipient.data.id,granted_by:ctx.user.id},{onConflict:'batch_id,user_id',ignoreDuplicates:true})
      : await ctx.supabase.from('question_batch_access').delete().eq('batch_id',batchId).eq('user_id',recipient.data.id);
    if(result.error) throw new Error('Could not change access.');
    return actionOk({allowed:allow});
  } catch(error) { return actionFail(error instanceof Error ? error : 'Unable to change access.'); }
}
export async function insertImportedQuestion(token:string,batchId:string | null,publish:boolean,confirmed:boolean,section:string='',notDuplicate:boolean=false) {
  try {
    const ctx=await requireRole(['admin']); assertWriter(ctx);
    if(confirmed!==true || typeof publish!=='boolean') throw new Error('Confirm the question and duplicate review first.');
    const secret=process.env.IMPORT_REVIEW_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!secret) throw new Error('Review signing is unavailable.');
    const review=readReview(token,secret,ctx.user.id);
    if(review.purpose!=='insert' || !review.details) throw new Error('Compare this question again to prepare an insertion.');
    if(review.duplicateMatches?.length && notDuplicate!==true) throw new Error('Confirm that the compared questions are not duplicates before importing as new.');
    const details=review.details;
    const knownSection=sectionFromDomain(details.domain_name);
    if(section && section!=='M' && section!=='RW') throw new Error('Choose Math or Reading & Writing.');
    if(knownSection && section && section!==knownSection) throw new Error('The selected section conflicts with the question metadata.');
    const selectedSection=knownSection || section;
    if(!selectedSection) throw new Error('Choose Math or Reading & Writing before importing.');
    if(publish && !details.hasAnswer) throw new Error('Questions without verified answers must be saved as drafts.');
    if(!batchId && (!details.domain_name || !details.skill_name || !details.difficulty)) throw new Error('Choose a supplemental set for questions without topic and difficulty metadata.');
    const rendered=renderRow(review.presentation);
    const {data,error}=await ctx.supabase.rpc('insert_reviewed_question',{
      p_question:{id:review.target,...details,reviewed_non_duplicates:review.duplicateMatches??[],section:selectedSection,...review.presentation,stem_rendered:rendered.stem_rendered,rationale_rendered:rendered.rationale_rendered,options_rendered:rendered.options_rendered},
      // Postgres accepts NULL for the standard pool; generated RPC types omit nullability.
      p_batch:batchId!,p_publish:publish,
    });
    if(error) throw new Error(error.message.includes('duplicate') ? 'A possible duplicate now exists. Compare again before importing.' : 'The import could not be confirmed. Retry the same review; it will not create a second copy.');
    const stored=await ctx.supabase.from('questions_v2').select('id,is_published,batch_id,display_code').eq('id',data).single();
    if(stored.error) throw new Error('Imported, but the saved record could not be read. Compare again before continuing.');
    if(stored.data.batch_id!==batchId) throw new Error('This review was already imported into another destination. Compare again to open the existing record.');
    return actionOk({id:data,published:stored.data.is_published,displayCode:stored.data.display_code});
  } catch(error) { return actionFail(error instanceof Error ? error : 'Unable to import question.'); }
}
export async function publishImportDraft(id:string,confirmed:boolean) {
  try {
    const ctx=await requireRole(['admin']); assertWriter(ctx);
    if(confirmed!==true) throw new Error('Verify the answer and question before publication.');
    const {data:q,error}=await ctx.supabase.from('questions_v2').select('id,question_type,correct_answer,updated_at').eq('id',id).eq('pool','opt_in').eq('is_published',false).eq('is_broken',false).is('deleted_at',null).single();
    if(error) throw new Error('Draft unavailable. Refresh the set list.');
    const answer=q.question_type==='mcq' ? extractMcqCorrectId(q.correct_answer) : formatSprCorrect(q.correct_answer);
    if(!scorableAnswer(q.question_type,answer)) throw new Error('Add a correct answer in the question editor first.');
    const result=await ctx.supabase.from('questions_v2').update({is_published:true,updated_by:ctx.user.id}).eq('id',q.id).eq('updated_at',q.updated_at!).select('id').maybeSingle();
    if(result.error || !result.data) throw new Error('The draft changed. Refresh and review it again.');
    return actionOk({id:q.id});
  } catch(error) { return actionFail(error instanceof Error ? error : 'Unable to publish draft.'); }
}
export type ImportSetsResult = Awaited<ReturnType<typeof listImportSets>>;


export async function searchImportUsers(search:string) {
  try {
    const {supabase}=await requireRole(['admin']);
    if(typeof search!=='string' || search.length>100) throw new Error('Search by a name or email, up to 100 characters.');
    const terms=search.replace(/[^\p{L}\p{N}@. _-]/gu,'').trim().split(/\s+/).filter(Boolean).slice(0,4);
    if(terms.join('').length<2) return actionOk({users:[]});
    let query=supabase.from('profiles').select('id,first_name,last_name,email,role').is('banned_at',null);
    // Only constrained search terms enter the PostgREST OR expression. Each
    // term must match a name or email; multi-word names work in either order.
    for(const term of terms) query=query.or(`first_name.ilike.%${term}%,last_name.ilike.%${term}%,email.ilike.%${term}%`);
    const {data,error}=await query.order('first_name',{ascending:true}).order('id').limit(20);
    if(error) throw new Error('User search is unavailable. Please try again.');
    return actionOk({users:data});
  }catch(error){return actionFail(error instanceof Error?error:'Unable to search users.');}
}
