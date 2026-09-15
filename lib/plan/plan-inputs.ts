// get_plan_inputs row → the generator's SkillState. One home for the
// mapping ("one computation, one home"): plan-actions.ts (generate /
// re-pace) and plan-edit-actions.ts (week regeneration) both consume
// it. Lives outside those modules because 'use server' files may only
// export async functions.

import type { PlanMode, SkillState } from './generate-plan';
import { selfRatingToPrior } from './intake';
import type { Database } from '@/lib/types/database';

export type PlanInputRow = Database['public']['Functions']['get_plan_inputs']['Returns'][number];

export function mapSkillRow(r: PlanInputRow): SkillState {
  return {
    domainCode: r.domain_code,
    skillCode: r.skill_code,
    section: r.section === 'math' ? 'math' : 'reading_writing',
    mastery: r.mastery,
    attemptsCount: r.attempts_count ?? 0,
    coverageStatus: r.coverage_status ?? 'not_started',
    masteryThreshold: r.mastery_threshold ?? 80,
    learnability: r.learnability,
    expectedMinutes: r.expected_minutes ?? 60,
    sequence: r.sequence ?? 0,
    questionsAvailable: r.questions_available ?? 0,
    hasLesson: r.has_lesson ?? false,
  };
}

// ── Plan composition (docs/student-onboarding-and-plan-redesign-2026-09.md §5) ──

/** What the generator needs beyond skills to compose a plan: the mode
 *  and the intake-derived knobs. Stored on study_plans (mode column +
 *  config jsonb) so a re-pace or week regeneration composes the same
 *  kind of plan the student activated. */
export interface PlanComposition {
  mode: PlanMode | null;
  studyDays: number[] | null;
  targets: string[] | null;
  fullTests: boolean;
  /** 1–5 per SAT domain code, from the intake self-assessment. */
  selfRating: Record<string, number> | null;
}

const PLAN_MODES: readonly string[] = ['foundations', 'targeted', 'self_directed'];

function obj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Read a study_plans row's composition back out of its columns. */
export function planCompositionFromRow(row: {
  mode?: string | null;
  config: unknown;
}): PlanComposition {
  const config = obj(row.config);
  const evidence = obj(config?.evidence);
  const rating = obj(evidence?.self_rating);
  const selfRating: Record<string, number> | null = rating
    ? Object.fromEntries(
        Object.entries(rating).filter((e): e is [string, number] => typeof e[1] === 'number'),
      )
    : null;
  const days = Array.isArray(config?.study_days)
    ? (config!.study_days as unknown[]).filter((d): d is number => Number.isInteger(d))
    : null;
  const targets = Array.isArray(config?.targets)
    ? (config!.targets as unknown[]).filter((t): t is string => typeof t === 'string')
    : null;
  return {
    mode: typeof row.mode === 'string' && PLAN_MODES.includes(row.mode) ? (row.mode as PlanMode) : null,
    studyDays: days && days.length > 0 ? days : null,
    targets: targets && targets.length > 0 ? targets : null,
    fullTests: config?.full_tests === false ? false : true,
    selfRating: selfRating && Object.keys(selfRating).length > 0 ? selfRating : null,
  };
}

/** Stamp evidence priors onto skill states from the intake self-rating
 *  (§5.4). Phase 3 adds reported-test priors ahead of these. */
export function applyEvidencePriors(
  skills: SkillState[],
  composition: Pick<PlanComposition, 'selfRating'>,
): SkillState[] {
  const rating = composition.selfRating;
  if (!rating) return skills;
  return skills.map((s) => {
    const r = rating[s.domainCode];
    if (typeof r !== 'number') return s;
    return { ...s, evidencePrior: selfRatingToPrior(r), evidencePriorSource: 'self_rating' as const };
  });
}
