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
