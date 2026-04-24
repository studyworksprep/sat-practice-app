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

  const responseNum = parseFloat(responseText);
  if (Number.isFinite(responseNum)) {
    if (numericTarget != null && Math.abs(responseNum - numericTarget) <= tolerance) {
      return true;
    }
    for (const entry of acceptableTexts) {
      const entryNum = parseFloat(entry);
      if (Number.isFinite(entryNum) && Math.abs(responseNum - entryNum) <= tolerance) {
        return true;
      }
    }
  }
  return false;
}
