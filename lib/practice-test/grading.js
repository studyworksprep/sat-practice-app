// Shared grading helpers for practice-test answers. Extracted
// from session-actions so the test Server Actions can reuse the
// same MCQ / SPR logic without pulling in session concerns.
//
// Grading uses questions_v2.correct_answer (jsonb). See
// lib/practice/session-actions.js for the canonical shapes the
// grader accepts; this is a thin wrapper so callers just pass
// the question row + the student's raw submission.

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

function normalizeText(s) {
  return (s ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

// Strict numeric parser for SPR grading. Unlike parseFloat, this
// rejects trailing garbage — parseFloat("23/60") returns 23, which
// used to make "23/90" collide with "23/60" in the numeric fallback
// below. Fraction strings like "a/b" are evaluated as a/b when both
// sides are pure numbers; anything else that isn't a valid Number
// returns NaN.
function toStrictNumber(s) {
  const str = (s ?? '').toString().trim();
  if (!str) return NaN;
  const frac = str.match(/^(-?\d*\.?\d+)\/(-?\d*\.?\d+)$/);
  if (frac) {
    const num = Number(frac[1]);
    const den = Number(frac[2]);
    if (Number.isFinite(num) && Number.isFinite(den) && den !== 0) {
      return num / den;
    }
    return NaN;
  }
  const n = Number(str);
  return Number.isFinite(n) ? n : NaN;
}

function gradeSprAnswer(responseText, correct) {
  if (!responseText) return false;
  const acceptableTexts = [];
  let numericTarget = null;
  let tolerance = 0;

  if (typeof correct === 'string') {
    acceptableTexts.push(correct);
  } else if (Array.isArray(correct)) {
    for (const v of correct) acceptableTexts.push(String(v));
  } else if (typeof correct === 'object') {
    if (typeof correct.text === 'string' && correct.text) {
      try {
        const parsed = JSON.parse(correct.text);
        if (Array.isArray(parsed)) {
          for (const v of parsed) acceptableTexts.push(String(v));
        } else {
          acceptableTexts.push(correct.text);
        }
      } catch {
        acceptableTexts.push(correct.text);
      }
    }
    if (typeof correct.number === 'number') {
      numericTarget = correct.number;
      acceptableTexts.push(String(correct.number));
    }
    if (typeof correct.tolerance === 'number') tolerance = correct.tolerance;
  } else if (typeof correct === 'number') {
    numericTarget = correct;
    acceptableTexts.push(String(correct));
  }

  if (acceptableTexts.length === 0 && numericTarget == null) return false;

  const normalized = normalizeText(responseText);
  if (acceptableTexts.some((a) => normalizeText(a) === normalized)) return true;

  const responseNum = toStrictNumber(responseText);
  if (Number.isFinite(responseNum)) {
    if (numericTarget != null && Math.abs(responseNum - numericTarget) <= tolerance) {
      return true;
    }
    for (const entry of acceptableTexts) {
      const entryNum = toStrictNumber(entry);
      if (Number.isFinite(entryNum) && Math.abs(responseNum - entryNum) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}
