import { ACT_SECTIONS, type ActSection } from './act-taxonomy.ts';
import { ACT_FORMAT_SPECS, isActFormat, isActFormKind, type ActFormat, type ActFormKind } from './act-test-plan.ts';

export type SectionCounts = Partial<Record<ActSection, number>>;
export interface FormatDetection {
  format: ActFormat | null;
  kind: ActFormKind;
  reviewReason: string | null;
}

// Infer from the whole form, never from a date, total, or a single section.
// Enhanced practice forms may retain field-test items in some sections only.
export function detectActFormat(counts: SectionCounts, saved: { format?: unknown; kind?: unknown } = {}): FormatDetection {
  const complete = (format: ActFormat) => ACT_SECTIONS.every(section => {
    const n = counts[section] ?? 0;
    const spec = ACT_FORMAT_SPECS[format].sections[section];
    if (format === 'enhanced' && section === 'science' && n === 0) return true;
    return n === spec.questions || n === spec.released;
  });
  const format = complete('classic') ? 'classic' : complete('enhanced') ? 'enhanced' : null;
  const kind = isActFormKind(saved.kind) ? saved.kind :
    format === 'enhanced' && ACT_SECTIONS.some(s => (counts[s] ?? 0) > ACT_FORMAT_SPECS.enhanced.sections[s].released)
      ? 'practice' : 'released';
  if (!format) {
    // Exact counts pointing to different formats are conflicting; counts
    // below a plausible complete form are incomplete, not a new format.
    const candidates = (['classic', 'enhanced'] as const).filter(f => ACT_SECTIONS.every(s => {
      const n = counts[s] ?? 0;
      const spec = ACT_FORMAT_SPECS[f].sections[s];
      if (!Number.isSafeInteger(n) || n < 0 || n > spec.questions) return false;
      const other = ACT_FORMAT_SPECS[f === 'classic' ? 'enhanced' : 'classic'].sections[s];
      const matchesOther = n > 0 && (n === other.questions || n === other.released);
      return !matchesOther || n === spec.questions || n === spec.released;
    }));
    return { format: null, kind, reviewReason: candidates.length
      ? 'Incomplete section counts. Finish importing and approving the form before starting a timed test.'
      : 'Conflicting section counts. Check for mixed formats, missing questions, or duplicate questions.' };
  }
  return { format, kind, reviewReason: isActFormat(saved.format) && saved.format !== format
    ? 'Saved format conflicts with the section counts. Review and update the format setting.' : null };
}

export function assessActQuestions(rows: Array<{ section: string; source_ordinal?: number | null }>, saved: { format?: unknown; kind?: unknown } = {}): FormatDetection {
  const counts: SectionCounts = {};
  const ordinals = new Map<string, Set<number>>();
  let invalid = false;
  for (const row of rows) {
    if (!ACT_SECTIONS.includes(row.section as ActSection)) { invalid = true; continue; }
    const section = row.section as ActSection;
    counts[section] = (counts[section] ?? 0) + 1;
    const seen = ordinals.get(section) ?? new Set<number>();
    const n = row.source_ordinal;
    if (n == null || !Number.isSafeInteger(n) || n < 1 || seen.has(n)) invalid = true;
    else seen.add(n);
    ordinals.set(section, seen);
  }
  const result = detectActFormat(counts, saved);
  if (result.format) {
    for (const [section, seen] of ordinals) {
      const max = ACT_FORMAT_SPECS[result.format].sections[section as ActSection].questions;
      if ([...seen].some(n => n > max)) invalid = true;
    }
  }
  // Gaps are allowed: practice forms can omit embedded unscored items while
  // retaining their original numbering. Duplicates and missing identities are not.
  return invalid ? { ...result, reviewReason: 'Question numbers are missing, invalid, or duplicated. Review the import before starting a timed test.' } : result;
}
