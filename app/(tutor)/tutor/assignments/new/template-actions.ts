// Template shelf actions (§4.3). Creation happens inside
// createAssignment (the save_template fields) — a template is only
// ever born from a real assignment, so there's no standalone
// create here. Deletion is the one management verb the shelf
// needs; RLS (owner or admin) is the real gate.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

export async function deleteAssignmentTemplate(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireRole(['teacher', 'manager', 'admin']);
  } catch (e) {
    if (e instanceof ApiError) return e.toActionResult();
    return actionFail('Unexpected error');
  }

  const templateId = formData.get('template_id');
  if (!templateId || typeof templateId !== 'string') {
    return actionFail('templateId required');
  }

  const { error } = await ctx.supabase
    .from('assignment_templates')
    .delete()
    .eq('id', templateId);
  if (error) return actionFail('Could not delete the template');

  revalidatePath('/tutor/assignments/new');
  return actionOk();
}
