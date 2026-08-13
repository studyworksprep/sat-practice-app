'use server';

import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { assertWriter, requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';

const VALID_KINDS = new Set(['standard', 'foundation']);
const VALID_SECTIONS = new Set(['math', 'reading_writing']);
const EDITABLE_STATES = new Set(['draft', 'changes_requested']);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function tutorContext() {
  const ctx = await requireRole(['teacher', 'manager']);
  assertWriter(ctx);
  return ctx;
}

async function editableRevision(revisionId: string) {
  const ctx = await tutorContext();
  const { data: revision } = await ctx.supabase
    .from('lesson_revisions')
    .select('id, owner_id, state')
    .eq('id', revisionId)
    .eq('owner_id', ctx.user.id)
    .maybeSingle();
  if (!revision || !EDITABLE_STATES.has(revision.state)) {
    throw new ApiError('This draft is not editable.', 403);
  }
  return ctx;
}

function revisionIdFrom(formData: FormData) {
  return String(formData.get('lesson_id') || '').trim();
}

export async function updateRevisionMetadata(_prev: unknown, formData: FormData) {
  const revisionId = revisionIdFrom(formData);
  if (!revisionId) return actionFail('Draft id required.');
  let ctx;
  try { ctx = await editableRevision(revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to save metadata.');
  }

  const title = String(formData.get('title') || '').trim();
  const description = String(formData.get('description') || '').trim() || null;
  const kind = String(formData.get('kind') || 'standard');
  if (!title) return actionFail('Title is required.');
  if (!VALID_KINDS.has(kind)) return actionFail('Invalid lesson kind.');
  const parsedSequence = Number.parseInt(String(formData.get('foundation_sequence') || ''), 10);
  const foundationSequence = kind === 'foundation' && Number.isInteger(parsedSequence)
    ? parsedSequence
    : null;

  const { error } = await ctx.supabase.from('lesson_revisions').update({
    title,
    description,
    kind,
    foundation_sequence: foundationSequence,
  }).eq('id', revisionId);
  if (error) return actionFail(`Failed: ${error.message}`);
  revalidateDraft(revisionId);
  return actionOk({ savedAt: Date.now() });
}

export async function saveRevisionBlocks(_prev: unknown, formData: FormData) {
  const revisionId = revisionIdFrom(formData);
  const blocksJson = formData.get('blocks');
  if (!revisionId) return actionFail('Draft id required.');
  if (typeof blocksJson !== 'string') return actionFail('Blocks required.');
  let ctx;
  try { ctx = await editableRevision(revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to save blocks.');
  }

  let parsed: any[]; // eslint-disable-line @typescript-eslint/no-explicit-any
  try { parsed = JSON.parse(blocksJson); }
  catch (err) { return actionFail(`Could not parse blocks: ${err instanceof Error ? err.message : String(err)}`); }
  if (!Array.isArray(parsed)) return actionFail('Blocks must be an array.');

  const validation = validateLessonBlocks(parsed.map((block, index) => ({
    ...block,
    id: block?.id ?? block?.content?.id ?? `index:${index}`,
  })));
  if (!validation.ok) {
    return actionFail(`Validation failed: ${validation.errors.map((e: any) => e.message).join('; ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  const rows = parsed.map((block, index) => ({
    id: typeof block?.id === 'string' && UUID_RE.test(block.id) ? block.id : randomUUID(),
    revision_id: revisionId,
    source_block_id:
      typeof block?.source_block_id === 'string' && UUID_RE.test(block.source_block_id)
        ? block.source_block_id
        : null,
    sort_order: typeof block?.sort_order === 'number' ? block.sort_order : index,
    block_type: block?.block_type,
    content: block?.content || {},
  }));

  const { error: deleteError } = await ctx.supabase
    .from('lesson_revision_blocks').delete().eq('revision_id', revisionId);
  if (deleteError) return actionFail(`Failed to clear blocks: ${deleteError.message}`);
  if (rows.length > 0) {
    const { error } = await ctx.supabase.from('lesson_revision_blocks').insert(rows);
    if (error) return actionFail(`Failed to insert blocks: ${error.message}`);
  }
  await ctx.supabase.from('lesson_revisions').update({ updated_at: new Date().toISOString() }).eq('id', revisionId);
  revalidateDraft(revisionId);
  return actionOk({ savedAt: Date.now(), blockCount: rows.length, warnings: validation.warnings ?? [] });
}

export async function addRevisionTopic(_prev: unknown, formData: FormData) {
  const revisionId = revisionIdFrom(formData);
  if (!revisionId) return actionFail('Draft id required.');
  let ctx;
  try { ctx = await editableRevision(revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to add a tag.');
  }

  const section = String(formData.get('section') || '');
  const domainName = String(formData.get('domain_name') || '');
  const skillCode = String(formData.get('skill_code') || '');
  let row;
  if (section) {
    if (!VALID_SECTIONS.has(section)) return actionFail('Invalid section.');
    row = { revision_id: revisionId, section };
  } else if (domainName) {
    row = { revision_id: revisionId, domain_name: domainName, skill_code: skillCode || null };
  } else {
    return actionFail('Pick a section or skill.');
  }
  const { error } = await ctx.supabase.from('lesson_revision_topics').insert(row);
  if (error) {
    if (error.code === '23505') return actionFail('That tag already exists.');
    return actionFail(`Failed: ${error.message}`);
  }
  await ctx.supabase.from('lesson_revisions').update({ updated_at: new Date().toISOString() }).eq('id', revisionId);
  revalidateDraft(revisionId);
  return actionOk({ savedAt: Date.now() });
}

export async function removeRevisionTopic(_prev: unknown, formData: FormData) {
  const revisionId = revisionIdFrom(formData);
  const topicId = String(formData.get('topic_id') || '');
  if (!revisionId || !topicId) return actionFail('Draft and topic ids are required.');
  let ctx;
  try { ctx = await editableRevision(revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to remove the tag.');
  }
  const { error } = await ctx.supabase.from('lesson_revision_topics')
    .delete().eq('id', topicId).eq('revision_id', revisionId);
  if (error) return actionFail(`Failed: ${error.message}`);
  await ctx.supabase.from('lesson_revisions').update({ updated_at: new Date().toISOString() }).eq('id', revisionId);
  revalidateDraft(revisionId);
  return actionOk({ savedAt: Date.now() });
}

export async function deleteRevision(_prev: unknown, formData: FormData) {
  const revisionId = revisionIdFrom(formData);
  if (!revisionId) return actionFail('Draft id required.');
  if (formData.get('confirm') !== 'DELETE') return actionFail('Type DELETE to confirm.');
  let ctx;
  try { ctx = await editableRevision(revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to delete the draft.');
  }
  const { error } = await ctx.supabase.from('lesson_revisions').delete().eq('id', revisionId);
  if (error) return actionFail(`Failed: ${error.message}`);
  redirect('/tutor/lessons');
}

export async function submitRevision(formData: FormData) {
  const revisionId = String(formData.get('revision_id') || '').trim();
  const summary = String(formData.get('change_summary') || '').trim();
  if (!revisionId) return actionFail('Draft id required.');
  if (summary.length < 10) return actionFail('Please give the reviewer a short summary of your lesson or changes.');
  let ctx;
  try { ctx = await editableRevision(revisionId); }
  catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unable to submit the draft.');
  }
  const { data: blocks } = await ctx.supabase.from('lesson_revision_blocks')
    .select('id, source_block_id, sort_order, block_type, content').eq('revision_id', revisionId).order('sort_order');
  if (!blocks || blocks.length === 0) return actionFail('Add and save at least one block before submitting.');
  const validation = validateLessonBlocks(blocks);
  if (!validation.ok) return actionFail(`Fix validation errors before submitting: ${validation.errors.map((e: any) => e.message).join('; ')}`); // eslint-disable-line @typescript-eslint/no-explicit-any

  const { error } = await ctx.supabase.from('lesson_revisions').update({
    state: 'submitted',
    change_summary: summary,
    submitted_at: new Date().toISOString(),
    review_note: null,
    reviewer_id: null,
    reviewed_at: null,
  }).eq('id', revisionId);
  if (error) return actionFail(`Failed: ${error.message}`);
  redirect(`/tutor/lessons/drafts/${revisionId}?submitted=1`);
}

function revalidateDraft(revisionId: string) {
  revalidatePath(`/tutor/lessons/drafts/${revisionId}`);
  revalidatePath('/tutor/lessons');
}
