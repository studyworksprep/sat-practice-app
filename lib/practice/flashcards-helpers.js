// Shared helpers for the flashcards feature. Keeps server-action
// glue separate from page-level fetch / rendering helpers.
//
// ensureDefaultSets exists so a new user lands on /flashcards
// with the two seed sets already created, instead of an empty
// state. Idempotent — only inserts the missing ones, so calling
// it on every page load is safe (and cheap, since it's a single
// indexed read + at most one write).

const DEFAULT_SETS = ['My Math', 'My Reading'];

export async function ensureDefaultSets(supabase, userId) {
  const { data: existing } = await supabase
    .from('flashcard_sets')
    .select('id, name')
    .eq('user_id', userId)
    .eq('is_default', true);

  const existingNames = new Set((existing ?? []).map((row) => row.name));
  const missing = DEFAULT_SETS.filter((n) => !existingNames.has(n));
  if (missing.length === 0) return;

  await supabase.from('flashcard_sets').insert(
    missing.map((name) => ({ user_id: userId, name, is_default: true })),
  );
}

// Mastery vocabulary — kept here so the review flow + the per-set
// list + the landing page all read the same labels.
export const MASTERY_LABELS = [
  'Not started', // 0
  'Hard',        // 1
  'Difficult',   // 2
  'Okay',        // 3
  'Good',        // 4
  'Mastered',    // 5
];

// Numeric labels used in the legacy mastery buttons. Mapped onto
// our token vocabulary instead of the raw hex from the v1 page so
// the visual stays consistent with the rest of the new tree.
export const MASTERY_TONE = [
  'low',         // 0 — Not started, slate
  'low',         // 1 — Hard, danger
  'midLow',      // 2 — Difficult, warning
  'mid',         // 3 — Okay, neutral
  'midHigh',     // 4 — Good, info
  'high',        // 5 — Mastered, success
];
