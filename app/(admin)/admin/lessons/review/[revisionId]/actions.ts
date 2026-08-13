'use server';

import { redirect } from 'next/navigation';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';

type ReviewState = { ok: boolean; error?: string } | null;

async function adminContext() {
  const ctx = await requireRole(['admin']);
  assertWriter(ctx);
  return ctx;
}

async function submittedRevision(ctx: any, revisionId: string) { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data } = await ctx.supabase.from('lesson_revisions')
    .select('id, state').eq('id', revisionId).maybeSingle();
  if (!data || data.state !== 'submitted') throw new ApiError('This proposal is no longer awaiting review.', 409);
  return data;
}

export async function requestRevisionChanges(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const revisionId = String(formData.get('revision_id') || '');
  const note = String(formData.get('review_note') || '').trim();
  if (!revisionId) return actionFail('Revision id required.');
  if (note.length < 5) return actionFail('Explain the changes the contributor should make.');
  let ctx;
  try { ctx = await adminContext(); await submittedRevision(ctx, revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to review this proposal.');
  }
  const { error } = await ctx.supabase.from('lesson_revisions').update({
    state: 'changes_requested', review_note: note, reviewer_id: ctx.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', revisionId);
  if (error) return actionFail(error.message);
  redirect('/admin/lessons/review?changes_requested=1');
}

export async function rejectRevision(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const revisionId = String(formData.get('revision_id') || '');
  const note = String(formData.get('review_note') || '').trim();
  if (!revisionId) return actionFail('Revision id required.');
  if (note.length < 5) return actionFail('Explain why the proposal is being rejected.');
  let ctx;
  try { ctx = await adminContext(); await submittedRevision(ctx, revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to review this proposal.');
  }
  const { error } = await ctx.supabase.from('lesson_revisions').update({
    state: 'rejected', review_note: note, reviewer_id: ctx.user.id,
    reviewed_at: new Date().toISOString(),
  }).eq('id', revisionId);
  if (error) return actionFail(error.message);
  redirect('/admin/lessons/review?rejected=1');
}

export async function publishRevision(_prev: ReviewState, formData: FormData): Promise<ReviewState> {
  const revisionId = String(formData.get('revision_id') || '');
  const note = String(formData.get('review_note') || '').trim() || null;
  const force = formData.get('force') === '1';
  if (!revisionId) return actionFail('Revision id required.');
  let ctx;
  try { ctx = await adminContext(); await submittedRevision(ctx, revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to publish this proposal.');
  }

  const { data: blocks } = await ctx.supabase.from('lesson_revision_blocks')
    .select('id, source_block_id, sort_order, block_type, content').eq('revision_id', revisionId).order('sort_order');
  const validation = validateLessonBlocks(blocks ?? []);
  if (!blocks?.length) return actionFail('A lesson needs at least one block.');
  if (!validation.ok) {
    return actionFail(`Validation failed: ${validation.errors.map((e: any) => e.message).join('; ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  if (note) {
    const { error: noteError } = await ctx.supabase.from('lesson_revisions')
      .update({ review_note: note }).eq('id', revisionId);
    if (noteError) return actionFail(noteError.message);
  }
  const { data: lessonId, error } = await ctx.supabase.rpc('publish_lesson_revision', {
    p_revision_id: revisionId,
    p_force: force,
  });
  if (error || !lessonId) return actionFail(error?.message ?? 'The proposal was not published.');
  redirect(`/admin/lessons/${lessonId}?published_revision=1`);
}
