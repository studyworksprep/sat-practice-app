// Display labels for plan tasks — full domain/skill names, never codes.
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
