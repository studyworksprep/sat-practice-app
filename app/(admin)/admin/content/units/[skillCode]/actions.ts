// Server Actions for the per-skill question-pattern catalog
// (docs/foundations-and-question-patterns.md §3.4 step 2).
//
// question_patterns is admin-authored reference data (RLS: select for
// all authenticated, writes admin-only — enforced in the DB; the
// requireRole here is the app-layer mirror).

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { AuthContext } from '@/lib/api/auth';
import { SAT_TAXONOMY } from '@/lib/practice/sat-taxonomy';

async function adminCtx(): Promise<AuthContext> {
  return requireRole(['admin']);
}

function domainCodeForSkill(skillCode: string): string | null {
  for (const domain of SAT_TAXONOMY) {
    if (domain.skills.some((skill) => skill.code === skillCode)) return domain.code;
  }
  return null;
}

export async function savePattern(_prev: unknown, formData: FormData) {
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const patternId = formData.get('pattern_id'); // empty string = create
  const skillCode = formData.get('skill_code');
  const name = formData.get('name');
  const recognitionCue = formData.get('recognition_cue');
  const processSummary = formData.get('process_summary');
  const sequenceRaw = formData.get('sequence');

  if (typeof skillCode !== 'string' || !skillCode) return actionFail('skill_code required');
  const domainCode = domainCodeForSkill(skillCode);
  if (!domainCode) return actionFail(`Unknown skill code "${skillCode}"`);

  if (typeof name !== 'string' || !name.trim()) return actionFail('Name is required');
  if (typeof recognitionCue !== 'string' || !recognitionCue.trim()) {
    return actionFail('The recognition cue is required — if you can’t write a crisp "when you see…" sentence, it isn’t a pattern.');
  }
  const sequence =
    typeof sequenceRaw === 'string' && sequenceRaw.trim() !== ''
      ? Number.parseInt(sequenceRaw, 10)
      : 1;
  if (!Number.isInteger(sequence) || sequence < 1) return actionFail('Sequence must be a positive integer');

  const row = {
    test_type: 'sat',
    domain_code: domainCode,
    skill_code: skillCode,
    name: name.trim(),
    recognition_cue: recognitionCue.trim(),
    process_summary:
      typeof processSummary === 'string' && processSummary.trim() ? processSummary.trim() : null,
    sequence,
    updated_at: new Date().toISOString(),
  };

  const query =
    typeof patternId === 'string' && patternId
      ? ctx.supabase.from('question_patterns').update(row).eq('id', patternId)
      : ctx.supabase.from('question_patterns').insert(row);

  const { error } = await query;
  if (error) {
    if (error.code === '23505') return actionFail('A pattern with that name already exists for this skill.');
    return actionFail(`Failed to save: ${error.message}`);
  }

  revalidatePath(`/admin/content/units/${skillCode}`);
  revalidatePath('/admin/content/units');
  return actionOk({ savedAt: Date.now() });
}

export async function deletePattern(_prev: unknown, formData: FormData) {
  let ctx: AuthContext;
  try {
    ctx = await adminCtx();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  const patternId = formData.get('pattern_id');
  const skillCode = formData.get('skill_code');
  if (typeof patternId !== 'string' || !patternId) return actionFail('pattern_id required');

  // Deleting a pattern unclassifies its questions (FK set null) and
  // cascades away its lesson tags — surface the blast radius so the
  // admin confirms deliberately.
  const confirm = formData.get('confirm');
  if (confirm !== 'DELETE') return actionFail('Type DELETE to confirm.');

  const { error } = await ctx.supabase.from('question_patterns').delete().eq('id', patternId);
  if (error) return actionFail(`Failed to delete: ${error.message}`);

  if (typeof skillCode === 'string' && skillCode) {
    revalidatePath(`/admin/content/units/${skillCode}`);
  }
  revalidatePath('/admin/content/units');
  return actionOk({ deletedAt: Date.now() });
}
