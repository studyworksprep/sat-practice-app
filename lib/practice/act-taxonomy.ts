// ACT taxonomy module. Same conceptual role as
// `lib/ui/question-layout.ts` plays for SAT (which exposes
// domainSection / inferLayoutMode for SAT's domain_code), but
// keyed off the ACT shape: section / category / subcategory.
//
// ACT taxonomy lives inline on `act_questions` rows:
//   - section      'english' | 'math' | 'reading' | 'science'
//   - category     free-text within the section
//   - subcategory  free-text within the category (nullable)
//
// The four canonical ACT sections are encoded here once. Data on
// prod today only seeds english + math (Reading/Science haven't
// landed yet); the helpers still recognize all four so a render
// surface that just got data for a new section starts working
// without a code change. See docs/architecture-plan.md §3.4
// "Cross-test data model" — ACT keeps its content-shape difference
// from SAT (sections/categories vs domain/skill); shared UI calls
// these helpers on the way out.

export type ActSection = 'english' | 'math' | 'reading' | 'science';

/** Canonical render order on shared surfaces (dashboard, practice
 *  launcher tabs, etc.). Matches the order the test is administered:
 *  English → Math → Reading → Science. */
export const ACT_SECTIONS: readonly ActSection[] = [
  'english',
  'math',
  'reading',
  'science',
] as const;

const SECTION_SET = new Set<string>(ACT_SECTIONS);

const SECTION_LABELS: Record<ActSection, string> = {
  english: 'English',
  math:    'Math',
  reading: 'Reading',
  science: 'Science',
};

/** Returns true for any of the four valid ACT section codes. Use
 *  to gate cross-test render code that's about to assume a section
 *  string is one of the canonical four. */
export function isActSection(value: unknown): value is ActSection {
  return typeof value === 'string' && SECTION_SET.has(value);
}

/** Display name for a section ("English", "Math", etc.). Falls
 *  back to the raw input title-cased so an unrecognized section
 *  still renders, rather than vanishing. */
export function sectionLabel(section: string | null | undefined): string {
  if (!section) return '';
  if (isActSection(section)) return SECTION_LABELS[section];
  return section.charAt(0).toUpperCase() + section.slice(1);
}

/** Layout-mode hint analogous to inferLayoutMode for SAT — the
 *  practice runner uses it to pick a single-column or two-column
 *  question layout. ACT Reading carries passages (two-column),
 *  English shares its passage with multiple questions
 *  (two-column), Math + Science are single-column today. */
export function inferActLayoutMode(section: string | null | undefined): 'single' | 'two-column' {
  if (section === 'reading' || section === 'english') return 'two-column';
  return 'single';
}

/** Whether a section should be rendered with the math-toolkit
 *  affordances (Desmos calculator state, etc.). Only Math today —
 *  the briefing notes ACT calculators are math-only.
 *  See docs/architecture-plan.md §3.4. */
export function isCalculatorEligible(section: string | null | undefined): boolean {
  return section === 'math';
}
