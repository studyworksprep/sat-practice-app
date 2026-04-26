// Server-side loader for the per-question Broken button. Returns
// the data the manager/admin needs to inspect a question's stored
// content — both the editable source HTML (stored as
// stem_html / stimulus_html / rationale_html / options[].content_html)
// and the read-only rendered output (the parallel *_rendered
// columns that lib/content/render-math.mjs produces).
//
// Inspection-first: the panel is currently the only place where
// you can see exactly what MathJax wrote into the rendered cache,
// which is the right tool for debugging math display issues like
// the College Board source's pervasive display="block" problem.
//
// Role surface: only manager + admin. canEdit flag drives the
// island's editable / read-only state.

import { createClient } from '@/lib/supabase/server';

const EDIT_ROLES = new Set(['manager', 'admin']);

/**
 * @param {object} args
 * @param {string} args.questionId
 * @param {string} args.role
 * @returns {Promise<{
 *   canEdit: boolean,
 *   isBroken: boolean,
 *   raw: object | null,
 *   rendered: object | null,
 *   taxonomy: object | null,
 *   renderedSourceHash: string | null,
 * }>}
 */
export async function loadBrokenData({ questionId, role }) {
  const empty = {
    canEdit: false,
    isBroken: false,
    raw: null,
    rendered: null,
    taxonomy: null,
    renderedSourceHash: null,
  };
  if (!EDIT_ROLES.has(role) || !questionId) return empty;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('questions_v2')
    .select(
      'id, question_type, ' +
      'stem_html, stimulus_html, rationale_html, options, correct_answer, ' +
      'stem_rendered, stimulus_rendered, rationale_rendered, options_rendered, ' +
      'rendered_source_hash, ' +
      'domain_code, domain_name, skill_code, skill_name, difficulty, score_band, ' +
      'is_broken',
    )
    .eq('id', questionId)
    .maybeSingle();
  if (error) {
    // Surface the error in dev logs — silent failures here led to the
    // modal opening blank during initial testing.
    // eslint-disable-next-line no-console
    console.error('loadBrokenData query error:', error.message);
  }

  if (!data) return { ...empty, canEdit: true };

  return {
    canEdit: true,
    isBroken: !!data.is_broken,
    raw: {
      questionType: data.question_type,
      stemHtml: data.stem_html ?? '',
      stimulusHtml: data.stimulus_html ?? '',
      rationaleHtml: data.rationale_html ?? '',
      options: Array.isArray(data.options)
        ? data.options.map((o, idx) => ({
            label: o?.label ?? o?.id ?? String.fromCharCode(65 + idx),
            ordinal: o?.ordinal ?? idx,
            contentHtml: o?.content_html ?? o?.text ?? '',
          }))
        : [],
      correctAnswer: data.correct_answer ?? null,
    },
    rendered: {
      stemRendered: data.stem_rendered ?? null,
      stimulusRendered: data.stimulus_rendered ?? null,
      rationaleRendered: data.rationale_rendered ?? null,
      options: Array.isArray(data.options_rendered)
        ? data.options_rendered.map((o, idx) => ({
            label: o?.label ?? o?.id ?? String.fromCharCode(65 + idx),
            contentHtmlRendered: o?.content_html_rendered ?? null,
          }))
        : null,
    },
    taxonomy: {
      domainCode: data.domain_code ?? '',
      domainName: data.domain_name ?? '',
      skillCode: data.skill_code ?? '',
      skillName: data.skill_name ?? '',
      difficulty: data.difficulty ?? null,
      scoreBand: data.score_band ?? null,
    },
    renderedSourceHash: data.rendered_source_hash ?? null,
  };
}
