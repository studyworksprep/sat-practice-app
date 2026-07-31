// Prep card (§4.1): the master tutor's pre-session glance, computed.
// "Since last session: X practice sessions, mastery moved on these
// skills, struggled with Y, plan is behind — suggested focus: Z."
//
// PURE in the plan-family pattern (adherence.ts, today.ts): every
// input is data the workspace page already loaded, no I/O here, so
// the card is reproducible and unit-testable. The "since" anchor is
// the newest tutor_notes.session_at for the student (writing the
// wrap-up note is what ends a session); with no note yet, callers
// pass a default lookback window instead.
//
// Scales, for the record: mastery is 0–100 (skill_mastery_snapshots
// convention), accuracy is 0–1 (get_roster_skill_performance
// convention).

import type { AdherenceSummary } from '@/lib/plan/adherence';

/** Subset of a get_skill_mastery_asof row the card needs. */
export interface MasteryPoint {
  domain_code: string;
  skill_code: string;
  mastery: number;
  attempts_count: number;
}

/** Subset of a get_roster_skill_performance row the card needs. */
export interface SkillPerformancePoint {
  skill_code: string;
  skill_name: string;
  attempts: number;
  missed: number;
  accuracy: number; // 0–1
}

/** Subset of a get_student_coverage row the card needs. */
export interface CoveragePoint {
  domain_code: string;
  skill_code: string;
  title: string;
  sequence: number;
  mastery: number;
  mastery_threshold: number;
  status: string; // not_started | in_progress | practiced | mastered | decayed
  questions_available: number;
  attempts_count: number;
}

export interface MasteryMover {
  domainCode: string;
  skillCode: string;
  /** Unit title when coverage knows the skill; falls back to the code. */
  title: string;
  from: number;
  to: number;
  delta: number;
}

export interface Struggle {
  skillCode: string;
  skillName: string;
  attempts: number;
  missed: number;
  accuracy: number; // 0–1
}

export type FocusKind = 'catch_up' | 'recover' | 'strengthen' | 'start_next' | 'none';

export interface FocusSuggestion {
  kind: FocusKind;
  /** Set for skill-shaped suggestions (recover/strengthen/start_next). */
  skillCode: string | null;
  title: string;
  reason: string;
}

export interface PrepCard {
  movers: { up: MasteryMover[]; down: MasteryMover[] };
  struggles: Struggle[];
  focus: FocusSuggestion;
}

/** Movement below this many mastery points is noise, not a mover. */
export const MIN_MOVE = 3;
/** Accuracy at/above this is not a "struggle" no matter the volume. */
export const STRUGGLE_ACCURACY_BELOW = 0.6;
const MAX_MOVERS_PER_DIRECTION = 3;
const MAX_STRUGGLES = 3;

const key = (domainCode: string, skillCode: string) => `${domainCode}:${skillCode}`;

/**
 * Diff two mastery-as-of readings. A skill only moves if it saw new
 * attempts in the window — identical attempt counts mean the score
 * can't have changed for a reason worth telling the tutor about.
 * Skills absent from `then` are first-touched in the window (from 0).
 */
export function computeMasteryMovers(
  then: readonly MasteryPoint[],
  now: readonly MasteryPoint[],
  coverage: readonly CoveragePoint[] = [],
): { up: MasteryMover[]; down: MasteryMover[] } {
  const thenBy = new Map(then.map((p) => [key(p.domain_code, p.skill_code), p]));
  const titleBy = new Map(coverage.map((c) => [key(c.domain_code, c.skill_code), c.title]));

  const movers: MasteryMover[] = [];
  for (const p of now) {
    const k = key(p.domain_code, p.skill_code);
    const before = thenBy.get(k);
    if (before && before.attempts_count === p.attempts_count) continue;
    const from = before?.mastery ?? 0;
    const delta = p.mastery - from;
    if (Math.abs(delta) < MIN_MOVE) continue;
    movers.push({
      domainCode: p.domain_code,
      skillCode: p.skill_code,
      title: titleBy.get(k) ?? p.skill_code,
      from,
      to: p.mastery,
      delta,
    });
  }

  movers.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {
    up: movers.filter((m) => m.delta > 0).slice(0, MAX_MOVERS_PER_DIRECTION),
    down: movers.filter((m) => m.delta < 0).slice(0, MAX_MOVERS_PER_DIRECTION),
  };
}

/** Most-missed low-accuracy skills in the window, worst first. */
export function topStruggles(rows: readonly SkillPerformancePoint[]): Struggle[] {
  return rows
    .filter((r) => r.attempts > 0 && r.accuracy < STRUGGLE_ACCURACY_BELOW)
    .sort((a, b) => b.missed - a.missed || a.accuracy - b.accuracy)
    .slice(0, MAX_STRUGGLES)
    .map((r) => ({
      skillCode: r.skill_code,
      skillName: r.skill_name,
      attempts: r.attempts,
      missed: r.missed,
      accuracy: r.accuracy,
    }));
}

/**
 * One suggestion, by priority: catch up an off-track plan → recover a
 * decayed skill → strengthen the weakest practiced-but-unmastered
 * skill (only ones with bank questions to drill) → start the next
 * untouched unit in curriculum order.
 */
export function suggestFocus(
  adherence: AdherenceSummary | null,
  coverage: readonly CoveragePoint[],
): FocusSuggestion {
  if (adherence && adherence.status === 'behind') {
    return {
      kind: 'catch_up',
      skillCode: null,
      title: 'Catch up on the plan',
      reason: `${adherence.overdueCount} overdue task${adherence.overdueCount === 1 ? '' : 's'} — clear these before new material.`,
    };
  }

  const drillable = coverage.filter((c) => c.questions_available > 0);

  const decayed = drillable
    .filter((c) => c.status === 'decayed')
    .sort((a, b) => a.mastery - b.mastery)[0];
  if (decayed) {
    return {
      kind: 'recover',
      skillCode: decayed.skill_code,
      title: decayed.title,
      reason: `Mastery has slipped from its peak (now ${Math.round(decayed.mastery)}) — a short review protects earlier work.`,
    };
  }

  const weakest = drillable
    .filter(
      (c) =>
        (c.status === 'in_progress' || c.status === 'practiced') &&
        c.attempts_count > 0 &&
        c.mastery < c.mastery_threshold,
    )
    .sort((a, b) => a.mastery - b.mastery)[0];
  if (weakest) {
    const headroom = Math.round(weakest.mastery_threshold - weakest.mastery);
    return {
      kind: 'strengthen',
      skillCode: weakest.skill_code,
      title: weakest.title,
      reason: `Weakest started skill (mastery ${Math.round(weakest.mastery)}, ${headroom} below threshold) — highest-leverage drill target.`,
    };
  }

  const next = coverage
    .filter((c) => c.status === 'not_started')
    .sort((a, b) => a.sequence - b.sequence)[0];
  if (next) {
    return {
      kind: 'start_next',
      skillCode: next.skill_code,
      title: next.title,
      reason: 'Next untouched unit in curriculum order.',
    };
  }

  return {
    kind: 'none',
    skillCode: null,
    title: 'Keep the streak',
    reason: 'Nothing overdue, nothing decayed, nothing weak — maintain with mixed review.',
  };
}

export function buildPrepCard(input: {
  masteryThen: readonly MasteryPoint[];
  masteryNow: readonly MasteryPoint[];
  skillPerformance: readonly SkillPerformancePoint[];
  coverage: readonly CoveragePoint[];
  adherence: AdherenceSummary | null;
}): PrepCard {
  return {
    movers: computeMasteryMovers(input.masteryThen, input.masteryNow, input.coverage),
    struggles: topStruggles(input.skillPerformance),
    focus: suggestFocus(input.adherence, input.coverage),
  };
}
