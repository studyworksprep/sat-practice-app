// Pure helpers for the Broken-panel corrections save
// (lib/practice/broken-actions.js → saveQuestionCorrections).
//
// Kept out of the 'use server' module so the merge rules — which
// decide whether a manager's edit reaches the DB at all — are unit
// testable. See corrections-patch.test.mjs.
//
// The options jsonb on questions_v2 is a uniform
// `{ label, ordinal, content_html }` array today, but the label key
// is derived defensively (label → id → positional A/B/C/D) so the
// key the client edits under and the key we merge on are computed
// the same way here and in load-broken-data.js.

/** One entry of the questions_v2.options jsonb array. */
export interface QuestionOption {
  label?: string | null;
  id?: string | null;
  ordinal?: number | null;
  content_html?: string | null;
  [key: string]: unknown;
}

/** Taxonomy edits as the modal sends them (camelCase, sparse). */
export interface TaxonomyEdits {
  difficulty?: number | null;
  scoreBand?: number | null;
  domainCode?: string | null;
  domainName?: string | null;
  skillCode?: string | null;
  skillName?: string | null;
}

/** Column-shaped taxonomy patch destined for questions_v2. */
export interface TaxonomyPatch {
  difficulty?: number | null;
  score_band?: number | null;
  domain_code?: string | null;
  domain_name?: string | null;
  skill_code?: string | null;
  skill_name?: string | null;
}

export interface MergeOptionsResult {
  /** The full options array with edits applied. */
  options: QuestionOption[];
  /** Keys whose incoming HTML differed and was written. */
  applied: string[];
  /** Keys the caller sent that match no option — a dropped edit. */
  unknownKeys: string[];
}

/**
 * The key an option is addressed by. Mirrors loadBrokenData's
 * label derivation exactly — if the two ever diverge, edits get
 * silently dropped on save.
 */
export function optionKey(opt: QuestionOption | null | undefined, idx: number): string {
  return opt?.label ?? opt?.id ?? String.fromCharCode(65 + idx);
}

/**
 * Merge per-option `content_html` edits into the existing options
 * array, keyed by optionKey().
 *
 * Unchanged options are returned by identity. Keys that match no
 * option are reported in `unknownKeys` rather than ignored — a
 * dropped edit must not look like a successful save.
 */
export function mergeOptionEdits(
  currentOptions: unknown,
  edits: Record<string, unknown> | null | undefined,
): MergeOptionsResult {
  const options: QuestionOption[] = Array.isArray(currentOptions)
    ? (currentOptions as QuestionOption[])
    : [];

  if (!edits || typeof edits !== 'object') {
    return { options, applied: [], unknownKeys: [] };
  }

  const applied: string[] = [];
  const seen = new Set<string>();

  const merged = options.map((opt, idx) => {
    const key = optionKey(opt, idx);
    seen.add(key);
    if (!Object.prototype.hasOwnProperty.call(edits, key)) return opt;

    const incoming = edits[key];
    if (typeof incoming !== 'string' || incoming === opt?.content_html) return opt;

    applied.push(key);
    return { ...opt, content_html: incoming };
  });

  const unknownKeys = Object.keys(edits).filter((k) => !seen.has(k));
  return { options: merged, applied, unknownKeys };
}

/**
 * Translate the modal's camelCase taxonomy edits into
 * questions_v2 columns. Only keys the caller actually sent are
 * emitted, so an untouched field is never overwritten.
 *
 * Domain and skill move as name/code pairs — the modal edits them
 * together and a code without its display name is a broken row.
 */
export function buildTaxonomyPatch(
  taxonomy: TaxonomyEdits | null | undefined,
): TaxonomyPatch {
  const patch: TaxonomyPatch = {};
  if (!taxonomy || typeof taxonomy !== 'object') return patch;

  if (taxonomy.difficulty !== undefined) {
    patch.difficulty = normalizeInt(taxonomy.difficulty);
  }
  if (taxonomy.scoreBand !== undefined) {
    patch.score_band = normalizeInt(taxonomy.scoreBand);
  }
  if (typeof taxonomy.domainCode === 'string') {
    patch.domain_code = taxonomy.domainCode || null;
    patch.domain_name = taxonomy.domainName || null;
  }
  if (typeof taxonomy.skillCode === 'string') {
    patch.skill_code = taxonomy.skillCode || null;
    patch.skill_name = taxonomy.skillName || null;
  }
  return patch;
}

/** Empty / cleared / non-numeric all mean "no value" on these columns. */
function normalizeInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
