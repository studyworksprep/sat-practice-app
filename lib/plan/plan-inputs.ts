// get_plan_inputs row → the generator's SkillState. One home for the
// mapping ("one computation, one home"): plan-actions.ts (generate /
// re-pace) and plan-edit-actions.ts (week regeneration) both consume
// it. Lives outside those modules because 'use server' files may only
// export async functions.

import type { SkillState } from './generate-plan';
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
