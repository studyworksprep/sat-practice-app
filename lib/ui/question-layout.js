// Infer the presentation layout for a questions_v2 row based on
// its domain_code. Reading-section questions want a two-column
// layout (passage on the left, stem + options on the right);
// math questions use the single-column layout. Pages call
// inferLayoutMode(question.domain_code) and pass the result to
// <QuestionRenderer layout={…} /> — keeps the renderer layout-
// aware without making it domain-aware.
//
// Domain codes from prod:
//   Reading: CAS, EOI, INI, SEC
//   Math:    H, P, Q, S

const READING_DOMAINS = new Set(['CAS', 'EOI', 'INI', 'SEC']);
const MATH_DOMAINS    = new Set(['H', 'P', 'Q', 'S']);

/** Returns 'two-column' for reading domains, 'single' otherwise. */
export function inferLayoutMode(domainCode) {
  if (typeof domainCode !== 'string') return 'single';
  if (READING_DOMAINS.has(domainCode)) return 'two-column';
  if (MATH_DOMAINS.has(domainCode)) return 'single';
  return 'single';
}

/**
 * Which SAT section a domain belongs to. Used by the practice-start
 * filter UI to split the 8 domains into the design kit's two-
 * column Math / Reading & Writing grid. Falls back to 'math' for
 * unknown codes so a never-seen code doesn't vanish from the UI.
 *
 * @param {string|null|undefined} domainCode
 * @returns {'math' | 'rw'}
 */
export function domainSection(domainCode) {
  if (typeof domainCode !== 'string') return 'math';
  if (READING_DOMAINS.has(domainCode)) return 'rw';
  return 'math';
}
