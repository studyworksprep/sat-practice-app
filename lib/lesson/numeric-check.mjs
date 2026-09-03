// Numeric-entry knowledge checks (lesson-improvement plan 1.6).
//
// A `check` block with `input: "numeric"` takes a typed answer instead
// of a choice — the lesson-side counterpart of the SAT's student-
// produced response, which is a quarter of the math section. It keeps
// block_type = 'check' (no DB migration) and reuses the check's whole
// retry / hint / solution / escalation machinery; only the answer
// surface changes.
//
// Content shape:
//   {
//     "input": "numeric",
//     "answer": "25/2",          // the keyed answer, as a learner would type it
//     "accept": ["12.5"],        // optional: equivalent typeable forms
//     "tolerance": 0,            // optional: numeric slack (≥ 0), for rounded answers
//     "prompt", "explanation", "allow_retry", "hint", "solution", ...
//   }
//   No choices / correct_index — a check is one shape or the other.
//
// Grading goes through lib/practice/spr-grade.mjs, the same function
// the question bank uses, by building the bank's correct_answer shape
// from these fields. So "what counts as right" has one definition:
// text match against answer + accept, else numeric match within
// tolerance, with a/b fractions and decimals equivalent.

import { gradeSprAnswer, toStrictNumber } from '../practice/spr-grade.mjs';

export const NUMERIC_INPUT = 'numeric';

/** Whether a check's content asks for a typed number. */
export function isNumericCheck(content) {
  return content?.input === NUMERIC_INPUT;
}

function asAnswerString(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string') return value.trim();
  return '';
}

/** The acceptable typed forms, keyed answer first, empties dropped. */
export function numericCheckAnswers(content) {
  const out = [];
  const primary = asAnswerString(content?.answer);
  if (primary) out.push(primary);
  const accept = Array.isArray(content?.accept) ? content.accept : [];
  for (const entry of accept) {
    const text = asAnswerString(entry);
    if (text && !out.includes(text)) out.push(text);
  }
  return out;
}

/**
 * The bank-shaped correct_answer for this check — what gradeSprAnswer
 * consumes. `number` is the keyed answer's value so a numeric match
 * works even when the learner types a form not listed in accept.
 */
export function numericCheckCorrectAnswer(content) {
  const answers = numericCheckAnswers(content);
  const number = toStrictNumber(answers[0]);
  const tolerance = content?.tolerance;
  return {
    text: JSON.stringify(answers),
    ...(Number.isFinite(number) ? { number } : {}),
    ...(typeof tolerance === 'number' && Number.isFinite(tolerance) && tolerance >= 0
      ? { tolerance }
      : {}),
  };
}

/** Grade a typed response. */
export function gradeNumericCheck(content, response) {
  const typed = String(response ?? '').trim();
  if (!typed) return false;
  return gradeSprAnswer(typed, numericCheckCorrectAnswer(content));
}

/** "25/2 or 12.5" — for the post-answer reveal and admin preview. */
export function formatNumericCheckAnswer(content) {
  const answers = numericCheckAnswers(content);
  return answers.length > 0 ? answers.join(' or ') : '—';
}

/**
 * Content problems, as messages. Empty means valid. Used by the lesson
 * validator (as errors) and the editor.
 */
export function validateNumericCheckContent(content) {
  const problems = [];
  const c = content || {};

  const answer = asAnswerString(c.answer);
  if (!answer) {
    problems.push('answer is required for a numeric check.');
  } else if (!Number.isFinite(toStrictNumber(answer))) {
    problems.push(
      `answer "${answer}" is not a number the learner could type — use a whole number, a decimal, or an a/b fraction.`,
    );
  }

  if (c.accept != null) {
    if (!Array.isArray(c.accept)) {
      problems.push('accept must be an array of equivalent typeable forms.');
    } else {
      for (const entry of c.accept) {
        const text = asAnswerString(entry);
        if (!text || !Number.isFinite(toStrictNumber(text))) {
          problems.push(
            `accept entry "${String(entry)}" is not a number the learner could type.`,
          );
        }
      }
    }
  }

  if (c.tolerance != null) {
    if (typeof c.tolerance !== 'number' || !Number.isFinite(c.tolerance) || c.tolerance < 0) {
      problems.push('tolerance must be a number ≥ 0.');
    }
  }

  if (Array.isArray(c.choices) && c.choices.length > 0) {
    problems.push('a numeric check carries no choices — remove choices/correct_index or drop input: "numeric".');
  } else if (c.correct_index != null) {
    problems.push('a numeric check carries no correct_index.');
  }

  return problems;
}
