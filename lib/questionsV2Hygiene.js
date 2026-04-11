// Helpers for deciding which questions_v2 rows actually need the
// "Fix with Claude" treatment and which model to route them to.
//
// Used in two places:
//
//   1. app/api/admin/questions-v2/fix/route.js — server-side short-circuits
//      clean rows (returns { ok: true, skipped: true } without calling
//      Claude) and routes dirty rows to Haiku or Sonnet based on
//      complexity.
//
//   2. components/QuestionsV2Preview.js — surfaces a "Clean" indicator
//      next to rows that don't need fixing, so admins can skip them
//      by eye instead of hitting the API.
//
// Keeping these heuristics in one module means both sides stay in sync
// and we can iterate on the rules without hunting through components.

// Patterns that unambiguously mean a row still contains CollegeBoard
// formatting garbage. Any single hit flags the row as "dirty" (needs
// fixing). Keep this list conservative — false positives just waste
// API calls, false negatives silently leave garbage in the DB.
const DIRTY_PATTERNS = [
  // HTML entities that should be decoded to real characters
  /&(?:rsquo|lsquo|ldquo|rdquo|mdash|ndash|nbsp|deg);/,

  // CollegeBoard-specific class markers
  /\bclass="[^"]*\b(?:passage|passage_para|prose|style:|choice_paragraph|math_expression|math-container|table_wrapper|table_WithBorder|stimulus_reference|tcp-)[^"]*"/,

  // <span class="italic">x</span> wrapping single variables
  /<span\b[^>]*\bclass="[^"]*\bitalic\b/i,

  // <img alt="…"> tags are always wrong in the final schema — they
  // have to be converted to LaTeX.
  /<img\b[^>]*\balt=/i,

  // Raw Unicode math characters outside LaTeX delimiters. This is a
  // heuristic (the char might already be inside \( … \)) but hits in
  // practice are almost always real garbage.
  /[×÷≤≥≠π∑√∞∞θ]/,

  // Double-space inside class attributes — a CollegeBoard signature
  // left behind by their templating ("choice_paragraph ", "prose ").
  /\bclass="[^"]*  [^"]*"/,

  // Nested tables: <table>…<table — always needs flattening
  /<table\b[^>]*>[\s\S]*?<table\b/i,
];

// Extra-expensive patterns that benefit from Sonnet's reasoning over
// Haiku's speed. If ANY match hits, we route the row to Sonnet.
// Everything else goes to Haiku.
const SONNET_PATTERNS = [
  // Non-trivial <img alt> — short alt like alt="" isn't worth Sonnet,
  // but alt="f of x equals …" with actual descriptive prose needs
  // semantic reasoning to map to LaTeX.
  /<img\b[^>]*\balt=["'][^"']{12,}/i,

  // Nested tables — structural rewriting benefits from Sonnet.
  /<table\b[^>]*>[\s\S]*?<table\b/i,
];

function joinRowText(row) {
  const parts = [row?.stimulus_html || '', row?.stem_html || ''];
  if (Array.isArray(row?.options)) {
    for (const opt of row.options) parts.push(opt?.content_html || '');
  }
  return parts.join('\n');
}

/**
 * Return true if the row has no detectable CollegeBoard garbage and
 * doesn't need Claude at all. Safe to use as a cheap pre-filter.
 */
export function isAlreadyClean(row) {
  const text = joinRowText(row);
  if (!text.trim()) return true; // empty rows are "clean" by vacuous truth
  return !DIRTY_PATTERNS.some((p) => p.test(text));
}

/**
 * Return true if the row has complex patterns that warrant Sonnet.
 * Trivial garbage (entities, class names, italic spans) goes to Haiku.
 */
export function needsSonnet(row) {
  const text = joinRowText(row);
  return SONNET_PATTERNS.some((p) => p.test(text));
}

/**
 * Return the model id to use for a row. Exported so both the
 * synchronous fix route and the batch script stay in sync.
 */
export function pickModel(row) {
  return needsSonnet(row) ? 'claude-sonnet-4-6' : 'claude-haiku-4-5-20251001';
}
