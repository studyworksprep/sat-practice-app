// Server Actions for the ACT rationale pipeline (Phase 2b).
//
//   generateActRationaleBatch — pick up to N live questions that have
//                               no rationale and no draft yet (optionally
//                               narrowed to a section / form), generate
//                               a rationale for each with Claude, and
//                               upsert the results into
//                               act_rationale_drafts. Runs a few in
//                               parallel; each result is independent so
//                               a single failure doesn't lose the batch.
//   regenerateActRationale    — redo one question (replaces its draft).
//   saveActRationaleDraft     — admin edits the draft text in place.
//   approveActRationale       — copy the draft onto
//                               act_questions.rationale_html; mark the
//                               draft approved.
//   rejectActRationale        — mark rejected (leaves the question
//                               rationale-less; regenerate later).
//   bulkApproveActRationales  — approve every pending draft in scope that
//                               has no validator errors, no warnings and
//                               isn't held for review. This is the
//                               "sample ten percent, then approve the
//                               rest" step — the reviewer approves the
//                               sample by hand first.
//
// All admin-only (requireRole); RLS double-gates writes on both tables.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import type { ActionResult } from '@/lib/types';
import { isActSection } from '@/lib/practice/act-taxonomy';
import { generateRationale, type RationaleSource } from '@/lib/act-rationale/generate';

const MAX_BATCH = 10;
const DEFAULT_BATCH = 5;
const CONCURRENCY = 3;

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
  return typeof v === 'string' ? v.trim() : '';
}

function revalidate() {
  revalidatePath('/admin/act/rationales');
  revalidatePath('/admin/act/questions');
}

interface QuestionRow {
  id: string;
  section: string;
  category: string | null;
  subcategory: string | null;
  stimulus_html: string | null;
  stem_html: string;
}

interface OptionRow {
  question_id: string;
  label: string;
  content_html: string;
  is_correct: boolean;
}

/** Load the generation inputs for a set of question ids. */
async function loadSources(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  ids: string[],
): Promise<Map<string, RationaleSource>> {
  const out = new Map<string, RationaleSource>();
  if (ids.length === 0) return out;
  const [{ data: questions }, { data: options }] = await Promise.all([
    supabase
      .from('act_questions')
      .select('id, section, category, subcategory, stimulus_html, stem_html')
      .in('id', ids),
    supabase
      .from('act_answer_options')
      .select('question_id, label, content_html, is_correct')
      .in('question_id', ids)
      .order('label', { ascending: true }),
  ]);
  const optionsByQ = new Map<string, OptionRow[]>();
  for (const o of (options ?? []) as OptionRow[]) {
    const arr = optionsByQ.get(o.question_id) ?? [];
    arr.push(o);
    optionsByQ.set(o.question_id, arr);
  }
  for (const q of (questions ?? []) as QuestionRow[]) {
    out.set(q.id, {
      id: q.id,
      section: q.section,
      category: q.category,
      subcategory: q.subcategory,
      stimulus_html: q.stimulus_html,
      stem_html: q.stem_html,
      options: (optionsByQ.get(q.id) ?? []).map((o) => ({
        label: o.label,
        content_html: o.content_html,
        is_correct: o.is_correct,
      })),
    });
  }
  return out;
}

/** Generate + upsert one draft. Returns an error string on failure. */
async function generateAndStore(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  src: RationaleSource,
): Promise<string | null> {
  let generated;
  try {
    generated = await generateRationale(src);
  } catch (err) {
    return (err as Error).message || 'generation failed';
  }
  // Figure questions are always held for review (the model saw the
  // image by URL, but a human still checks it read the figure
  // correctly). Validator errors are stored as warnings too, so the
  // reviewer sees them first and bulk approve never picks them up.
  const warnings = [...generated.errors.map((e) => `ERROR: ${e}`), ...generated.warnings];
  const needsReview = generated.figureUrls.length > 0 || generated.errors.length > 0 || warnings.length > 0;
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('act_rationale_drafts')
    .upsert(
      {
        question_id: src.id,
        rationale_html: generated.rationaleHtml,
        answer_letter: generated.answerLetter || null,
        confidence: generated.confidence,
        model_notes: generated.notes || null,
        model: generated.model,
        prompt_version: generated.promptVersion,
        status: 'pending',
        needs_review: needsReview,
        warnings,
        generated_by: userId,
        reviewed_by: null,
        reviewed_at: null,
        updated_at: now,
      },
      { onConflict: 'question_id' },
    );
  return error ? `save failed: ${error.message}` : null;
}

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
}

// ─── generateActRationaleBatch ─────────────────────────────────

export async function generateActRationaleBatch(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ generated: number; failed: Array<{ id: string; error: string }>; remaining: number }>> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;

  const section = str(formData.get('section'));
  const form = str(formData.get('form'));
  const limitRaw = Number.parseInt(str(formData.get('limit')) || String(DEFAULT_BATCH), 10);
  const limit = Number.isFinite(limitRaw) ? Math.min(MAX_BATCH, Math.max(1, limitRaw)) : DEFAULT_BATCH;
  if (section && !isActSection(section)) return actionFail('Unknown section.');

  // Candidates: live questions with no rationale. Then drop any that
  // already have a draft (pending/approved/rejected — rejected ones
  // are regenerated one at a time from the review list, not swept
  // back into the batch).
  let q = supabase
    .from('act_questions')
    .select('id')
    .is('deleted_at', null)
    .or('rationale_html.is.null,rationale_html.eq.')
    .order('source_test', { ascending: true, nullsFirst: false })
    .order('section', { ascending: true })
    .order('source_ordinal', { ascending: true, nullsFirst: false });
  if (section) q = q.eq('section', section);
  if (form) q = q.eq('source_test', form);
  const { data: candidates, error: candErr } = await q;
  if (candErr) return actionFail(`Could not list questions: ${candErr.message}`);
  const candidateIds = ((candidates ?? []) as Array<{ id: string }>).map((r) => r.id);
  if (candidateIds.length === 0) {
    return { ok: true, generated: 0, failed: [], remaining: 0 };
  }

  const { data: drafted } = await supabase
    .from('act_rationale_drafts')
    .select('question_id')
    .in('question_id', candidateIds);
  const hasDraft = new Set(((drafted ?? []) as Array<{ question_id: string }>).map((r) => r.question_id));
  const todo = candidateIds.filter((id) => !hasDraft.has(id));
  const picked = todo.slice(0, limit);

  const sources = await loadSources(supabase, picked);
  const failed: Array<{ id: string; error: string }> = [];
  let generated = 0;
  await runWithConcurrency(picked, CONCURRENCY, async (id) => {
    const src = sources.get(id);
    if (!src) { failed.push({ id, error: 'question not found' }); return; }
    const err = await generateAndStore(supabase, user.id, src);
    if (err) failed.push({ id, error: err });
    else generated += 1;
  });

  revalidate();
  return { ok: true, generated, failed, remaining: Math.max(0, todo.length - picked.length) };
}

// ─── regenerateActRationale ────────────────────────────────────

export async function regenerateActRationale(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;
  const questionId = str(formData.get('question_id'));
  if (!questionId) return actionFail('question_id required');

  const sources = await loadSources(supabase, [questionId]);
  const src = sources.get(questionId);
  if (!src) return actionFail('Question not found.');
  const err = await generateAndStore(supabase, user.id, src);
  if (err) return actionFail(err);
  revalidate();
  return actionOk();
}

// ─── saveActRationaleDraft ─────────────────────────────────────

export async function saveActRationaleDraft(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase } = ctx;
  const draftId = str(formData.get('draft_id'));
  const html = str(formData.get('rationale_html'));
  if (!draftId) return actionFail('draft_id required');
  if (!html) return actionFail('Rationale cannot be empty.');

  const { data, error } = await supabase
    .from('act_rationale_drafts')
    .update({ rationale_html: html, updated_at: new Date().toISOString() })
    .eq('id', draftId)
    .select('id');
  if (error) return actionFail(error.message);
  if (!data || data.length === 0) return actionFail('Draft not found.');
  revalidate();
  return actionOk();
}

// ─── approve / reject ──────────────────────────────────────────

async function approveDraftRow(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  draft: { id: string; question_id: string; rationale_html: string },
): Promise<string | null> {
  const now = new Date().toISOString();
  const { data: updatedQ, error: qErr } = await supabase
    .from('act_questions')
    .update({ rationale_html: draft.rationale_html, updated_at: now, updated_by: userId })
    .eq('id', draft.question_id)
    .select('id');
  if (qErr) return qErr.message;
  if (!updatedQ || updatedQ.length === 0) return 'question not found';
  const { error: dErr } = await supabase
    .from('act_rationale_drafts')
    .update({ status: 'approved', reviewed_by: userId, reviewed_at: now, updated_at: now })
    .eq('id', draft.id);
  return dErr ? dErr.message : null;
}

export async function approveActRationale(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;
  const draftId = str(formData.get('draft_id'));
  if (!draftId) return actionFail('draft_id required');

  // An edit made in the same click rides along so "fix a word and
  // approve" is one action.
  const edited = str(formData.get('rationale_html'));

  const { data: draft, error } = await supabase
    .from('act_rationale_drafts')
    .select('id, question_id, rationale_html, status')
    .eq('id', draftId)
    .maybeSingle();
  if (error) return actionFail(error.message);
  if (!draft) return actionFail('Draft not found.');

  const html = edited || (draft as { rationale_html: string }).rationale_html;
  if (!html.trim()) return actionFail('Rationale cannot be empty.');
  const err = await approveDraftRow(supabase, user.id, {
    id: draftId,
    question_id: (draft as { question_id: string }).question_id,
    rationale_html: html,
  });
  if (err) return actionFail(`Approve failed: ${err}`);
  if (edited) {
    await supabase.from('act_rationale_drafts').update({ rationale_html: html }).eq('id', draftId);
  }
  revalidate();
  return actionOk();
}

export async function rejectActRationale(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;
  const draftId = str(formData.get('draft_id'));
  if (!draftId) return actionFail('draft_id required');
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from('act_rationale_drafts')
    .update({ status: 'rejected', reviewed_by: user.id, reviewed_at: now, updated_at: now })
    .eq('id', draftId)
    .select('id');
  if (error) return actionFail(error.message);
  if (!data || data.length === 0) return actionFail('Draft not found.');
  revalidate();
  return actionOk();
}

// ─── bulkApproveActRationales ──────────────────────────────────

export async function bulkApproveActRationales(
  _prev: ActionResult | null,
  formData: FormData,
): Promise<ActionResult<{ approved: number; skipped: number }>> {
  let ctx;
  try { ctx = await getAdminCtx(); } catch (e) {
    return (e as ApiError).toActionResult();
  }
  const { supabase, user } = ctx;
  const section = str(formData.get('section'));
  const form = str(formData.get('form'));
  if (section && !isActSection(section)) return actionFail('Unknown section.');

  // Clean pending drafts only: not held for review, no warnings.
  // Scope by section/form through the question row.
  let q = supabase
    .from('act_rationale_drafts')
    .select('id, question_id, rationale_html, warnings, question:act_questions!inner(section, source_test, deleted_at)')
    .eq('status', 'pending')
    .eq('needs_review', false)
    .is('question.deleted_at', null);
  if (section) q = q.eq('question.section', section);
  if (form) q = q.eq('question.source_test', form);
  const { data: drafts, error } = await q;
  if (error) return actionFail(`Could not list drafts: ${error.message}`);

  let approved = 0;
  let skipped = 0;
  for (const d of (drafts ?? []) as Array<{ id: string; question_id: string; rationale_html: string; warnings: unknown }>) {
    const warnings = Array.isArray(d.warnings) ? d.warnings : [];
    if (warnings.length > 0 || !d.rationale_html?.trim()) { skipped += 1; continue; }
    const err = await approveDraftRow(supabase, user.id, d);
    if (err) skipped += 1; else approved += 1;
  }
  revalidate();
  return { ok: true, approved, skipped };
}
