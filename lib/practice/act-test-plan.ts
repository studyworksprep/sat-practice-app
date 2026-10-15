// ACT test-mode plan: form formats, section timings, breaks and the
// composite rule, plus the per-attempt section plan that
// act_practice_test_attempts.sections stores. Pure module — no DB,
// no React — so both the hub (client) and the Server Actions share
// one source of truth and the arithmetic is unit-tested.
//
// Two formats exist in the bank:
//   classic   the pre-2025 ACT: English 75q/45m, Math 60q/60m,
//             Reading 40q/35m, Science 40q/35m; a 10-minute break
//             after Math; composite = rounded mean of all four.
//   enhanced  the 2025+ ACT: English 50q/35m, Math 45q/50m,
//             Reading 36q/40m, Science 40q/40m (Science is optional
//             and reported separately); a break after Math (official
//             schedules list 10–15 minutes; 15 here); composite =
//             rounded mean of English, Math and Reading.
//
// Released forms omit the unscored field-test items, so a complete
// released enhanced form has English 40, Math 41, Reading 27 and
// Science 34 questions, not 50/45/36/40 (the classic ACT carried its
// field-test items in a separate fifth section, so classic released
// forms have the full 75/60/40/40). Timing keeps the official pace:
// a section gets minutes × (its question count / the administered
// count), so 40 released English questions get 28 minutes — the same
// 42 seconds per question as 50 in 35. Question-bank practice sets
// with other counts pro-rate the same way; the multiplier is the
// extended-time accommodation (1, 1.5, 2) applied on top.

import { ACT_SECTIONS, type ActSection } from './act-taxonomy.ts';

export type ActFormat = 'classic' | 'enhanced';

export const ACT_FORMATS: readonly ActFormat[] = ['classic', 'enhanced'] as const;

export const ACT_FORMAT_LABELS: Record<ActFormat, string> = {
  classic: 'Classic ACT',
  enhanced: 'Enhanced ACT',
};

export function isActFormat(v: unknown): v is ActFormat {
  return v === 'classic' || v === 'enhanced';
}

/** How a form relates to the administered test (act_forms.kind).
 *  A released exam (Test Information Release) omits the enhanced
 *  ACT's unscored field-test items, so a complete one has 40/41/27/34
 *  questions; an online practice test in the new format may include
 *  them (up to 50/45/36/40). Classic forms carry every question either
 *  way. Timing is pace-based regardless; the kind drives completeness
 *  checks and the label students see. */
export type ActFormKind = 'released' | 'practice';

export const ACT_FORM_KINDS: readonly ActFormKind[] = ['released', 'practice'] as const;

export const ACT_FORM_KIND_LABELS: Record<ActFormKind, string> = {
  released: 'Released exam',
  practice: 'Online practice test',
};

export function isActFormKind(v: unknown): v is ActFormKind {
  return v === 'released' || v === 'practice';
}

export interface SectionSpec {
  /** Questions administered on test day, unscored field-test items
   *  included. The pacing denominator. */
  questions: number;
  /** Questions in a released form of the section: the administered
   *  count minus the unscored items. A form with at least this many
   *  live questions is complete. */
  released: number;
  /** Official minutes for the section. */
  minutes: number;
}

export interface FormatSpec {
  sections: Record<ActSection, SectionSpec>;
  /** The break follows this section when a later section exists. */
  breakAfter: ActSection;
  breakMinutes: number;
  /** Sections averaged into the composite; all must be scored. */
  compositeSections: readonly ActSection[];
}

export const ACT_FORMAT_SPECS: Record<ActFormat, FormatSpec> = {
  classic: {
    sections: {
      english: { questions: 75, released: 75, minutes: 45 },
      math:    { questions: 60, released: 60, minutes: 60 },
      reading: { questions: 40, released: 40, minutes: 35 },
      science: { questions: 40, released: 40, minutes: 35 },
    },
    breakAfter: 'math',
    breakMinutes: 10,
    compositeSections: ['english', 'math', 'reading', 'science'],
  },
  enhanced: {
    sections: {
      english: { questions: 50, released: 40, minutes: 35 },
      math:    { questions: 45, released: 41, minutes: 50 },
      reading: { questions: 36, released: 27, minutes: 40 },
      science: { questions: 40, released: 34, minutes: 40 },
    },
    breakAfter: 'math',
    breakMinutes: 15,
    compositeSections: ['english', 'math', 'reading'],
  },
};

export const ACT_TIME_MULTIPLIERS = [1, 1.5, 2] as const;
export type ActTimeMultiplier = (typeof ACT_TIME_MULTIPLIERS)[number];

export function parseTimeMultiplier(v: unknown): ActTimeMultiplier {
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v ?? ''));
  return n === 1.5 || n === 2 ? n : 1;
}

const MINUTE_MS = 60_000;

/** Time limit for one section in ms. Pro-rated against the
 *  administered count so a released form keeps the official pace,
 *  scaled by the multiplier, rounded to a half minute so the clock
 *  reads clean, never under one minute. */
export function sectionTimeLimitMs(
  format: ActFormat,
  section: ActSection,
  questionCount: number,
  multiplier: ActTimeMultiplier = 1,
): number {
  const spec = ACT_FORMAT_SPECS[format].sections[section];
  const ratio = spec.questions > 0 && questionCount > 0
    ? Math.min(1, questionCount / spec.questions)
    : 1;
  const base = spec.minutes * MINUTE_MS * ratio * multiplier;
  return Math.max(MINUTE_MS, Math.round(base / (MINUTE_MS / 2)) * (MINUTE_MS / 2));
}

export type SectionCompleteness = 'partial' | 'complete' | 'scored_only' | 'full_length';

/** Completeness of a section's import against what its kind of form
 *  can contain. Any form is partial below the released count. A
 *  released exam is complete at that count; an online practice test
 *  is complete there too (the unscored items are optional) and
 *  reports whether it carries them — 'full_length' at the administered
 *  count, 'scored_only' in between. Classic forms have no unscored
 *  items, so they are simply complete or partial. */
export function sectionCompleteness(
  format: ActFormat,
  kind: ActFormKind,
  section: ActSection,
  questionCount: number,
): SectionCompleteness {
  const spec = ACT_FORMAT_SPECS[format].sections[section];
  if (questionCount < spec.released) return 'partial';
  if (kind === 'released' || spec.released === spec.questions) return 'complete';
  return questionCount >= spec.questions ? 'full_length' : 'scored_only';
}

/** True when nothing is missing from the section's import. */
export function isSectionComplete(
  format: ActFormat,
  section: ActSection,
  questionCount: number,
  kind: ActFormKind = 'released',
): boolean {
  return sectionCompleteness(format, kind, section, questionCount) !== 'partial';
}

export type PlanSectionStatus = 'pending' | 'in_progress' | 'completed';

export interface PlanSection {
  index: number;
  section: ActSection;
  question_ids: string[];
  question_count: number;
  time_limit_ms: number;
  /** Break that follows this section (0 when none). */
  break_after_ms: number;
  status: PlanSectionStatus;
  session_id: string | null;
  started_at: string | null;
  deadline_at: string | null;
  finished_at: string | null;
  raw_correct: number | null;
  raw_total: number | null;
}

/** Build the ordered plan for a form from its visible questions per
 *  section (ids already in source_ordinal order). Sections absent
 *  from the form are skipped; the break only follows Math when a
 *  later section exists. */
export function buildSectionPlan(input: {
  format: ActFormat;
  multiplier: ActTimeMultiplier;
  questionsBySection: Partial<Record<ActSection, string[]>>;
}): PlanSection[] {
  const spec = ACT_FORMAT_SPECS[input.format];
  const present = ACT_SECTIONS.filter((s) => (input.questionsBySection[s] ?? []).length > 0);
  return present.map((section, index) => {
    const ids = input.questionsBySection[section] ?? [];
    const hasNext = index < present.length - 1;
    return {
      index,
      section,
      question_ids: [...ids],
      question_count: ids.length,
      time_limit_ms: sectionTimeLimitMs(input.format, section, ids.length, input.multiplier),
      break_after_ms: hasNext && section === spec.breakAfter ? spec.breakMinutes * MINUTE_MS : 0,
      status: 'pending',
      session_id: null,
      started_at: null,
      deadline_at: null,
      finished_at: null,
      raw_correct: null,
      raw_total: null,
    };
  });
}

const SECTION_SET = new Set<string>(ACT_SECTIONS);

/** Tolerant reader for act_practice_test_attempts.sections. Returns
 *  [] for anything that isn't a well-formed plan (legacy attempts
 *  store []), so callers can branch on length. */
export function parsePlan(raw: unknown): PlanSection[] {
  if (!Array.isArray(raw)) return [];
  const out: PlanSection[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    if (typeof r.section !== 'string' || !SECTION_SET.has(r.section)) return [];
    if (!Array.isArray(r.question_ids)) return [];
    const status = r.status === 'in_progress' || r.status === 'completed' ? r.status : 'pending';
    const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
    out.push({
      index: num(r.index) ?? out.length,
      section: r.section as ActSection,
      question_ids: r.question_ids.filter((q): q is string => typeof q === 'string'),
      question_count: num(r.question_count) ?? r.question_ids.length,
      time_limit_ms: num(r.time_limit_ms) ?? 0,
      break_after_ms: num(r.break_after_ms) ?? 0,
      status,
      session_id: str(r.session_id),
      started_at: str(r.started_at),
      deadline_at: str(r.deadline_at),
      finished_at: str(r.finished_at),
      raw_correct: num(r.raw_correct),
      raw_total: num(r.raw_total),
    });
  }
  return out;
}

/** Composite per the format's rule; null until every contributing
 *  section has a scaled score. ACT rounds halves up, which is what
 *  Math.round does for positive values. */
export function compositeScore(
  format: ActFormat,
  scaled: Partial<Record<ActSection, number | null | undefined>>,
): number | null {
  const parts = ACT_FORMAT_SPECS[format].compositeSections.map((s) => scaled[s]);
  if (parts.some((v) => typeof v !== 'number')) return null;
  const nums = parts as number[];
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

/** Sentence for the results page explaining the composite rule. */
export function compositeDescription(format: ActFormat): string {
  return format === 'enhanced'
    ? 'Out of 36 · rounded average of English, Math and Reading (Science is reported separately on the enhanced ACT)'
    : 'Out of 36 · rounded average of the four section scores';
}

/** Which sections the composite needs, as labels for a "missing" note. */
export function compositeSectionsFor(format: ActFormat): readonly ActSection[] {
  return ACT_FORMAT_SPECS[format].compositeSections;
}

/** Milliseconds of break left after a completed section (0 when the
 *  section had no break, isn't finished, or the break has elapsed). */
export function breakRemainingMs(section: PlanSection, nowMs: number = Date.now()): number {
  if (section.break_after_ms <= 0 || !section.finished_at) return 0;
  const end = Date.parse(section.finished_at) + section.break_after_ms;
  if (!Number.isFinite(end)) return 0;
  return Math.max(0, end - nowMs);
}

/** "35 min", "1 h 15 min". */
export function minutesLabel(ms: number): string {
  const totalMin = Math.round(ms / MINUTE_MS);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** True once an in-progress section's deadline has passed. */
export function sectionOverdue(section: PlanSection, nowMs: number = Date.now()): boolean {
  return section.status === 'in_progress'
    && section.deadline_at != null
    && Date.parse(section.deadline_at) <= nowMs;
}
