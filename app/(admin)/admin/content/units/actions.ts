// Admin Server Actions for the SAT curriculum-unit syllabus settings.
//
// The unit identity (test/domain/skill/title) remains taxonomy-owned.
// This first authoring pass exposes only the active planning settings:
// expected minutes, mastery threshold, and teaching order. Prerequisites
// stay out until a plan consumer exists for them.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult, AuthContext } from '@/lib/types';
import {
  normalizeCurriculumUnitSettings,
  planCurriculumUnitMove,
  type CurriculumUnitSettingsInput,
  type OrderedCurriculumUnit,
} from '@/lib/admin/curriculumUnitSettings';

export type { CurriculumUnitSettingsInput } from '@/lib/admin/curriculumUnitSettings';

async function adminCtx(): Promise<AuthContext> {
  return requireRole(['admin']);
}

function revalidateCurriculumSurfaces() {
  revalidatePath('/admin/content/units');
  // Unit minutes prefill the AI lesson brief, and all plan editors read
  // these reference rows on demand. Invalidating their layouts keeps a
  // future cached child from retaining a stale planning estimate.
  revalidatePath('/admin/lessons', 'layout');
  revalidatePath('/tutor/students', 'layout');
}

/** Save the two active per-unit planning settings. */
export async function updateCurriculumUnitSettings(
  input: CurriculumUnitSettingsInput,
): Promise<ActionResult<{ data: { expectedMinutes: number; masteryThreshold: number } }>> {
  if (!input.unitId) return actionFail('unitId required');

  const normalized = normalizeCurriculumUnitSettings(input);
  if (!normalized.ok) return actionFail(normalized.error);
  const { expectedMinutes, masteryThreshold } = normalized.value;

  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data, error } = await ctx.supabase
    .from('curriculum_units')
    .update({
      expected_minutes: expectedMinutes,
      mastery_threshold: masteryThreshold,
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.unitId)
    .eq('test_type', 'sat')
    .select('id, expected_minutes, mastery_threshold')
    .maybeSingle();

  if (error) return actionFail(error.message);
  if (!data) return actionFail('Curriculum unit not found.');

  revalidateCurriculumSurfaces();
  return actionOk({
    expectedMinutes: data.expected_minutes,
    masteryThreshold: data.mastery_threshold,
  });
}

/**
 * Move a unit one position inside its SAT section. The rewrite also
 * normalizes the full 29-row order to contiguous Math-then-R&W positions,
 * repairing any gaps or duplicate sequence values left by manual SQL.
 */
export async function moveCurriculumUnit({
  unitId,
  direction,
}: {
  unitId: string;
  direction: 'up' | 'down';
}): Promise<ActionResult<{ data: { moved: boolean } }>> {
  if (!unitId) return actionFail('unitId required');
  if (direction !== 'up' && direction !== 'down') return actionFail('Unknown direction.');

  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const { data, error } = await ctx.supabase
    .from('curriculum_units')
    .select('id, domain_code, sequence')
    .eq('test_type', 'sat')
    .order('sequence', { ascending: true })
    .order('id', { ascending: true });
  if (error) return actionFail(error.message);

  const rows: OrderedCurriculumUnit[] = (data ?? []).map((row) => ({
    id: row.id,
    domainCode: row.domain_code,
    sequence: row.sequence,
  }));
  const move = planCurriculumUnitMove(rows, unitId, direction);
  if (move.status === 'not_found') return actionFail('Curriculum unit not found.');
  if (move.status === 'boundary') {
    return actionOk({ moved: false });
  }

  const stamp = new Date().toISOString();

  // This follows the existing question-pattern ordering convention. RLS
  // applies to every write through the authenticated admin client.
  for (const { id, sequence } of move.assignments) {
    const { data: written, error: writeError } = await ctx.supabase
      .from('curriculum_units')
      .update({ sequence, updated_at: stamp })
      .eq('id', id)
      .eq('test_type', 'sat')
      .select('id')
      .maybeSingle();
    if (writeError) return actionFail(writeError.message);
    if (!written) return actionFail('A curriculum unit could not be reordered. Refresh and try again.');
  }

  revalidateCurriculumSurfaces();
  return actionOk({ moved: true });
}
