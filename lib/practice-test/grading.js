// Shared grading helpers for practice-test answers. Extracted
// from session-actions so the test Server Actions can reuse the
// same MCQ / SPR logic without pulling in session concerns.
//
// Grading uses questions_v2.correct_answer (jsonb). SPR grading is
// lib/practice/spr-grade.mjs (one definition shared with the practice
// runner and the lesson runtime); this is a thin wrapper so callers
// just pass the question row + the student's raw submission.

import { gradeSprAnswer } from '@/lib/practice/spr-grade.mjs';

/**
 * @param {object} question - questions_v2 row with question_type + correct_answer
 * @param {object} submission - { optionId?: string, responseText?: string }
 * @returns {boolean}
 */
export function gradeAnswer(question, submission) {
  const correct = question?.correct_answer;
  const isSpr   = question?.question_type === 'spr';
  if (correct == null) return false;

  if (isSpr) {
    return gradeSprAnswer((submission?.responseText ?? '').toString().trim(), correct);
  }
  return gradeMcqAnswer(submission?.optionId ?? null, correct);
}

function gradeMcqAnswer(selectedId, correct) {
  if (selectedId == null) return false;
  if (typeof correct === 'string') return correct === selectedId;
  if (Array.isArray(correct)) return correct.map(String).includes(selectedId);
  if (typeof correct === 'object') {
    if (typeof correct.option_label === 'string' && correct.option_label) {
      return correct.option_label === selectedId;
    }
    if (Array.isArray(correct.option_labels) && correct.option_labels.length > 0) {
      return correct.option_labels.map(String).includes(selectedId);
    }
  }
  return false;
}
