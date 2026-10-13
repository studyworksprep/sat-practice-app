// Server Actions for the ACT forms admin (Phase 3 multi-section test
// mode). One setting per form today: the format (classic / enhanced)
// that keys section timings, the break and the composite rule in
// lib/practice/act-test-plan.ts. Admin-only (requireRole); RLS
// double-gates the write through act_forms_admin_write.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';
import { isActFormat } from '@/lib/practice/act-test-plan';

export async function setActFormFormat(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireRole(['admin']);
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { supabase, user } = ctx as { supabase: any; user: { id: string } };

  const sourceTest = String(formData.get('source_test') ?? '').trim();
  const format = String(formData.get('format') ?? '').trim();
  if (!sourceTest) return actionFail('source_test required');
  if (!isActFormat(format)) return actionFail('Unknown format.');

  // Only forms that exist in the bank get a settings row.
  const { count } = await supabase
    .from('act_questions')
    .select('id', { count: 'exact', head: true })
    .eq('source_test', sourceTest);
  if (!count) return actionFail('No questions carry that form name.');

  const { error } = await supabase
    .from('act_forms')
    .upsert(
      { source_test: sourceTest, format, updated_at: new Date().toISOString(), updated_by: user.id },
      { onConflict: 'source_test' },
    );
  if (error) return actionFail(error.message);

  revalidatePath('/admin/act/forms');
  revalidatePath('/practice/tests');
  return actionOk();
}
