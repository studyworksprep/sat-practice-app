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
// v2-aware: reads rationale_html and correct_answer (jsonb) directly
// off the questions_v2 row. No more question_versions/correct_answers
// table lookups.

import { applyWatermark } from '@/lib/content/watermark';
import { extractMcqCorrectId, formatSprCorrect } from '@/lib/practice/correct-answer';

/**
 * @param {object} args
 * @param {object} args.supabase - Supabase server client
 * @param {string} args.userId - the current user's id (for watermarking)
 * @param {string} args.questionId - questions_v2.id
 * @returns {Promise<{
 *   correctOptionId: string|null,
 *   correctAnswerDisplay: string|null,
 *   rationaleHtml: string|null,
 * }|null>}
 */
export async function loadReviewData({ supabase, userId, questionId }) {
  if (!questionId) return null;

  const { data: question } = await supabase
    .from('questions_v2')
    .select('question_type, rationale_html, rationale_rendered, correct_answer')
    .eq('id', questionId)
    .maybeSingle();

  if (!question) return null;

  const isSpr = question.question_type === 'spr';
  const correct = question.correct_answer;

  return {
    correctOptionId: !isSpr ? extractMcqCorrectId(correct) : null,
    correctAnswerDisplay: isSpr ? formatSprCorrect(correct) : null,
    rationaleHtml: applyWatermark(
      question.rationale_rendered ?? question.rationale_html,
      userId,
    ),
  };
}

// extractMcqCorrectId / formatSprCorrect live in
// lib/practice/correct-answer.js — imported at the top of this file.
