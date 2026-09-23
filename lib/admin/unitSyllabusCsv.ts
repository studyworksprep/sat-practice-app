// Unit-syllabus authoring contract (docs/foundations-and-question-
// patterns.md §7): field validation shared by the per-unit editor's
// forms and the CSV importer, plus the CSV parse/plan/export.
//
// Same discipline as questionPatternCsv: the client preview and the
// Server Action run the same parser and planner, so what the preview
// promises is what the server does — and the server re-reads lessons,
// patterns, and units itself rather than trusting the browser.
//
// Import semantics are REPLACE per unit: a file is the source of truth
// for every unit it names (its rows become that unit's whole syllabus,
// in file order unless `position` says otherwise); units the file does
// not mention are untouched. Partial per-unit merges would need row
// identity a spreadsheet doesn't have.
//
// Pure module — no Supabase, no React. Lessons, patterns, and units
// arrive as arguments.

import { SAT_TAXONOMY, findSkill } from '../practice/sat-taxonomy.ts';
import { parseDelimitedText, type PatternCsvIssue as CsvIssue } from './questionPatternCsv.ts';

export type { CsvIssue };

export const SYLLABUS_CSV_COLUMNS = [
  { key: 'skill_code', required: true, help: 'The curriculum unit (SAT skill code, e.g. H.A. or BOU). Every row for a unit replaces that unit\'s syllabus.' },
  { key: 'kind', required: true, help: '"lesson" or "drill".' },
  { key: 'lesson', required: false, help: 'Lesson steps: the lesson\'s exact title (case-insensitive) or its id.' },
  { key: 'role', required: false, help: 'Drill steps: "practice" (the questions for the lesson just taught — default) or "mixed" (homework across the unit).' },
  { key: 'skill_codes', required: false, help: 'Drill steps, optional: skill codes to draw from, separated by ";" — blank means the unit\'s own skill (a mixed set then spans the domain\'s units walked so far).' },
  { key: 'pattern', required: false, help: 'Drill steps, optional: a question-pattern name (from this skill\'s catalog) or id, to drill exactly that format.' },
  { key: 'question_count', required: false, help: 'Optional, 1–50. Blank = 8 for practice, 10 for mixed.' },
  { key: 'minutes', required: false, help: 'Optional, 5–240. Blank = the unit\'s expected minutes.' },
  { key: 'skip_if_completed', required: false, help: 'Lesson steps: "yes" (default) skips the lesson for a student who already completed it (e.g. in an earlier unit); "no" always assigns it.' },
  { key: 'position', required: false, help: 'Optional order within the unit. Blank = file order.' },
] as const;

type FieldKey =
  | 'skillCode'
  | 'kind'
  | 'lesson'
  | 'role'
  | 'skillCodes'
  | 'pattern'
  | 'questionCount'
  | 'minutes'
  | 'skipIfCompleted'
  | 'position';

const COLUMN_ALIASES: Record<string, FieldKey> = {
  skill_code: 'skillCode',
  skill: 'skillCode',
  unit: 'skillCode',
  unit_code: 'skillCode',
  kind: 'kind',
  type: 'kind',
  step: 'kind',
  step_kind: 'kind',
  lesson: 'lesson',
  lesson_title: 'lesson',
  lesson_id: 'lesson',
  title: 'lesson',
  role: 'role',
  drill_role: 'role',
  skill_codes: 'skillCodes',
  skills: 'skillCodes',
  draw_from: 'skillCodes',
  pattern: 'pattern',
  pattern_name: 'pattern',
  pattern_id: 'pattern',
  question_count: 'questionCount',
  questions: 'questionCount',
  count: 'questionCount',
  minutes: 'minutes',
  min: 'minutes',
  skip_if_completed: 'skipIfCompleted',
  skip: 'skipIfCompleted',
  skip_if_done: 'skipIfCompleted',
  position: 'position',
  order: 'position',
  seq: 'position',
  sequence: 'position',
};

export const COUNT_MIN = 1;
export const COUNT_MAX = 50;
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 240;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── Reference data the resolver needs ─────────────────────────────

export interface LessonRef {
  id: string;
  title: string;
  status: string;
}

export interface PatternRef {
  id: string;
  name: string;
  skill_code: string;
}

export interface UnitRef {
  id: string;
  skill_code: string;
  domain_code: string;
}

/** A validated, resolved step ready to insert (position assigned by
 *  the planner). */
export interface NormalizedStep {
  kind: 'lesson' | 'drill';
  lessonId: string | null;
  role: 'practice' | 'mixed' | null;
  skillCodes: string[] | null;
  patternId: string | null;
  questionCount: number | null;
  minutes: number | null;
  skipIfCompleted: boolean;
}

// ── Field validation (form + CSV share it) ────────────────────────

/** Raw step input as the editor form or a CSV row supplies it. Strings
 *  throughout so the same validator serves both. */
export interface StepInput {
  kind: string;
  lessonId?: string | null;
  role?: string | null;
  /** Codes separated by ";" / "|" / "," / whitespace, or an array. */
  skillCodes?: string | string[] | null;
  patternId?: string | null;
  questionCount?: string | number | null;
  minutes?: string | number | null;
  skipIfCompleted?: string | boolean | null;
}

export function parseSkillCodeList(v: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(/[;|,\s]+/);
  const out: string[] = [];
  for (const item of raw) {
    const code = item.trim().toUpperCase();
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}

export function parseYesNo(v: string | boolean | null | undefined, fallback: boolean): boolean | null {
  if (v == null || v === '') return fallback;
  if (typeof v === 'boolean') return v;
  const s = v.trim().toLowerCase();
  if (['yes', 'y', 'true', '1', 'on'].includes(s)) return true;
  if (['no', 'n', 'false', '0', 'off'].includes(s)) return false;
  return null;
}

function intInRange(
  v: string | number | null | undefined,
  min: number,
  max: number,
  label: string,
): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v == null || v === '') return { ok: true, value: null };
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  if (!Number.isInteger(n) || n < min || n > max) {
    return { ok: false, error: `${label} must be a whole number from ${min} to ${max}` };
  }
  return { ok: true, value: n };
}

/** Validate one step's fields. The caller has already resolved lesson /
 *  pattern references to ids (the CSV resolver does that by title or
 *  name; the form posts ids). `unitSkillCode` scopes the pattern check. */
export function normalizeStepInput(
  input: StepInput,
  ctx: { unitSkillCode: string; lessonIds: ReadonlySet<string>; patterns: readonly PatternRef[] },
): { ok: true; value: NormalizedStep } | { ok: false; error: string } {
  const kind = String(input.kind ?? '').trim().toLowerCase();
  if (kind !== 'lesson' && kind !== 'drill') {
    return { ok: false, error: `kind must be "lesson" or "drill"${kind ? ` (got "${kind}")` : ''}` };
  }

  const count = intInRange(input.questionCount, COUNT_MIN, COUNT_MAX, 'question_count');
  if (!count.ok) return count;
  const minutes = intInRange(input.minutes, MINUTES_MIN, MINUTES_MAX, 'minutes');
  if (!minutes.ok) return minutes;

  if (kind === 'lesson') {
    const lessonId = String(input.lessonId ?? '').trim();
    if (!lessonId) return { ok: false, error: 'a lesson step needs a lesson' };
    if (!ctx.lessonIds.has(lessonId)) return { ok: false, error: 'that lesson does not exist' };
    const skip = parseYesNo(input.skipIfCompleted, true);
    if (skip == null) return { ok: false, error: 'skip_if_completed must be yes or no' };
    return {
      ok: true,
      value: {
        kind: 'lesson',
        lessonId,
        role: null,
        skillCodes: null,
        patternId: null,
        questionCount: null,
        minutes: minutes.value,
        skipIfCompleted: skip,
      },
    };
  }

  const roleRaw = String(input.role ?? '').trim().toLowerCase() || 'practice';
  if (roleRaw !== 'practice' && roleRaw !== 'mixed') {
    return { ok: false, error: `role must be "practice" or "mixed" (got "${roleRaw}")` };
  }
  const codes = parseSkillCodeList(input.skillCodes);
  for (const code of codes) {
    if (!skillExists(code)) return { ok: false, error: `unknown skill code "${code}" in skill_codes` };
  }
  const patternId = String(input.patternId ?? '').trim();
  if (patternId) {
    const pattern = ctx.patterns.find((p) => p.id === patternId);
    if (!pattern) return { ok: false, error: 'that pattern does not exist' };
    if (pattern.skill_code !== ctx.unitSkillCode) {
      return { ok: false, error: `pattern "${pattern.name}" belongs to ${pattern.skill_code}, not this unit` };
    }
  }
  return {
    ok: true,
    value: {
      kind: 'drill',
      lessonId: null,
      role: roleRaw,
      skillCodes: codes.length > 0 ? codes : null,
      patternId: patternId || null,
      questionCount: count.value,
      minutes: minutes.value,
      skipIfCompleted: true,
    },
  };
}

function skillExists(code: string): boolean {
  return SAT_TAXONOMY.some((d) => d.skills.some((s) => s.code === code));
}

function domainOf(skillCode: string): string | null {
  for (const d of SAT_TAXONOMY) if (d.skills.some((s) => s.code === skillCode)) return d.code;
  return null;
}

// ── CSV parse ─────────────────────────────────────────────────────

export interface RawSyllabusRow {
  line: number;
  skillCode: string;
  kind: string;
  lesson: string;
  role: string;
  skillCodes: string;
  pattern: string;
  questionCount: string;
  minutes: string;
  skipIfCompleted: string;
  position: string;
}

export interface SyllabusCsvParseResult {
  rows: RawSyllabusRow[];
  issues: CsvIssue[];
  columns: FieldKey[];
}

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_')
    .replace(/[^a-z0-9_]/g, '')
    .replace(/^_+|_+$/g, '');
}

/** Split the file into raw rows keyed by recognized columns. Field
 *  validation happens in resolveSyllabusRows, which needs the live
 *  lessons/patterns/units. */
export function parseSyllabusCsv(text: string): SyllabusCsvParseResult {
  const records = parseDelimitedText(text);
  if (records.length === 0) {
    return { rows: [], issues: [{ line: 0, message: 'File is empty.' }], columns: [] };
  }
  const header = records[0];
  const mapping = new Map<number, FieldKey>();
  const unknown: string[] = [];
  for (let i = 0; i < header.cells.length; i += 1) {
    const normalized = normalizeHeader(header.cells[i]);
    if (!normalized) continue;
    const field = COLUMN_ALIASES[normalized];
    if (field && ![...mapping.values()].includes(field)) mapping.set(i, field);
    else if (!field) unknown.push(header.cells[i].trim());
  }
  const columns = [...new Set(mapping.values())];
  const issues: CsvIssue[] = [];
  const missing = (['skillCode', 'kind'] as FieldKey[]).filter((f) => !columns.includes(f));
  if (missing.length > 0) {
    const found = header.cells.map((c) => c.trim()).filter(Boolean).join(', ') || '(none)';
    const labels = missing.map((m) => (m === 'skillCode' ? 'skill_code' : 'kind'));
    return {
      rows: [],
      issues: [{ line: header.line, message: `Header is missing required column${labels.length === 1 ? '' : 's'}: ${labels.join(', ')}. Found: ${found}.` }],
      columns,
    };
  }
  if (unknown.length > 0) {
    issues.push({ line: header.line, message: `Ignoring unrecognized column${unknown.length === 1 ? '' : 's'}: ${unknown.join(', ')}.` });
  }
  const index = new Map<FieldKey, number>();
  for (const [i, field] of mapping) index.set(field, i);
  const rows: RawSyllabusRow[] = records.slice(1).map((record) => {
    const get = (field: FieldKey): string => {
      const i = index.get(field);
      return i === undefined ? '' : (record.cells[i] ?? '').trim();
    };
    return {
      line: record.line,
      skillCode: get('skillCode').toUpperCase(),
      kind: get('kind'),
      lesson: get('lesson'),
      role: get('role'),
      skillCodes: get('skillCodes'),
      pattern: get('pattern'),
      questionCount: get('questionCount'),
      minutes: get('minutes'),
      skipIfCompleted: get('skipIfCompleted'),
      position: get('position'),
    };
  });
  return { rows, issues, columns };
}

// ── Resolve + plan (replace per unit) ─────────────────────────────

export interface PlannedUnitSyllabus {
  unitId: string;
  skillCode: string;
  /** Steps in final order; position = index + 1. */
  steps: Array<NormalizedStep & { line: number; label: string }>;
  existingCount: number;
}

export interface SyllabusImportPlan {
  units: PlannedUnitSyllabus[];
  issues: CsvIssue[];
  columns: FieldKey[];
}

export interface SyllabusPlanContext {
  units: readonly UnitRef[];
  lessons: readonly LessonRef[];
  patterns: readonly PatternRef[];
  /** Current step counts per unit id, for the preview's "replaces N". */
  existingCounts: ReadonlyMap<string, number>;
}

function findLesson(ref: string, lessons: readonly LessonRef[]): LessonRef | null {
  const needle = ref.trim();
  if (!needle) return null;
  if (UUID_RE.test(needle)) return lessons.find((l) => l.id.toLowerCase() === needle.toLowerCase()) ?? null;
  const lower = needle.toLowerCase();
  const matches = lessons.filter((l) => l.title.trim().toLowerCase() === lower);
  // Prefer a published lesson when titles collide across statuses.
  return matches.find((l) => l.status === 'published') ?? matches[0] ?? null;
}

function findPattern(ref: string, skillCode: string, patterns: readonly PatternRef[]): PatternRef | null {
  const needle = ref.trim();
  if (!needle) return null;
  if (UUID_RE.test(needle)) return patterns.find((p) => p.id.toLowerCase() === needle.toLowerCase()) ?? null;
  const lower = needle.toLowerCase();
  return patterns.find((p) => p.skill_code === skillCode && p.name.trim().toLowerCase() === lower) ?? null;
}

/** Turn parsed rows into per-unit replacement syllabi. Every row is
 *  validated against the live lessons, patterns, and units; a unit with
 *  any rejected row is dropped from the plan entirely (a half-imported
 *  syllabus is worse than none), and the issue says so. */
export function planSyllabusImport(
  parsed: SyllabusCsvParseResult,
  ctx: SyllabusPlanContext,
): SyllabusImportPlan {
  const issues = [...parsed.issues];
  const unitBySkill = new Map(ctx.units.map((u) => [u.skill_code, u]));
  const lessonIds = new Set(ctx.lessons.map((l) => l.id));
  const lessonTitle = new Map(ctx.lessons.map((l) => [l.id, l.title]));
  const patternName = new Map(ctx.patterns.map((p) => [p.id, p.name]));

  type Pending = { line: number; position: number | null; step: NormalizedStep; label: string };
  const perSkill = new Map<string, Pending[]>();
  const failedSkills = new Set<string>();

  for (const row of parsed.rows) {
    const problems: string[] = [];
    if (!row.skillCode) problems.push('skill_code is required');
    else if (!unitBySkill.has(row.skillCode)) {
      problems.push(skillExists(row.skillCode)
        ? `skill "${row.skillCode}" has no curriculum unit`
        : `unknown skill_code "${row.skillCode}"`);
    }

    let lessonId: string | null = null;
    let patternId: string | null = null;
    const kind = row.kind.trim().toLowerCase();
    if (kind === 'lesson') {
      const lesson = findLesson(row.lesson, ctx.lessons);
      if (!row.lesson) problems.push('a lesson step needs a lesson title or id');
      else if (!lesson) problems.push(`no lesson titled "${row.lesson}"`);
      else lessonId = lesson.id;
    } else if (kind === 'drill' && row.pattern) {
      const pattern = findPattern(row.pattern, row.skillCode, ctx.patterns);
      if (!pattern) problems.push(`no pattern "${row.pattern}" in ${row.skillCode || 'this skill'}'s catalog`);
      else patternId = pattern.id;
    }

    let position: number | null = null;
    if (row.position) {
      const n = Number(row.position);
      if (!Number.isInteger(n) || n < 1) problems.push(`position "${row.position}" must be a whole number of 1 or more`);
      else position = n;
    }

    if (problems.length === 0) {
      const normalized = normalizeStepInput(
        {
          kind,
          lessonId,
          role: row.role,
          skillCodes: row.skillCodes,
          patternId,
          questionCount: row.questionCount,
          minutes: row.minutes,
          skipIfCompleted: row.skipIfCompleted,
        },
        { unitSkillCode: row.skillCode, lessonIds, patterns: ctx.patterns },
      );
      if (!normalized.ok) problems.push(normalized.error);
      else {
        const step = normalized.value;
        const label =
          step.kind === 'lesson'
            ? `Lesson: ${lessonTitle.get(step.lessonId!) ?? step.lessonId}`
            : `${step.role === 'mixed' ? 'Mixed set' : 'Practice drill'}${
                step.skillCodes ? ` (${step.skillCodes.join(', ')})` : ''
              }${step.patternId ? ` · ${patternName.get(step.patternId) ?? 'pattern'}` : ''}${
                step.questionCount ? ` · ${step.questionCount} q` : ''
              }`;
        const list = perSkill.get(row.skillCode) ?? [];
        list.push({ line: row.line, position, step, label });
        perSkill.set(row.skillCode, list);
        continue;
      }
    }
    issues.push({ line: row.line, message: problems.join('; ') });
    if (row.skillCode) failedSkills.add(row.skillCode);
  }

  const units: PlannedUnitSyllabus[] = [];
  for (const [skillCode, pending] of perSkill) {
    if (failedSkills.has(skillCode)) {
      issues.push({ line: 0, message: `${skillCode}: not imported — fix the rejected line${pending.length === 1 ? '' : 's'} above and re-import.` });
      continue;
    }
    const unit = unitBySkill.get(skillCode)!;
    // Explicit positions win; blanks keep file order after them.
    const ordered = [...pending].sort((x, y) => {
      if (x.position != null && y.position != null) return x.position - y.position || x.line - y.line;
      if (x.position != null) return -1;
      if (y.position != null) return 1;
      return x.line - y.line;
    });
    units.push({
      unitId: unit.id,
      skillCode,
      steps: ordered.map((p) => ({ ...p.step, line: p.line, label: p.label })),
      existingCount: ctx.existingCounts.get(unit.id) ?? 0,
    });
  }
  units.sort((x, y) => x.skillCode.localeCompare(y.skillCode));
  return { units, issues, columns: parsed.columns };
}

// ── Export / template ─────────────────────────────────────────────

export interface ExportableStep {
  skill_code: string;
  position: number;
  kind: string;
  lesson_title: string | null;
  role: string | null;
  skill_codes: string[] | null;
  pattern_name: string | null;
  question_count: number | null;
  minutes: number | null;
  skip_if_completed: boolean;
}

export const SYLLABUS_EXPORT_COLUMNS = [
  'skill_code', 'position', 'kind', 'lesson', 'role', 'skill_codes', 'pattern',
  'question_count', 'minutes', 'skip_if_completed',
] as const;

export function syllabusExportRows(steps: readonly ExportableStep[]): Array<Record<string, string | number>> {
  return steps.map((s) => ({
    skill_code: s.skill_code,
    position: s.position,
    kind: s.kind,
    lesson: s.lesson_title ?? '',
    role: s.role ?? '',
    skill_codes: s.skill_codes?.join('; ') ?? '',
    pattern: s.pattern_name ?? '',
    question_count: s.question_count ?? '',
    minutes: s.minutes ?? '',
    skip_if_completed: s.kind === 'lesson' ? (s.skip_if_completed ? 'yes' : 'no') : '',
  }));
}

export function syllabusCsvTemplate(): string {
  return [
    'skill_code,kind,lesson,role,skill_codes,pattern,question_count,minutes,skip_if_completed',
    '"H.A.","lesson","Solve Equations by Graphing: Find the x-Intercepts",,,,,,"yes"',
    '"H.A.","drill",,"practice",,,6,,',
    '"H.A.","lesson","Solve Multiple Equations With List Regression",,,,,,"yes"',
    '"H.A.","drill",,"practice",,,6,,',
    '"H.A.","drill",,"mixed",,,10,,',
    '"H.D.","lesson","Solve Systems of Equations by Graphing in Desmos",,,,,,"yes"',
    '"H.D.","drill",,"practice","H.D.",,6,,',
    '"H.D.","lesson","Special Systems: No Solution and Infinitely Many Solutions",,,,,,"yes"',
    '"H.D.","drill",,"practice",,"No-solution systems",6,,',
    '"H.D.","drill",,"mixed","H.A.; H.C.; H.D.",,10,,',
  ].join('\n');
}

/** Domain a unit's skill belongs to — for the editor's mixed-set default. */
export function domainForSkill(skillCode: string): string | null {
  return domainOf(skillCode);
}

/** Skill name lookup for labels. */
export function skillNameOf(skillCode: string): string {
  for (const d of SAT_TAXONOMY) {
    const s = findSkill(d.code, skillCode);
    if (s) return s.name;
  }
  return skillCode;
}
