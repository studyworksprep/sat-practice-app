// Intake model + pure helpers (docs/student-onboarding-and-plan-redesign-2026-09.md §3, §5.2, §5.4).
//
// The /welcome wizard stores its answers in student_intake and derives
// its current step from that row plus the profile and any draft plan.
// Everything here is pure so the step ladder and the intake → generator
// mapping are unit-testable (lib/plan/intake.test.mjs). Relative
// imports with .ts extensions because `node --test` loads this chain
// directly (same convention as today.ts).

import type { PlanMode } from './generate-plan.ts';

export type PrepLevel = 'none' | 'some' | 'a_lot';
export type Intent = 'guide_me' | 'own_targets';

export const PREP_LEVELS: readonly PrepLevel[] = ['none', 'some', 'a_lot'];
export const INTENTS: readonly Intent[] = ['guide_me', 'own_targets'];

/** The eight SAT domains, in report order (Math, then Reading & Writing). */
export const SAT_DOMAIN_CODES = ['H', 'P', 'Q', 'S', 'INI', 'CAS', 'EOI', 'SEC'] as const;
export type SatDomainCode = (typeof SAT_DOMAIN_CODES)[number];

export interface IntakeTarget {
  domainCode: string;
  skillCode: string;
}

/** A student_intake row, normalized (jsonb columns parsed, nulls kept). */
export interface IntakeState {
  prepLevel: PrepLevel | null;
  intent: Intent | null;
  targets: IntakeTarget[];
  weeklyHours: number | null;
  /** 0 = Sunday … 6 = Saturday. Null = unanswered. */
  studyDays: number[] | null;
  /** 1–5 comfort per domain code. Null = unanswered. */
  selfRating: Partial<Record<SatDomainCode, number>> | null;
  /** Self-directed: keep scheduled full-length tests (default true). */
  fullTests: boolean;
  completedAt: string | null;
  skippedAt: string | null;
}

export const EMPTY_INTAKE: IntakeState = {
  prepLevel: null,
  intent: null,
  targets: [],
  weeklyHours: null,
  studyDays: null,
  selfRating: null,
  fullTests: true,
  completedAt: null,
  skippedAt: null,
};

export function isPrepLevel(v: unknown): v is PrepLevel {
  return typeof v === 'string' && (PREP_LEVELS as readonly string[]).includes(v);
}

export function isIntent(v: unknown): v is Intent {
  return typeof v === 'string' && (INTENTS as readonly string[]).includes(v);
}

/** Parse the jsonb columns of a student_intake row defensively. */
export function parseIntakeRow(row: {
  prep_level: string | null;
  intent: string | null;
  targets: unknown;
  weekly_hours: number | null;
  study_days: unknown;
  self_rating: unknown;
  full_tests?: boolean | null;
  completed_at: string | null;
  skipped_at: string | null;
} | null | undefined): IntakeState {
  if (!row) return EMPTY_INTAKE;
  return {
    prepLevel: isPrepLevel(row.prep_level) ? row.prep_level : null,
    intent: isIntent(row.intent) ? row.intent : null,
    targets: parseTargets(row.targets),
    weeklyHours:
      typeof row.weekly_hours === 'number' && row.weekly_hours >= 1 && row.weekly_hours <= 40
        ? row.weekly_hours
        : null,
    studyDays: parseStudyDays(row.study_days),
    selfRating: parseSelfRating(row.self_rating),
    fullTests: row.full_tests !== false,
    completedAt: row.completed_at,
    skippedAt: row.skipped_at,
  };
}

export function parseTargets(v: unknown): IntakeTarget[] {
  if (!Array.isArray(v)) return [];
  const out: IntakeTarget[] = [];
  for (const item of v) {
    if (!item || typeof item !== 'object') continue;
    const d = (item as Record<string, unknown>).domain_code;
    const s = (item as Record<string, unknown>).skill_code;
    if (typeof d === 'string' && typeof s === 'string' && d && s) {
      out.push({ domainCode: d, skillCode: s });
    }
  }
  return out;
}

/** Valid study days: a non-empty list of distinct weekday numbers 0–6. */
export function parseStudyDays(v: unknown): number[] | null {
  if (!Array.isArray(v)) return null;
  const days = [...new Set(v.filter((d): d is number => Number.isInteger(d) && d >= 0 && d <= 6))].sort(
    (a, b) => a - b,
  );
  return days.length > 0 ? days : null;
}

/** A complete self-rating: every domain present with an integer 1–5. */
export function parseSelfRating(v: unknown): Partial<Record<SatDomainCode, number>> | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out: Partial<Record<SatDomainCode, number>> = {};
  for (const code of SAT_DOMAIN_CODES) {
    const r = (v as Record<string, unknown>)[code];
    if (Number.isInteger(r) && (r as number) >= 1 && (r as number) <= 5) out[code] = r as number;
  }
  return Object.keys(out).length === SAT_DOMAIN_CODES.length ? out : null;
}

export function isSelfRatingComplete(v: Partial<Record<SatDomainCode, number>> | null): boolean {
  return v != null && SAT_DOMAIN_CODES.every((c) => Number.isInteger(v[c]));
}

// ── Intake → generator inputs ─────────────────────────────────────

/** Plan mode from the intake answers (§5.2). `hasEvidence` is Phase 3's
 *  hook (reported tests); in Phase 1 it is always false, so prep = some
 *  lands in foundations. */
export function deriveMode(
  prepLevel: PrepLevel,
  intent: Intent,
  hasEvidence = false,
): PlanMode {
  if (intent === 'own_targets') return 'self_directed';
  if (prepLevel === 'a_lot') return 'targeted';
  if (prepLevel === 'some' && hasEvidence) return 'targeted';
  return 'foundations';
}

/** Self-rating → evidence prior (§5.4): (rating − 1) / 4, damped by
 *  half toward 0.5 so a self-rating moves the prior half as far as a
 *  test would. 1 → 0.25, 3 → 0.5, 5 → 0.75. */
export function selfRatingToPrior(rating: number): number {
  const r = Math.min(5, Math.max(1, Math.round(rating)));
  return 0.5 + 0.5 * ((r - 1) / 4 - 0.5);
}

// ── Wizard step ladder (§3.1) ─────────────────────────────────────

export type WizardStep =
  | 'situation'
  | 'targets'
  | 'availability'
  | 'assess'
  | 'build'
  | 'preview';

export const WIZARD_STEP_ORDER: readonly WizardStep[] = [
  'situation',
  'targets',
  'availability',
  'assess',
  'build',
  'preview',
];

export function isWizardStep(v: unknown): v is WizardStep {
  return typeof v === 'string' && (WIZARD_STEP_ORDER as readonly string[]).includes(v);
}

/** Derive the wizard's current step from data. `override` (the ?step=
 *  query) lets a student revisit an earlier step; it never jumps ahead
 *  of what the data supports. */
export function deriveWizardStep(args: {
  goal: number | null;
  testDate: string | null;
  intake: IntakeState;
  hasDraft: boolean;
  override?: string | null;
}): WizardStep {
  const { goal, testDate, intake, hasDraft } = args;

  let derived: WizardStep;
  if (!goal || !testDate || !intake.prepLevel || !intake.intent) derived = 'situation';
  else if (intake.intent === 'own_targets' && intake.targets.length === 0) derived = 'targets';
  else if (!intake.weeklyHours || !intake.studyDays) derived = 'availability';
  else if (!isSelfRatingComplete(intake.selfRating)) derived = 'assess';
  else if (!hasDraft) derived = 'build';
  else derived = 'preview';

  if (isWizardStep(args.override)) {
    const o = args.override;
    // 'targets' only exists for own_targets; everything else may be
    // revisited as long as it's not past the derived step.
    if (o === 'targets' && intake.intent !== 'own_targets') return derived;
    if (WIZARD_STEP_ORDER.indexOf(o) <= WIZARD_STEP_ORDER.indexOf(derived)) return o;
  }
  return derived;
}

/** Whether the app should route this student to /welcome on login
 *  (§3.1): no active plan, and the intake is neither finished nor
 *  explicitly set aside. */
export function shouldRouteToWelcome(args: {
  hasActivePlan: boolean;
  intake: IntakeState;
}): boolean {
  if (args.hasActivePlan) return false;
  return !args.intake.completedAt && !args.intake.skippedAt;
}
