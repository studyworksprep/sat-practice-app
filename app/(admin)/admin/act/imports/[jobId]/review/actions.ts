// Server Actions for the ACT-import draft review surface.
//
// Five actions cover the review lifecycle:
//
//   saveDraft        — patch the editable fields on a draft row
//                      (stem/stimulus/rationale html, options
//                      JSON, taxonomy, difficulty, is_modeling).
//   approveDraft     — promote a single draft to act_questions
//                      + act_answer_options. Sets draft.status =
//                      'approved' and stamps approved_to_id so
//                      re-promoting is idempotent.
//   bulkApprove      — approve every 'ready_for_review' draft in
//                      a section (or the whole job) that passes
//                      the same validation single-approve uses.
//                      Skips drafts with no category, no correct
//                      option, or already-approved.
//   unapproveDraft   — undo. Deletes the promoted act_questions
//                      row (cascade clears its options + any
//                      stray attempts in dev) and flips the
//                      draft back to 'ready_for_review'.
//   rejectDraft      — mark a draft 'rejected' without touching
//                      act_questions.
//   finalizeJob      — mark the job 'completed' when every draft
//                      is approved or rejected.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';

interface OptionShape {
  label: string;
  content_html: string;
  is_correct: boolean;
}

interface DraftRow {
  id: string;
  import_job_id: string;
  source_test: string;
  section: string;
  source_ordinal: number;
  stimulus_html: string | null;
  stem_html: string;
  rationale_html: string | null;
  difficulty: number | null;
  category: string | null;
  category_code: string | null;
  subcategory: string | null;
  subcategory_code: string | null;
  options_json: OptionShape[] | null;
  status: string;
  approved_to_id: string | null;
}

// ─── Admin gate ──────────────────────────────────────────────────

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

function emptyToNull(v: FormDataEntryValue | null): string | null {
  const s = typeof v === 'string' ? v.trim() : '';
  return s === '' ? null : s;
}

function parseIntOrNull(v: FormDataEntryValue | null): number | null {
  const s = typeof v === 'string' ? v.trim() : '';
  if (s === '') return null;
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function parseOptions(raw: string | null): OptionShape[] {
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`options is not valid JSON: ${(err as Error).message}`);
  }
  if (!Array.isArray(parsed)) {
    throw new Error('options must be a JSON array');
  }
  return parsed.map((o, i): OptionShape => {
    if (typeof o !== 'object' || o === null) {
      throw new Error(`option ${i + 1}: must be an object with { label, content_html, is_correct }`);
    }
    const rec = o as Record<string, unknown>;
    return {
      label: typeof rec.label === 'string' ? rec.label : String.fromCharCode(65 + i),
      content_html: typeof rec.content_html === 'string' ? rec.content_html : '',
      is_correct: Boolean(rec.is_correct),
    };
  });
}

function validateBeforeApprove(d: DraftRow): string | null {
  if (!d.stem_html || d.stem_html.trim() === '') return 'stem_html is empty';
  if (!d.category || d.category.trim() === '') return 'category is required (act_questions.category is NOT NULL)';
  const opts = Array.isArray(d.options_json) ? d.options_json : [];
  if (opts.length < 2) return 'at least 2 options required';
  if (!opts.some((o) => o.is_correct)) return 'no option is marked correct';
  return null;
}

// ─── saveDraft ──────────────────────────────────────────────────

export async function saveDraft(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase } = ctx;

  const draftId = String(formData.get('draft_id') ?? '');
  if (!draftId) return actionFail('draft_id required');

  let options: OptionShape[];
  try {
    options = parseOptions(emptyToNull(formData.get('options_json')));
  } catch (err) {
    return actionFail((err as Error).message);
  }

  const update = {
    stem_html: (emptyToNull(formData.get('stem_html')) ?? '') as string,
    stimulus_html: emptyToNull(formData.get('stimulus_html')),
    rationale_html: emptyToNull(formData.get('rationale_html')),
    difficulty: parseIntOrNull(formData.get('difficulty')),
    category: emptyToNull(formData.get('category')),
    category_code: emptyToNull(formData.get('category_code')),
    subcategory: emptyToNull(formData.get('subcategory')),
    subcategory_code: emptyToNull(formData.get('subcategory_code')),
    options_json: options,
  };

  const { error } = await supabase
    .from('act_question_drafts')
    .update(update)
    .eq('id', draftId);
  if (error) return actionFail(`saveDraft: ${error.message}`);

  const jobId = String(formData.get('job_id') ?? '');
  if (jobId) revalidatePath(`/admin/act/imports/${jobId}/review`);
  return actionOk();
}

// ─── approveDraft ───────────────────────────────────────────────

async function approveOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  draft: DraftRow,
): Promise<{ approvedId: string }> {
  const validation = validateBeforeApprove(draft);
  if (validation) throw new Error(validation);

  // Insert the question row first; act_answer_options FK
  // cascade-deletes if we have to roll back.
  const { data: q, error: qErr } = await supabase
    .from('act_questions')
    .insert({
      section: draft.section,
      category: draft.category!,
      category_code: draft.category_code,
      subcategory: draft.subcategory,
      subcategory_code: draft.subcategory_code,
      difficulty: draft.difficulty,
      stimulus_html: draft.stimulus_html,
      stem_html: draft.stem_html,
      rationale_html: draft.rationale_html,
      source_test: draft.source_test,
      source_ordinal: draft.source_ordinal,
    })
    .select('id')
    .single();
  if (qErr || !q) {
    throw new Error(`Insert act_questions failed: ${qErr?.message ?? 'unknown'}`);
  }
  const questionId = (q as { id: string }).id;

  const optionRows = (draft.options_json ?? []).map((o, i) => ({
    question_id: questionId,
    ordinal: i + 1,
    label: o.label,
    content_html: o.content_html,
    is_correct: o.is_correct,
  }));
  if (optionRows.length > 0) {
    const { error: oErr } = await supabase.from('act_answer_options').insert(optionRows);
    if (oErr) {
      // Roll back the question insert so we don't orphan a row
      // with no options. cascade delete on options is N/A since
      // none landed.
      await supabase.from('act_questions').delete().eq('id', questionId);
      throw new Error(`Insert act_answer_options failed: ${oErr.message}`);
    }
  }

  const { error: dErr } = await supabase
    .from('act_question_drafts')
    .update({ status: 'approved', approved_to_id: questionId })
    .eq('id', draft.id);
  if (dErr) {
    await supabase.from('act_questions').delete().eq('id', questionId);
    throw new Error(`Update draft status failed: ${dErr.message}`);
  }

  return { approvedId: questionId };
}

export async function approveDraft(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase } = ctx;

  const draftId = String(formData.get('draft_id') ?? '');
  if (!draftId) return actionFail('draft_id required');

  const { data: draft, error: loadErr } = await supabase
    .from('act_question_drafts')
    .select(
      'id, import_job_id, source_test, section, source_ordinal, stimulus_html, stem_html, ' +
      'rationale_html, difficulty, category, category_code, subcategory, subcategory_code, ' +
      'options_json, status, approved_to_id',
    )
    .eq('id', draftId)
    .maybeSingle();
  if (loadErr || !draft) return actionFail('draft not found');
  if (draft.status === 'approved') return actionFail('already approved');

  try {
    await approveOne(supabase, draft as DraftRow);
  } catch (err) {
    return actionFail((err as Error).message);
  }

  revalidatePath(`/admin/act/imports/${draft.import_job_id}/review`);
  return actionOk();
}

// ─── bulkApprove ────────────────────────────────────────────────

export async function bulkApprove(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase } = ctx;

  const jobId = String(formData.get('job_id') ?? '');
  if (!jobId) return actionFail('job_id required');
  const section = emptyToNull(formData.get('section'));

  let query = supabase
    .from('act_question_drafts')
    .select(
      'id, import_job_id, source_test, section, source_ordinal, stimulus_html, stem_html, ' +
      'rationale_html, difficulty, category, category_code, subcategory, subcategory_code, ' +
      'options_json, status, approved_to_id',
    )
    .eq('import_job_id', jobId)
    .eq('status', 'ready_for_review')
    .order('section', { ascending: true })
    .order('source_ordinal', { ascending: true });
  if (section) query = query.eq('section', section);

  const { data: drafts, error } = await query;
  if (error) return actionFail(`Could not load drafts: ${error.message}`);

  let approved = 0;
  const skipped: Array<{ ordinal: number; section: string; reason: string }> = [];
  for (const d of (drafts ?? []) as DraftRow[]) {
    const validation = validateBeforeApprove(d);
    if (validation) {
      skipped.push({ ordinal: d.source_ordinal, section: d.section, reason: validation });
      continue;
    }
    try {
      await approveOne(supabase, d);
      approved += 1;
    } catch (err) {
      skipped.push({
        ordinal: d.source_ordinal,
        section: d.section,
        reason: (err as Error).message,
      });
    }
  }

  revalidatePath(`/admin/act/imports/${jobId}/review`);
  return actionOk({ approved, skipped: skipped.length, skippedDetails: skipped.slice(0, 10) });
}

// ─── unapproveDraft ─────────────────────────────────────────────

export async function unapproveDraft(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase } = ctx;

  const draftId = String(formData.get('draft_id') ?? '');
  if (!draftId) return actionFail('draft_id required');

  const { data: draft } = await supabase
    .from('act_question_drafts')
    .select('id, import_job_id, approved_to_id, status')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return actionFail('draft not found');

  if (draft.approved_to_id) {
    await supabase.from('act_questions').delete().eq('id', draft.approved_to_id);
  }
  const { error } = await supabase
    .from('act_question_drafts')
    .update({ status: 'ready_for_review', approved_to_id: null })
    .eq('id', draftId);
  if (error) return actionFail(`unapproveDraft: ${error.message}`);

  revalidatePath(`/admin/act/imports/${draft.import_job_id}/review`);
  return actionOk();
}

// ─── rejectDraft ────────────────────────────────────────────────

export async function rejectDraft(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase } = ctx;

  const draftId = String(formData.get('draft_id') ?? '');
  if (!draftId) return actionFail('draft_id required');

  const { data: draft } = await supabase
    .from('act_question_drafts')
    .select('id, import_job_id, status, approved_to_id')
    .eq('id', draftId)
    .maybeSingle();
  if (!draft) return actionFail('draft not found');

  // Rejecting an already-approved draft also unwinds the promoted
  // question — keeps the listing's "approved count" honest.
  if (draft.approved_to_id) {
    await supabase.from('act_questions').delete().eq('id', draft.approved_to_id);
  }

  const { error } = await supabase
    .from('act_question_drafts')
    .update({ status: 'rejected', approved_to_id: null })
    .eq('id', draftId);
  if (error) return actionFail(`rejectDraft: ${error.message}`);

  revalidatePath(`/admin/act/imports/${draft.import_job_id}/review`);
  return actionOk();
}

// ─── finalizeJob ────────────────────────────────────────────────

export async function finalizeJob(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase } = ctx;

  const jobId = String(formData.get('job_id') ?? '');
  if (!jobId) return actionFail('job_id required');

  const { count: openCount } = await supabase
    .from('act_question_drafts')
    .select('id', { count: 'exact', head: true })
    .eq('import_job_id', jobId)
    .in('status', ['parsing', 'ready_for_review']);

  if ((openCount ?? 0) > 0) {
    return actionFail(`${openCount} drafts still need review.`);
  }

  const { error } = await supabase
    .from('act_import_jobs')
    .update({ status: 'completed' })
    .eq('id', jobId);
  if (error) return actionFail(`finalizeJob: ${error.message}`);

  revalidatePath(`/admin/act/imports/${jobId}`);
  revalidatePath(`/admin/act/imports/${jobId}/review`);
  revalidatePath('/admin/act/imports');
  return actionOk();
}
