// Unit-syllabus authoring contract (docs/foundations-and-question-
// patterns.md §7): field validation for a syllabus step, shared by the
// curriculum editor's forms and its Server Actions so a step the
// server would reject never looks valid in the form.
//
// Pure module — no Supabase, no React. Lessons and techniques arrive as
// arguments.

import { SAT_TAXONOMY, findSkill } from '../practice/sat-taxonomy.ts';

export const COUNT_MIN = 1;
export const COUNT_MAX = 50;
export const MINUTES_MIN = 5;
export const MINUTES_MAX = 240;

// ── Reference data the resolver needs ─────────────────────────────

export interface LessonRef {
  id: string;
  title: string;
  status: string;
}

export interface TechniqueRef {
  id: string;
  name: string;
}

/** A validated, resolved step ready to insert (position assigned by
 *  the planner). */
export type TechniqueSource = 'lesson' | 'none' | 'explicit';

export interface NormalizedStep {
  kind: 'lesson' | 'drill';
  lessonId: string | null;
  role: 'practice' | 'mixed' | null;
  skillCodes: string[] | null;
  /** Drill steps: explicit technique narrowing (techniqueSource =
   *  'explicit'), else null. */
  techniqueIds: string[] | null;
  /** Practice drills: 'lesson' (the preceding lesson's techniques —
   *  the default), 'none', or 'explicit'. Mixed sets are always 'none';
   *  lesson steps carry the default and ignore it. */
  techniqueSource: TechniqueSource;
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
  /** Technique ids separated like skillCodes, or an array. */
  techniqueIds?: string | string[] | null;
  /** 'lesson' | 'none' | 'explicit'; blank = lesson for practice, none for mixed. */
  techniqueSource?: string | null;
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

function parseIdList(v: string | string[] | null | undefined): string[] {
  const raw = Array.isArray(v) ? v : String(v ?? '').split(/[;|,\s]+/);
  const out: string[] = [];
  for (const item of raw) {
    const id = String(item ?? '').trim();
    if (id && !out.includes(id)) out.push(id);
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
 *  technique references to ids (the form posts ids). Techniques cut
 *  across skills, so a drill may name any technique in the catalog.
 *  `unitSkillCode` is absent for a section foundation syllabus. */
export function normalizeStepInput(
  input: StepInput,
  ctx: { unitSkillCode?: string; lessonIds: ReadonlySet<string>; techniques: readonly TechniqueRef[] },
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
        techniqueIds: null,
        techniqueSource: 'lesson',
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
  const techniqueIds = parseIdList(input.techniqueIds);
  for (const id of techniqueIds) {
    if (!ctx.techniques.some((t) => t.id === id)) {
      return { ok: false, error: 'that technique does not exist' };
    }
  }
  // Mixed sets never narrow. A practice set narrows to the preceding
  // lesson's techniques unless told otherwise; explicit needs a list.
  const sourceRaw = String(input.techniqueSource ?? '').trim().toLowerCase();
  let techniqueSource: TechniqueSource;
  if (roleRaw === 'mixed') {
    techniqueSource = 'none';
  } else if (!sourceRaw) {
    techniqueSource = techniqueIds.length > 0 ? 'explicit' : 'lesson';
  } else if (sourceRaw === 'lesson' || sourceRaw === 'none' || sourceRaw === 'explicit') {
    techniqueSource = sourceRaw;
  } else {
    return { ok: false, error: `technique_source must be "lesson", "none" or "explicit" (got "${sourceRaw}")` };
  }
  if (techniqueSource === 'explicit' && techniqueIds.length === 0) {
    return { ok: false, error: 'pick at least one technique, or use the lesson\'s techniques' };
  }
  return {
    ok: true,
    value: {
      kind: 'drill',
      lessonId: null,
      role: roleRaw,
      skillCodes: codes.length > 0 ? codes : null,
      techniqueIds: techniqueSource === 'explicit' ? techniqueIds : null,
      techniqueSource,
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

/** Domain a unit's skill belongs to — for the editor's mixed-set copy. */
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
