// Display labels AND why-this copy for plan tasks — full domain/skill
// names, never codes; plain language, never raw mastery arithmetic.
//
// Students can't be expected to know the taxonomy codes ("CAS/TSP"),
// so every plan surface labels tasks with the full skill name. One
// home (repo rule): the generator's payload builders, the student
// Today page, and the tutor plan page all resolve labels here.
//
// Two mechanisms:
//   - New payloads are written with full names (buildDrillPayload /
//     buildLessonPayload call skillDisplayName).
//   - Already-stored tasks may carry a legacy code title
//     ("Drill: CAS/TSP"). At render time, a stored title that exactly
//     matches the legacy pattern rebuilt from the payload's own codes
//     is replaced with the full name; hand-typed tutor titles never
//     match the pattern and are kept verbatim.
//
// The same split applies to a task's "why" line: the generator stores a
// REASON CODE (payload.why_code) and this module owns the sentence, so
// the copy can be rewritten without a backfill of every stored
// plan_tasks row. Rows written before the code existed are upgraded at
// render time by the same legacy-pattern trick.
//
// ACT (and any code missing from the SAT taxonomy) falls back to the
// raw codes — no worse than before, and ACT has no curriculum units
// yet so ACT plans cannot carry skill tasks today.
//
// Imports are relative with explicit .ts extensions because the unit
// tests load this chain under plain `node --test` (no tsconfig-paths
// resolution) — same convention as today.ts → generate-plan.ts.

import { findSkill } from '../practice/sat-taxonomy.ts';

/** Full skill name from the SAT taxonomy; falls back to the raw codes. */
export function skillDisplayName(
  domainCode: string | null | undefined,
  skillCode: string | null | undefined,
): string {
  const skill = findSkill(domainCode, skillCode);
  if (skill) return skill.name;
  return [domainCode, skillCode].filter(Boolean).join('/') || 'Skill';
}

/** Student-facing fallback titles by task type (shared with Today). */
export const TASK_TYPE_TITLES: Record<string, string> = {
  lesson: 'Lesson',
  drill: 'Skill drill',
  review: 'Spaced review',
  practice_set: 'Practice set',
  full_test: 'Full-length practice test',
  vocab: 'Vocabulary practice',
  flashcards: 'Flashcard review',
};

function str(payload: unknown, key: string): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'string' && v.trim() ? v : null;
}

function num(payload: unknown, key: string): number | null {
  if (!payload || typeof payload !== 'object') return null;
  const v = (payload as Record<string, unknown>)[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

// ── Why-this copy ─────────────────────────────────────────────────
//
// Why a drill is on the plan, as a code the generator stores and a
// sentence this module renders. The codes name the CAUSE, because the
// mastery score alone can't: it's damped by a volume factor
// (lib/mastery.ts — 1 − e^(−0.15·n)), so a skill sitting far below the
// bar usually means "barely practiced", not "badly done". Naming the
// shortfall in points said the second thing while meaning the first.

export type DrillWhyCode =
  | 'not_started'
  | 'decayed'
  | 'low_evidence'
  | 'near_threshold'
  | 'mixed'
  | 'shaky';

const DRILL_WHY_COPY: Record<DrillWhyCode, (attempts: number) => string> = {
  not_started: () => 'Not started yet — build a base',
  decayed: () => 'Slipping — refresh before it fades',
  low_evidence: (n) =>
    n > 0
      ? `Only ${n} question${n === 1 ? '' : 's'} so far — this drill fills in the picture`
      : 'No questions here yet — this drill shows where you stand',
  near_threshold: () => 'Nearly there — a few clean reps will lock it in',
  mixed: () => 'Mixed results so far — worth another pass',
  shaky: () => 'Often missed — worth slowing down on these',
};

export function isDrillWhyCode(v: unknown): v is DrillWhyCode {
  return typeof v === 'string' && Object.hasOwn(DRILL_WHY_COPY, v);
}

/** The student-facing sentence for a drill reason code. */
export function renderDrillWhy(code: DrillWhyCode, attempts: number): string {
  return DRILL_WHY_COPY[code](Math.max(0, Math.round(attempts)));
}

/** Pre-2026-08 generators baked "~N points of headroom to mastery" into
 *  payload.why — a term never defined in the UI, on a 0-100 scale
 *  students would read as their accuracy (it isn't). Only the headroom
 *  number survives in the stored row, so the replacement is banded by
 *  magnitude: that's the most the row can honestly support after the
 *  fact. Re-paced and regenerated plans get the real cause-based copy. */
const LEGACY_HEADROOM = /^~(\d+) points of headroom to mastery$/;

function legacyHeadroomWhy(stored: string): string | null {
  const m = LEGACY_HEADROOM.exec(stored.trim());
  if (!m) return null;
  const headroom = Number(m[1]);
  if (headroom <= 10) return 'Close to solid — one more pass should do it';
  if (headroom <= 30) return 'Still building — worth another pass';
  return 'Early days on this skill — more practice will show where you stand';
}

/** Why-this line for a plan task, or null when it carries none.
 *
 *  Precedence: the stored reason code (copy owned here) → a stored
 *  sentence, with the legacy headroom phrasing upgraded → nothing.
 *  Tutor-authored and hand-added tasks never carry a code, so their
 *  wording always passes through verbatim. */
export function planTaskWhy(payload: unknown): string | null {
  const code = str(payload, 'why_code');
  if (isDrillWhyCode(code)) {
    return renderDrillWhy(code, num(payload, 'why_attempts') ?? 0);
  }
  const stored = str(payload, 'why');
  if (!stored) return null;
  return legacyHeadroomWhy(stored) ?? stored;
}

/** The exact title the pre-2026-08 generator stored for this task, or
 *  null when the payload carries no skill identity. */
function legacyCodeTitle(
  taskType: string,
  domainCode: string | null,
  skillCode: string | null,
): string | null {
  if (!domainCode || !skillCode) return null;
  const prefix = taskType === 'lesson' ? 'Lesson' : 'Drill';
  return `${prefix}: ${domainCode}/${skillCode}`;
}

/** Display title for a plan task: stored title, with legacy code
 *  titles upgraded to full skill names; typed fallback otherwise. */
export function planTaskTitle(taskType: string, payload: unknown): string {
  const domainCode = str(payload, 'domain_code');
  const skillCode = str(payload, 'skill_code');
  const stored = str(payload, 'title');
  if (stored) {
    if (stored === legacyCodeTitle(taskType, domainCode, skillCode)) {
      const prefix = taskType === 'lesson' ? 'Lesson' : 'Drill';
      return `${prefix}: ${skillDisplayName(domainCode, skillCode)}`;
    }
    return stored;
  }
  return TASK_TYPE_TITLES[taskType] ?? 'Study task';
}
