// Server Actions for the per-question Broken button. Two
// entry points:
//
//   flagQuestionBroken({ questionId, isBroken })
//     - quick toggle without editing content. Sets is_broken plus
//       the last-fixed audit columns on the questions_v2 row.
//
//   saveQuestionCorrections({ questionId, ...patches })
//     - admin/manager save with potentially-edited source HTML
//       and taxonomy fields. Re-renders math via
//       lib/content/render-math.mjs and writes the updated
//       *_rendered columns + rendered_source_hash so reads stay
//       consistent without a separate backfill pass.
//
// Both gated to manager + admin via requireRole. Both actions
// run against the v2 schema directly — questions_v2 has every
// field inline, no version table to walk.
//
// Every write here returns the ids it touched (`.select('id')`)
// and fails when none come back. A PostgREST UPDATE that RLS
// filters to zero rows succeeds with no error — that is how
// manager saves used to report success while writing nothing
// (fixed DB-side by the questions_v2_manager_update policy in
// supabase/migrations/20260901120000_*). The row-count check is
// the guard that keeps any future policy or id mismatch loud
// instead of silent.

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { renderRow } from '@/lib/content/render-math.mjs';
import { loadBrokenData } from './load-broken-data';
import { mergeOptionEdits, buildTaxonomyPatch } from './corrections-patch';

const EDIT_ROLES = ['manager', 'admin'];

const NO_ROWS_WRITTEN =
  'Nothing was saved — the question was not found, or your account is not ' +
  'permitted to edit it. Nothing has changed; please report this.';

/**
 * Fetch the per-question Broken inspect/edit payload on demand.
 *
 * The dedicated review pages (QuestionReviewPage) load this
 * server-side and hand it to <BrokenButton> as props — they render
 * one question, so the cost is trivial. The report surfaces
 * (assignment + practice-test reports) render dozens of questions
 * per page, so they mount <BrokenButton lazy> instead and call this
 * the moment a manager actually opens the modal — no full source
 * HTML for 90+ questions shipped on a page nobody may flag.
 *
 * Gated to manager/admin via requireRole; loadBrokenData re-checks
 * the role it's handed, so a non-editor can't coax data out of it.
 *
 * @param {object} args
 * @param {string} args.questionId
 */
export async function loadBrokenDataAction({ questionId }) {
  if (!questionId) return actionFail('questionId required');

  let profile;
  try {
    ({ profile } = await requireRole(EDIT_ROLES));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const data = await loadBrokenData({ questionId, role: profile.role });
  return actionOk(data);
}

/**
 * Toggle the is_broken flag without touching content.
 *
 * @param {object} args
 * @param {string} args.questionId
 * @param {boolean} args.isBroken
 */
export async function flagQuestionBroken({ questionId, isBroken }) {
  if (!questionId) return actionFail('questionId required');

  let supabase;
  let user;
  try {
    ({ supabase, user } = await requireRole(EDIT_ROLES));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  const flag = !!isBroken;
  const now = new Date().toISOString();

  // questions_v2 doesn't carry broken_by / broken_at — the
  // last_fixed_* pair is the audit trail for who touched a question
  // and when. updated_by feeds the snapshot_question_content
  // trigger, which stamps it as question_content_history.edited_by.
  const { data: written, error } = await supabase
    .from('questions_v2')
    .update({
      is_broken: flag,
      last_fixed_by: user.id,
      last_fixed_at: now,
      updated_by: user.id,
      updated_at: now,
    })
    .eq('id', questionId)
    .select('id');
  if (error) return actionFail(error.message);
  if (!written?.length) return actionFail(NO_ROWS_WRITTEN);

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk({ isBroken: flag });
}

/**
 * Save edits to a question's source HTML and taxonomy. Re-renders
 * math (via mathjax-server) and writes the updated rendered
 * columns + hash so the next read uses the corrected output
 * without waiting on a backfill.
 *
 * @param {object} args
 * @param {string} args.questionId
 * @param {string} [args.stemHtml]
 * @param {string} [args.stimulusHtml]
 * @param {string} [args.rationaleHtml]
 * @param {Record<string,string>} [args.options] - { optionLabel: contentHtml }
 * @param {object} [args.taxonomy]
 * @param {boolean} [args.isBroken]
 */
export async function saveQuestionCorrections({
  questionId,
  stemHtml,
  stimulusHtml,
  rationaleHtml,
  options,
  taxonomy,
  isBroken,
}) {
  if (!questionId) return actionFail('questionId required');

  let supabase;
  let user;
  try {
    ({ supabase, user } = await requireRole(EDIT_ROLES));
  } catch (e) {
    if (e instanceof ApiError) return actionFail(e.message);
    throw e;
  }

  // Pull the current row so we can merge the patch with any field
  // the caller didn't change before re-rendering.
  const { data: current, error: readErr } = await supabase
    .from('questions_v2')
    .select('id, question_type, stem_html, stimulus_html, rationale_html, options')
    .eq('id', questionId)
    .maybeSingle();
  if (readErr) return actionFail(readErr.message);
  if (!current) return actionFail('Question not found');

  const nextStem = typeof stemHtml === 'string' ? stemHtml : current.stem_html;
  const nextStim = typeof stimulusHtml === 'string' ? stimulusHtml : current.stimulus_html;
  const nextRat  = typeof rationaleHtml === 'string' ? rationaleHtml : current.rationale_html;

  // Merge per-option content_html edits into the existing options
  // jsonb array, keyed by label / id (whichever the row uses).
  const merged = mergeOptionEdits(current.options, options);
  if (merged.unknownKeys.length > 0) {
    // The client keys its edits off the same derivation
    // loadBrokenData used, so a miss means the row changed shape
    // underneath the open modal. Refuse rather than write a patch
    // that quietly drops the manager's edit.
    return actionFail(
      `Option ${merged.unknownKeys.join(', ')} is no longer on this question — ` +
      'reopen the panel and re-apply the edit.',
    );
  }
  // Free-response questions carry options = NULL, not []. Writing []
  // over that is a real change as far as the
  // snapshot_question_content trigger is concerned — it would file a
  // content-history row for an edit that never touched options — and
  // it would hash differently from what the backfill computes for
  // the same row (sourceHash treats null and [] differently).
  const nextOptions =
    current.options == null && merged.applied.length === 0 ? null : merged.options;

  // Re-render math against the merged source. renderRow returns
  // *_rendered = null when the rendered output is byte-identical
  // to the input (no math present); that null gets stored too,
  // overwriting any stale prior render.
  let renderResult;
  try {
    renderResult = renderRow({
      id: questionId,
      stem_html: nextStem,
      stimulus_html: nextStim,
      rationale_html: nextRat,
      options: nextOptions,
    });
  } catch (e) {
    return actionFail(`Math render failed: ${e?.message ?? String(e)}`);
  }

  const now = new Date().toISOString();
  const patch = {
    stem_html: nextStem,
    stimulus_html: nextStim,
    rationale_html: nextRat,
    options: nextOptions,
    stem_rendered: renderResult.stem_rendered,
    stimulus_rendered: renderResult.stimulus_rendered,
    rationale_rendered: renderResult.rationale_rendered,
    options_rendered: renderResult.options_rendered,
    rendered_source_hash: renderResult.rendered_source_hash,
    // We just rendered, so the row is not awaiting the backfill
    // (scripts/backfill-render-math.mjs selects on rendered_at is
    // null). Keep the two in step with the hash we just wrote.
    rendered_at: now,
    updated_at: now,
  };

  // Taxonomy fields are inline on questions_v2.
  Object.assign(patch, buildTaxonomyPatch(taxonomy));

  if (isBroken !== undefined) {
    patch.is_broken = !!isBroken;
  }
  // Always tag the last-fixed audit when running through the
  // corrections path — even a no-op save is a deliberate edit
  // pass worth recording. updated_by is what the
  // snapshot_question_content trigger records as the
  // question_content_history.edited_by of the superseded version.
  patch.last_fixed_by = user.id;
  patch.last_fixed_at = now;
  patch.updated_by = user.id;

  const { data: written, error: updErr } = await supabase
    .from('questions_v2')
    .update(patch)
    .eq('id', questionId)
    .select('id');
  if (updErr) return actionFail(updErr.message);
  // The row exists (we just read it), so an empty result here means
  // RLS filtered the write. Report it instead of returning ok.
  if (!written?.length) return actionFail(NO_ROWS_WRITTEN);

  revalidatePath('/practice', 'layout');
  revalidatePath('/tutor', 'layout');
  return actionOk({
    isBroken: patch.is_broken ?? null,
    rendered: {
      stemRendered: patch.stem_rendered,
      stimulusRendered: patch.stimulus_rendered,
      rationaleRendered: patch.rationale_rendered,
      options: Array.isArray(patch.options_rendered)
        ? patch.options_rendered.map((o, idx) => ({
            label: o?.label ?? o?.id ?? String.fromCharCode(65 + idx),
            contentHtmlRendered: o?.content_html_rendered ?? null,
          }))
        : null,
    },
  });
}
