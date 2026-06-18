// Server Action for the admin lesson-import flow.
//
// Takes the raw LessonTemplateSpec text from the client form,
// re-parses + re-compiles + re-validates it on the server (the
// client preview is convenience only — the server is the source
// of truth), then atomically inserts the lesson row and its
// compiled blocks. Topics are not part of the spec today, so we
// don't write to lesson_topics here.

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

export async function createLessonFromSpec(_prev, formData) {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const rawText = formData.get('spec');
  if (typeof rawText !== 'string' || !rawText.trim()) {
    return actionFail('Paste a LessonTemplateSpec JSON document.');
  }

  const titleOverride = formData.get('title_override');
  const descriptionOverride = formData.get('description_override');

  const parsed = parseLessonTemplateSpecText(rawText);
  if (parsed.error) {
    return actionFail(`JSON parse error: ${parsed.error}`);
  }

  const compiled = compileLessonTemplateSpec(parsed.spec);
  const compileErrors = compiled.issues.filter((i) => i.severity === 'error');
  if (compileErrors.length > 0) {
    return actionFail(
      `Compile errors: ${compileErrors.map((e) => `${e.path}: ${e.message}`).join('; ')}`,
    );
  }

  if (compiled.blocks.length === 0) {
    return actionFail('Spec compiled to zero blocks.');
  }

  const validation = validateLessonBlocks(compiled.blocks);
  if (!validation.ok) {
    return actionFail(
      `Validation failed: ${validation.errors
        .map((e) => `${e.blockId ?? '?'}: ${e.message}`)
        .join('; ')}`,
    );
  }

  const finalTitle =
    (typeof titleOverride === 'string' && titleOverride.trim()) ||
    compiled.lessonMetadata.title ||
    'Imported lesson';
  const finalDescription =
    (typeof descriptionOverride === 'string' && descriptionOverride.trim()) ||
    compiled.lessonMetadata.description ||
    null;

  const { data: lesson, error: insertLessonErr } = await ctx.supabase
    .from('lessons')
    .insert({
      author_id: ctx.user.id,
      title: finalTitle,
      description: finalDescription,
      visibility: 'shared',
      status: 'draft',
    })
    .select('id')
    .single();

  if (insertLessonErr || !lesson) {
    return actionFail(`Failed to create lesson: ${insertLessonErr?.message ?? 'unknown'}`);
  }

  const blockRows = compiled.blocks.map((b, i) => ({
    lesson_id: lesson.id,
    sort_order: b.sort_order ?? i,
    block_type: b.block_type,
    content: b.content || {},
  }));

  const { error: insertBlocksErr } = await ctx.supabase
    .from('lesson_blocks')
    .insert(blockRows);

  if (insertBlocksErr) {
    // Roll back the lesson row so we don't leave an empty husk.
    await ctx.supabase.from('lessons').delete().eq('id', lesson.id);
    return actionFail(`Failed to insert blocks: ${insertBlocksErr.message}`);
  }

  revalidatePath('/admin/lessons');
  redirect(`/admin/lessons?imported=${lesson.id}`);
}
