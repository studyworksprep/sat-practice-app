// Server Actions for the AI lesson-generation page: saving and
// resetting the shared prompt template, plus persisting a previewed
// draft once the admin confirms it. Generation itself goes through
// POST /api/admin/lessons/generate (an API route so it can carry its
// own maxDuration).
//
// The template lives in ai_prompt_templates keyed by
// LESSON_GEN_TEMPLATE_NAME. No row means the code-side default
// applies, so "reset" is a delete — the stored value can never
// drift from DEFAULT_LESSON_PROMPT_TEMPLATE.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { AuthContext } from '@/lib/api/auth';
import type { Json } from '@/lib/types';
import {
  DEFAULT_LESSON_PROMPT_TEMPLATE,
  LESSON_GEN_TEMPLATE_NAME,
  LESSON_INFO_PLACEHOLDER,
} from '@/lib/admin/lessonGenPrompt';
// Shared .mjs validator (also runs client-side); no type declarations.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { validateLessonBlocks } from '@/lib/lesson/lesson-validation.mjs';

async function adminCtx(): Promise<AuthContext> {
  return requireRole(['admin']);
}

export async function savePromptTemplate(_prev: unknown, formData: FormData) {
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const template = formData.get('template');
  if (typeof template !== 'string' || !template.trim()) {
    return actionFail('Template is required');
  }
  if (!template.includes(LESSON_INFO_PLACEHOLDER)) {
    return actionFail(
      `The template must contain ${LESSON_INFO_PLACEHOLDER} — that marks where the lesson brief is inserted.`,
    );
  }

  const { error } = await ctx.supabase
    .from('ai_prompt_templates')
    .upsert(
      { name: LESSON_GEN_TEMPLATE_NAME, template, updated_by: ctx.user.id },
      { onConflict: 'name' },
    );
  if (error) return actionFail(`Failed to save: ${error.message}`);

  return actionOk({ savedAt: Date.now() });
}

export async function resetPromptTemplate() {
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { error } = await ctx.supabase
    .from('ai_prompt_templates')
    .delete()
    .eq('name', LESSON_GEN_TEMPLATE_NAME);
  if (error) return actionFail(`Failed to reset: ${error.message}`);

  return actionOk({ template: DEFAULT_LESSON_PROMPT_TEMPLATE });
}

interface DraftBlockInput {
  sort_order?: number;
  block_type?: string;
  content?: Json;
}

interface SaveGeneratedLessonInput {
  title?: unknown;
  description?: unknown;
  blocks?: unknown;
}

// Persists a previewed AI draft as a lessons row + lesson_blocks.
// Called with the exact mapped blocks the preview rendered, so what
// the admin confirmed is what lands in the editor. Re-validates
// server-side (same normalization as saveLessonBlocks in the
// per-lesson editor: validation wants the block id at the top level).
export async function saveGeneratedLesson(input: SaveGeneratedLessonInput) {
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const title = typeof input?.title === 'string' ? input.title.trim() : '';
  if (!title) return actionFail('The draft is missing a title.');
  const description =
    typeof input?.description === 'string' && input.description.trim()
      ? input.description.trim()
      : null;

  const rawBlocks = (Array.isArray(input?.blocks) ? input.blocks : []) as DraftBlockInput[];
  if (rawBlocks.length === 0) return actionFail('The draft has no blocks to save.');
  if (rawBlocks.some((b) => typeof b?.block_type !== 'string' || !b.block_type)) {
    return actionFail('Every block needs a block_type.');
  }
  const blocks = rawBlocks as Array<DraftBlockInput & { block_type: string }>;

  const forValidation = blocks.map((block, index) => ({
    ...block,
    id:
      (block?.content as Record<string, unknown> | undefined)?.id ??
      `index:${index}`,
  }));
  const validation = validateLessonBlocks(forValidation);
  if (!validation.ok) {
    return actionFail(
      `Validation failed: ${validation.errors
        .map((e: { blockId?: string; message?: string }) => `${e.blockId ?? '?'}: ${e.message}`)
        .join('; ')}`,
    );
  }

  const { data: lesson, error: insertLessonErr } = await ctx.supabase
    .from('lessons')
    .insert({
      author_id: ctx.user.id,
      title,
      description,
      visibility: 'shared',
      status: 'draft',
    })
    .select('id')
    .single();

  if (insertLessonErr || !lesson) {
    return actionFail(`Failed to create lesson: ${insertLessonErr?.message ?? 'unknown'}`);
  }

  const blockRows = blocks.map((b, i) => ({
    lesson_id: lesson.id,
    sort_order: typeof b.sort_order === 'number' ? b.sort_order : i,
    block_type: b.block_type,
    content: b.content ?? {},
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
  return actionOk({ lessonId: lesson.id });
}
