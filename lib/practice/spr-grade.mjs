// Student-produced-response grading — the one home for the SAT
// answer-format semantics: a plain number, a decimal, or an a/b
// fraction, matched against an acceptable-answer list first and a
// numeric target (with optional tolerance) second.
//
// Extracted 2026-09 from lib/practice/session-actions.ts and
// lib/practice-test/grading.js, which carried identical copies. The
// lesson runtime's numeric-entry checks (lib/lesson/numeric-check.mjs,
// plan 1.6) grade through the same function, so a lesson check accepts
// exactly what the question bank accepts — one definition of "right",
// not three.
//
// PURE: no I/O. `correct` is questions_v2.correct_answer in any of the
// shapes the bank has stored over time:
//
//   { text: "[\"1/14\", \".0714\"]", number: 0.0714, tolerance: null }
//                                   — v2's object shape; text is a
//                                     JSON-encoded array of strings
//   "12.5"  |  ["12.5", "25/2"]  |  12.5
//                                   — legacy plain string / array / number
//
// Match order:
//   1. Text. Both sides are lowercased, whitespace-collapsed, trimmed,
//      and compared against every acceptable string.
//   2. Numeric. If text fails and the response parses strictly as a
//      number, compare it to the numeric target and to each acceptable
//      string that parses, within `tolerance` (default 0).

/** Lowercase, collapse whitespace, trim. */
export function normalizeText(s) {
  return (s ?? '').toString().toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Strict numeric parser. Unlike parseFloat, this rejects trailing
 * garbage — parseFloat("23/60") returns 23, which used to make "23/90"
 * collide with "23/60" in the numeric fallback. An a/b fraction is
 * evaluated when both sides are pure numbers; anything else that is not
 * a valid Number returns NaN.
 *
 * @param {unknown} s
 * @returns {number} the value, or NaN
 */
export function toStrictNumber(s) {
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

/**
 * Grade a typed response against a correct-answer value.
 *
 * @param {string} responseText  what the student typed
 * @param {unknown} correct      the correct answer, any stored shape
 * @returns {boolean}
 */
export function gradeSprAnswer(responseText, correct) {
  // Both guards the two former copies carried: an empty response can
  // never match (acceptable strings are non-empty and '' is not a
  // number), and a missing key can never be matched against.
  if (!responseText) return false;
  if (correct == null) return false;

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
