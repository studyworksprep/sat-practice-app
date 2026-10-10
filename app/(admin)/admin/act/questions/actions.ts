// Server Actions for the ACT question admin (Phase 2 of the SAT/ACT
// parity plan). Until this surface existed, the only write path to
// an approved ACT question was unapproving its import draft, which
// hard-deletes the row.
//
//   saveActQuestion      — patch content + taxonomy on one row and
//                          the content/label/correct flag on each
//                          of its existing act_answer_options rows.
//                          Option rows are updated by id; the set
//                          itself can't grow or shrink here (ACT is
//                          four-option MCQ throughout).
//   setActQuestionBroken — flag / clear is_broken. Broken rows are
//                          hidden from every student picker
//                          (lib/practice/act-visibility.ts).
//   retireActQuestion    — soft delete (deleted_at). Hidden from
//                          pickers like broken, but semantically
//                          "gone for good"; attempts, notes and
//                          error-log rows keep pointing at it.
//   restoreActQuestion   — clear deleted_at.
//
// All four are admin-only (requireRole) and RLS double-gates the
// writes through act_questions_admin_write.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

interface OptionInput {
  id: string;
  label: string;
  content_html: string;
  is_correct: boolean;
}

async function getAdminCtx() {
  try {
    const ctx = await requireRole(['admin']);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return ctx as { supabase: any; user: { id: string } };
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Unexpected error', 500);
  }
}

function str(v: FormDataEntryValue | null): string {
  return typeof v === 'string' ? v : '';
}

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = str(v).trim();
  return s === '' ? null : s;
}

function parseDifficulty(v: FormDataEntryValue | null): number | null | 'invalid' {
  const s = str(v).trim();
  if (s === '') return null;
  const n = Number.parseInt(s, 10);
  if (!Number.isFinite(n) || n < 1 || n > 5) return 'invalid';
  return n;
}

function parseOptions(raw: string): OptionInput[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`options are not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) throw new Error('options must be an array');
  return parsed.map((o, i): OptionInput => {
    if (typeof o !== 'object' || o === null) {
      throw new Error(`option ${i + 1}: expected { id, label, content_html, is_correct }`);
    }
    const rec = o as Record<string, unknown>;
    if (typeof rec.id !== 'string' || !rec.id) {
      throw new Error(`option ${i + 1}: missing id`);
    }
    const label = typeof rec.label === 'string' ? rec.label.trim() : '';
    if (!label) throw new Error(`option ${i + 1}: label is required`);
    return {
      id: rec.id,
      label,
      content_html: typeof rec.content_html === 'string' ? rec.content_html : '',
      is_correct: Boolean(rec.is_correct),
    };
  });
}

function revalidate(questionId: string) {
  revalidatePath('/admin/act/questions');
  revalidatePath(`/admin/act/questions/${questionId}`);
}

// ─── saveActQuestion ─────────────────────────────────────────────

export async function saveActQuestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;

  const questionId = str(formData.get('question_id')).trim();
  if (!questionId) return actionFail('question_id required');

  const stem = emptyToNull(formData.get('stem_html'));
  if (!stem) return actionFail('Stem is required.');
  const category = emptyToNull(formData.get('category'));
  if (!category) return actionFail('Category is required.');

  const difficulty = parseDifficulty(formData.get('difficulty'));
  if (difficulty === 'invalid') return actionFail('Difficulty must be 1–5 (or blank).');

  let options: OptionInput[];
  try {
    options = parseOptions(str(formData.get('options_json')));
  } catch (err) {
    return actionFail((err as Error).message);
  }
  if (options.length < 2) return actionFail('At least two options are required.');
  const correctCount = options.filter((o) => o.is_correct).length;
  if (correctCount !== 1) return actionFail('Exactly one option must be marked correct.');

  // The submitted option ids must be this question's own rows — a
  // forged id would otherwise let the form edit another question's
  // option through this action.
  const [{ data: existing, error: loadErr }, { data: existingOptions }] = await Promise.all([
    supabase
      .from('act_questions')
      .select('id, difficulty, difficulty_source')
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('act_answer_options')
      .select('id')
      .eq('question_id', questionId),
  ]);
  if (loadErr) return actionFail(`Could not load question: ${loadErr.message}`);
  if (!existing) return actionFail('Question not found.');
  const ownIds = new Set(((existingOptions ?? []) as Array<{ id: string }>).map((o) => o.id));
  if (ownIds.size !== options.length || options.some((o) => !ownIds.has(o.id))) {
    return actionFail('Option set does not match this question — reload and try again.');
  }

  // Difficulty provenance: an admin-set value is 'manual'; clearing
  // it clears the source; leaving it unchanged keeps whatever it was.
  const prevDifficulty = (existing as { difficulty: number | null }).difficulty;
  const prevSource = (existing as { difficulty_source: string | null }).difficulty_source;
  const difficultySource =
    difficulty == null ? null
    : difficulty === prevDifficulty ? prevSource
    : 'manual';

  const now = new Date().toISOString();
  const { error: qErr } = await supabase
    .from('act_questions')
    .update({
      stem_html: stem,
      stimulus_html: emptyToNull(formData.get('stimulus_html')),
      rationale_html: emptyToNull(formData.get('rationale_html')),
      category,
      category_code: emptyToNull(formData.get('category_code')),
      subcategory: emptyToNull(formData.get('subcategory')),
      subcategory_code: emptyToNull(formData.get('subcategory_code')),
      difficulty,
      difficulty_source: difficultySource,
      is_modeling: str(formData.get('is_modeling')) === '1',
      updated_at: now,
      updated_by: user.id,
    })
    .eq('id', questionId);
  if (qErr) return actionFail(`Save failed: ${qErr.message}`);

  for (const o of options) {
    const { error: oErr } = await supabase
      .from('act_answer_options')
      .update({ label: o.label, content_html: o.content_html, is_correct: o.is_correct })
      .eq('id', o.id)
      .eq('question_id', questionId);
    if (oErr) return actionFail(`Saved the question but option ${o.label} failed: ${oErr.message}`);
  }

  revalidate(questionId);
  return actionOk();
}

// ─── flags ───────────────────────────────────────────────────────

async function patchFlags(
  formData: FormData,
  patch: Record<string, unknown>,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;
  const questionId = str(formData.get('question_id')).trim();
  if (!questionId) return actionFail('question_id required');

  const { data, error } = await supabase
    .from('act_questions')
    .update({ ...patch, updated_at: new Date().toISOString(), updated_by: user.id })
    .eq('id', questionId)
    .select('id');
  if (error) return actionFail(error.message);
  if (!data || data.length === 0) return actionFail('Question not found.');

  revalidate(questionId);
  return actionOk();
}

export async function setActQuestionBroken(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  const broken = str(formData.get('broken')) === '1';
  return patchFlags(formData, { is_broken: broken });
}

export async function retireActQuestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return patchFlags(formData, { deleted_at: new Date().toISOString() });
}

export async function restoreActQuestion(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  return patchFlags(formData, { deleted_at: null });
}
