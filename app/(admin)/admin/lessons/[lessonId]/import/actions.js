// Server Action: import a LessonTemplateSpec into an EXISTING lesson.
//
// Unlike /admin/lessons/import (which creates a new lesson), this targets
// a lesson that already exists and either replaces its blocks or appends
// to them. Same compiler + validator as every other lesson write; the
// whole resulting block list is re-validated before any DB change, then
// the block set is replaced atomically (delete + insert).

'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import {
  compileLessonTemplateSpec,
  parseLessonTemplateSpecText,
} from '@/lib/lesson/template-import.mjs';
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';

export async function importBlocksIntoLesson(_prev, formData) {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const lessonId = formData.get('lesson_id');
  const rawText = formData.get('spec');
  const mode = formData.get('mode') === 'append' ? 'append' : 'replace';
  if (typeof lessonId !== 'string' || !lessonId) return actionFail('lesson_id required');
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return actionFail('Paste a LessonTemplateSpec JSON document.');
  }

  const parsed = parseLessonTemplateSpecText(rawText);
  if (parsed.error) return actionFail(`JSON parse error: ${parsed.error}`);

  // Existing blocks (needed for append; also to hand the compiler used
  // content ids so appended blocks don't collide).
  const { data: existingRows, error: loadErr } = await ctx.supabase
    .from('lesson_blocks')
    .select('block_type, content, sort_order')
    .eq('lesson_id', lessonId)
    .order('sort_order');
  if (loadErr) return actionFail(`Failed to load existing blocks: ${loadErr.message}`);
  const existing = existingRows ?? [];
  const existingContentIds = existing.map((r) => r?.content?.id).filter(Boolean);

  const compiled = compileLessonTemplateSpec(parsed.spec, {
    existingContentIds: mode === 'append' ? existingContentIds : [],
  });
  const compileErrors = compiled.issues.filter((i) => i.severity === 'error');
  if (compileErrors.length > 0) {
    return actionFail(
      `Compile errors: ${compileErrors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }
  if (compiled.blocks.length === 0) return actionFail('Spec compiled to zero blocks.');

  const combined =
    mode === 'append'
      ? [...existing.map((r) => ({ block_type: r.block_type, content: r.content })), ...compiled.blocks]
      : compiled.blocks;

  const validation = validateLessonBlocks(
    combined.map((b, i) => ({ ...b, id: b.id ?? b.content?.id ?? `index:${i}` })),
  );
  if (!validation.ok) {
    return actionFail(
      `Validation failed: ${validation.errors.map((e) => `${e.blockId ?? '?'}: ${e.message}`).join('; ')}`,
    );
  }

  const { error: deleteErr } = await ctx.supabase
    .from('lesson_blocks')
    .delete()
    .eq('lesson_id', lessonId);
  if (deleteErr) return actionFail(`Failed to clear blocks: ${deleteErr.message}`);

  const rows = combined.map((b, i) => ({
    lesson_id: lessonId,
    sort_order: i,
    block_type: b.block_type,
    content: b.content || {},
  }));
  if (rows.length > 0) {
    const { error: insertErr } = await ctx.supabase.from('lesson_blocks').insert(rows);
    if (insertErr) return actionFail(`Failed to insert blocks: ${insertErr.message}`);
  }

  await ctx.supabase
    .from('lessons')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', lessonId);

  revalidatePath(`/admin/lessons/${lessonId}`);
  revalidatePath('/admin/lessons');
  redirect(`/admin/lessons/${lessonId}?imported=1`);
}
