// Server Actions for the AI lesson-generation page: saving and
// resetting the shared prompt template. Generation itself goes
// through POST /api/admin/lessons/generate (an API route so it can
// carry its own maxDuration).
//
// The template lives in ai_prompt_templates keyed by
// LESSON_GEN_TEMPLATE_NAME. No row means the code-side default
// applies, so "reset" is a delete — the stored value can never
// drift from DEFAULT_LESSON_PROMPT_TEMPLATE.

'use server';

import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { AuthContext } from '@/lib/api/auth';
import {
  DEFAULT_LESSON_PROMPT_TEMPLATE,
  LESSON_GEN_TEMPLATE_NAME,
  LESSON_INFO_PLACEHOLDER,
} from '@/lib/admin/lessonGenPrompt';

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
