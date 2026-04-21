// Shared helpers for extracting / formatting a questions_v2
// `correct_answer` jsonb value. Two call sites import from here:
// lib/practice/load-review-data.js (student practice + tutor
// training reveal) and app/next/(tutor)/tutor/review/[questionId]
// (teacher-mode inspection). Keeping this in one module closes the
// parallel duplication that previously sat in both files.
//
// questions_v2 stores correct_answer as an object with up to five
// keys:
//
//   { text: string | null,            // JSON-encoded array of
//                                     // accepted SPR strings, e.g.
//                                     // "[\"1/14\", \".0714\"]"
//     number: number | null,          // numeric SPR answer
//     tolerance: number | null,       // numeric SPR tolerance
//     option_label: string | null,    // single-answer MCQ, e.g. "B"
//     option_labels: string[] | null  // multi-answer MCQ (rare) }
//
// The legacy-era shape was either a plain string ("B") or an array
// of strings (["A", "C"]); a handful of rows may still surface
// that way from non-v2 code paths, so the helpers accept both.

/**
 * Return the canonical correct-option id for an MCQ question —
 * the option letter the renderer should highlight in reveal mode.
 * Multi-answer questions return the first correct label; the UI
 * surfaces the full set via the correctAnswerDisplay field.
 *
 * @param {unknown} raw - questions_v2.correct_answer (jsonb)
 * @returns {string|null}
 */
export function extractMcqCorrectId(raw) {
  if (raw == null) return null;
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.length > 0 ? String(raw[0]) : null;
  if (typeof raw === 'object') {
    if (typeof raw.option_label === 'string' && raw.option_label) {
      return raw.option_label;
    }
    if (Array.isArray(raw.option_labels) && raw.option_labels.length > 0) {
      return String(raw.option_labels[0]);
    }
  }
  return null;
}

/**
 * Format the canonical correct answer display string for an SPR
 * question — a human-readable version of every accepted answer,
 * joined with " or ". Example: "1/14 or .0714".
 *
 * @param {unknown} raw - questions_v2.correct_answer (jsonb)
 * @returns {string}
 */
export function formatSprCorrect(raw) {
  if (raw == null) return '—';
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw)) return raw.map(String).join(' or ');
  if (typeof raw === 'object') {
    if (typeof raw.text === 'string' && raw.text) {
      // text is a JSON-encoded array in v2 — parse it out. If the
      // parse fails (or produces a non-array), the string is still
      // usable as-is.
      try {
        const parsed = JSON.parse(raw.text);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.map(String).join(' or ');
        }
      } catch {
        // fall through to returning raw.text verbatim
      }
      return raw.text;
    }
    if (typeof raw.number === 'number') return String(raw.number);
  }
  return '—';
}
