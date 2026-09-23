// Unit-syllabus authoring contract (docs/foundations-and-question-
// patterns.md §7): field validation for a syllabus step, shared by the
// curriculum editor's forms and its Server Actions so a step the
// server would reject never looks valid in the form.
//
// Pure module — no Supabase, no React. Lessons and patterns arrive as
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

export interface PatternRef {
  id: string;
  name: string;
  skill_code: string;
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
