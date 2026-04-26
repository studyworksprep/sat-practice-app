// Server Actions for the per-question Broken button. Two
// entry points:
//
//   flagQuestionBroken({ questionId, isBroken })
//     - quick toggle without editing content. Sets is_broken,
//       broken_by, broken_at on the questions_v2 row.
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

'use server';

import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';
import { renderRow } from '@/lib/content/render-math.mjs';

const EDIT_ROLES = ['manager', 'admin'];

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
  const { error } = await supabase
    .from('questions_v2')
    .update({
      is_broken: flag,
      broken_by: flag ? user.id : null,
      broken_at: flag ? new Date().toISOString() : null,
    })
    .eq('id', questionId);
  if (error) return actionFail(error.message);

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
  let nextOptions = Array.isArray(current.options) ? current.options : [];
  if (options && typeof options === 'object') {
    nextOptions = nextOptions.map((opt, idx) => {
      const key = opt?.label ?? opt?.id ?? String.fromCharCode(65 + idx);
      const incoming = options[key];
      if (typeof incoming !== 'string' || incoming === opt?.content_html) {
        return opt;
      }
      return { ...opt, content_html: incoming };
    });
  }

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
    updated_at: new Date().toISOString(),
  };

  // Taxonomy fields are inline on questions_v2.
  if (taxonomy && typeof taxonomy === 'object') {
    if (taxonomy.difficulty !== undefined) {
      patch.difficulty = Number(taxonomy.difficulty) || null;
    }
    if (taxonomy.scoreBand !== undefined) {
      patch.score_band = Number(taxonomy.scoreBand) || null;
    }
    if (typeof taxonomy.domainCode === 'string') {
      patch.domain_code = taxonomy.domainCode || null;
      patch.domain_name = taxonomy.domainName || null;
    }
    if (typeof taxonomy.skillCode === 'string') {
      patch.skill_code = taxonomy.skillCode || null;
      patch.skill_name = taxonomy.skillName || null;
    }
  }

  if (isBroken !== undefined) {
    const flag = !!isBroken;
    patch.is_broken = flag;
    patch.broken_by = flag ? user.id : null;
    patch.broken_at = flag ? new Date().toISOString() : null;
  }

  const { error: updErr } = await supabase
    .from('questions_v2')
    .update(patch)
    .eq('id', questionId);
  if (updErr) return actionFail(updErr.message);

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
