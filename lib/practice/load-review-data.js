// Helper to load the review-mode reveal data for a question — the
// correct answer and the rationale, watermarked. See
// docs/architecture-plan.md §3.7.
//
// Used by every session display page (student practice, tutor
// training, and the new student review session) when the student
// has already submitted the question. The reveal happens server-
// side via the same data path the submitAnswer Server Action uses,
// so the rationale is delivered through a single canonical loader.
//
// Why this is its own module: the eager-reveal-on-revisit behavior
// is shared by every session type, but the page-specific session
// queries are not, so the cleanest separation is "page loads its
// own session, then asks this helper to fill in the reveal data
// when needed."
//
// Returns null if there's no reveal data to load (e.g., no prior
// attempt, or the question version row is missing).

import { applyWatermark } from '@/lib/content/watermark';

/**
 * @param {object} args
 * @param {object} args.supabase - Supabase server client
 * @param {string} args.userId - the current user's id (for watermarking)
 * @param {string} args.questionId
 * @param {string} args.questionVersionId - the current version row id
 * @returns {Promise<{
 *   correctOptionId: string|null,
 *   correctAnswerDisplay: string|null,
 *   rationaleHtml: string|null,
 * }|null>}
 */
export async function loadReviewData({ supabase, userId, questionId, questionVersionId }) {
  if (!questionVersionId) return null;

  const [{ data: version }, { data: correctAnswer }] = await Promise.all([
    supabase
      .from('question_versions')
      .select('id, question_type, rationale_html')
      .eq('id', questionVersionId)
      .maybeSingle(),
    supabase
      .from('correct_answers')
      .select('correct_option_id, correct_option_ids, correct_text, correct_number, numeric_tolerance, answer_type')
      .eq('question_version_id', questionVersionId)
      .maybeSingle(),
  ]);

  if (!version) return null;

  const isSpr = version.question_type === 'spr';

  return {
    correctOptionId: correctAnswer?.correct_option_id ?? null,
    correctAnswerDisplay: isSpr && correctAnswer ? formatSprCorrectAnswer(correctAnswer) : null,
    rationaleHtml: applyWatermark(version.rationale_html, userId),
  };
}

// ──────────────────────────────────────────────────────────────
// Local SPR helpers (mirrored from session-actions.js so this
// helper has no cross-dependency on the 'use server' module)
// ──────────────────────────────────────────────────────────────

function parseCorrectTextList(raw) {
  if (raw == null) return [];
  const s = String(raw).trim();
  if (!s) return [];
  if (s.startsWith('[') && s.endsWith(']')) {
    try {
      const parsed = JSON.parse(s);
      if (Array.isArray(parsed)) return parsed.map((x) => String(x));
    } catch {
      // fall through
    }
  }
  return [s];
}

function formatSprCorrectAnswer(correctAnswer) {
  const list = parseCorrectTextList(correctAnswer.correct_text);
  if (list.length > 0) return list.join(' or ');
  if (correctAnswer.correct_number != null) {
    return String(correctAnswer.correct_number);
  }
  return '—';
}
