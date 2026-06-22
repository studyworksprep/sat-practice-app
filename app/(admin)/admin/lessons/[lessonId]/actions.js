// Server Actions for the per-lesson admin editor.
//
//   updateLessonMetadata — title, description, status, visibility.
//   saveLessonBlocks     — full replace; re-validates with
//                          validateLessonBlocks before any write.
//   deleteLesson         — hard delete, cascade kills blocks +
//                          assignments + progress (FK on delete).

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';

const VALID_STATUSES = new Set(['draft', 'published', 'archived']);
const VALID_VISIBILITIES = new Set(['shared', 'private']);

const QUESTION_CARD_COLUMNS =
  'id, display_code, question_type, domain_name, skill_name, difficulty, score_band, stem_html';

async function adminCtx() {
  return requireRole(['admin']);
}

export async function updateLessonMetadata(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const lessonId = formData.get('lesson_id');
  const title = formData.get('title');
  const description = formData.get('description');
  const status = formData.get('status');
  const visibility = formData.get('visibility');

  if (typeof lessonId !== 'string' || !lessonId) return actionFail('lesson_id required');
  if (typeof title !== 'string' || !title.trim()) return actionFail('Title is required');
  if (typeof status !== 'string' || !VALID_STATUSES.has(status)) {
    return actionFail('Invalid status');
  }
  if (typeof visibility !== 'string' || !VALID_VISIBILITIES.has(visibility)) {
    return actionFail('Invalid visibility');
  }

  const { error } = await ctx.supabase
    .from('lessons')
    .update({
      title: title.trim(),
      description:
        typeof description === 'string' && description.trim()
          ? description.trim()
          : null,
      status,
      visibility,
      updated_at: new Date().toISOString(),
    })
    .eq('id', lessonId);

  if (error) return actionFail(`Failed: ${error.message}`);

  revalidatePath(`/admin/lessons/${lessonId}`);
  revalidatePath('/admin/lessons');
  return actionOk({ savedAt: Date.now() });
}

export async function saveLessonBlocks(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const lessonId = formData.get('lesson_id');
  const blocksJson = formData.get('blocks');
  if (typeof lessonId !== 'string' || !lessonId) return actionFail('lesson_id required');
  if (typeof blocksJson !== 'string' || !blocksJson) return actionFail('blocks required');

  let parsed;
  try {
    parsed = JSON.parse(blocksJson);
  } catch (err) {
    return actionFail(`Could not parse blocks JSON: ${err.message}`);
  }
  if (!Array.isArray(parsed)) return actionFail('blocks must be an array');

  // Validation accepts the in-memory shape (id at the top level for
  // branch-target resolution). The DB row id is a uuid the server
  // assigns on insert.
  const forValidation = parsed.map((block, index) => ({
    ...block,
    id: block?.id ?? block?.content?.id ?? `index:${index}`,
  }));
  const validation = validateLessonBlocks(forValidation);
  if (!validation.ok) {
    return actionFail(
      `Validation failed: ${validation.errors
        .map((e) => `${e.blockId ?? '?'}: ${e.message}`)
        .join('; ')}`,
      { validationErrors: validation.errors },
    );
  }

  const rows = parsed.map((b, i) => ({
    lesson_id: lessonId,
    sort_order: typeof b.sort_order === 'number' ? b.sort_order : i,
    block_type: b.block_type,
    content: b.content || {},
  }));

  // Same delete + insert flow as the legacy PUT route. The blocks
  // table has a FK from progress.completed_blocks (uuid[]) but
  // those are array refs, not FKs, so wiping rows here doesn't
  // cascade. Stale completion arrays are accepted as the cost of
  // letting admins iterate on lesson content.
  const { error: deleteErr } = await ctx.supabase
    .from('lesson_blocks')
    .delete()
    .eq('lesson_id', lessonId);
  if (deleteErr) return actionFail(`Failed to clear blocks: ${deleteErr.message}`);

  if (rows.length > 0) {
    const { error: insertErr } = await ctx.supabase
      .from('lesson_blocks')
      .insert(rows);
    if (insertErr) return actionFail(`Failed to insert blocks: ${insertErr.message}`);
  }

  await ctx.supabase
    .from('lessons')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', lessonId);

  revalidatePath(`/admin/lessons/${lessonId}`);
  revalidatePath('/admin/lessons');
  return actionOk({
    savedAt: Date.now(),
    blockCount: rows.length,
    warnings: validation.warnings ?? [],
  });
}

// Search the published question bank for the practice-question
// (question_link) block picker. Called directly (object arg, not a
// form action). Mirrors the tutor lesson-pack search but admin-gated
// and trimmed to the fields the picker renders.
export async function searchQuestionBank(input) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  let query = ctx.supabase
    .from('questions_v2')
    .select(QUESTION_CARD_COLUMNS, { count: 'exact' })
    .eq('is_published', true)
    .eq('is_broken', false);

  const q = (input?.q ?? '').trim();
  if (q) {
    // Escape PostgREST's `or` separator + ilike escape char so a comma
    // or backslash in the query can't break out of the expression.
    const safe = q.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/[()]/g, '');
    query = query.or(`display_code.ilike.%${safe}%,stem_html.ilike.%${safe}%`);
  }
  if (input?.domain) query = query.eq('domain_name', input.domain);
  if (input?.skill) query = query.eq('skill_name', input.skill);
  if (input?.questionType) query = query.eq('question_type', input.questionType);

  const { data, count, error } = await query
    .order('display_code', { ascending: true, nullsFirst: false })
    .range(0, 24);

  if (error) return actionFail(`Search failed: ${error.message}`);
  return actionOk({ rows: data ?? [], total: count ?? 0 });
}

// Single-question lookup so the picker (and the canvas preview) can
// show the real stem for an already-linked question_id.
export async function getQuestionById(id) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  if (typeof id !== 'string' || !id) return actionFail('id required');

  const { data, error } = await ctx.supabase
    .from('questions_v2')
    .select(QUESTION_CARD_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) return actionFail(`Lookup failed: ${error.message}`);
  return actionOk({ question: data ?? null });
}

export async function deleteLesson(_prev, formData) {
  let ctx;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const lessonId = formData.get('lesson_id');
  const confirm = formData.get('confirm');
  if (typeof lessonId !== 'string' || !lessonId) return actionFail('lesson_id required');
  if (confirm !== 'DELETE') {
    return actionFail('Type DELETE to confirm.');
  }

  const { error } = await ctx.supabase.from('lessons').delete().eq('id', lessonId);
  if (error) return actionFail(`Failed: ${error.message}`);

  revalidatePath('/admin/lessons');
  redirect('/admin/lessons?deleted=1');
}
