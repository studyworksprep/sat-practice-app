// Plan-engine Server Actions (§2.2 wiring). generateStudyPlan turns the
// deterministic generator into a saved, reviewable plan:
//   rpc(get_plan_inputs) → generatePlan() → write study_plan + plan_tasks
//
// The plan is written as a DRAFT (the tutor/student reviews before it
// goes active, §2.4). Regenerating replaces the prior draft for the same
// (student, test_type). Authorization rides on RLS: the study_plans /
// plan_tasks policies gate on can_view(student_id), so a student can
// generate for themselves and a tutor for a visible student — anyone
// else's insert is rejected by the database.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { generatePlan, LOW_EVIDENCE_ATTEMPTS } from './generate-plan';
import { applyEvidencePriors, mapSkillRow } from './plan-inputs';
import { deriveMode, parseIntakeRow } from './intake';
import { runRepaceForStudent, writeDraftPlan } from './repace-runner';
import type { PlanMode, PlanPhase, SkillState } from './generate-plan';
import type { PlanComposition } from './plan-inputs';
import type { ActionResult } from '@/lib/types';

type GenerateStudyPlanResult = ActionResult<{
  planId: string;
  weeks: number;
  taskCount: number;
  rationale: string;
  mode: PlanMode;
  phases: PlanPhase[];
}>;

export interface GenerateStudyPlanArgs {
  /** Defaults to the caller (self-serve); a tutor passes a visible student's id. */
  studentId?: string;
  goalScore: number;
  testDate: string; // ISO yyyy-mm-dd
  weeklyHours: number;
  /** Baseline scaled score; if omitted, the current predicted band total is used. */
  startingScore?: number | null;
  testType?: 'sat' | 'act';
  /** Composition (docs/student-onboarding-and-plan-redesign-2026-09.md
   *  §5). The wizard passes everything from the intake. A tutor's form
   *  passes nothing: the student's intake row (if any) is used, else the
   *  mode is inferred from evidence — targeted once any skill has real
   *  attempts, foundations for a blank slate. */
  mode?: PlanMode;
  prepLevel?: string | null;
  intent?: string | null;
  studyDays?: number[] | null;
  targets?: string[] | null;
  fullTests?: boolean;
  selfRating?: Record<string, number | null> | null;
}

export async function generateStudyPlan(
  args: GenerateStudyPlanArgs,
): Promise<GenerateStudyPlanResult> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase, profile } = ctx;
  if (profile?.is_demo) return actionFail('Demo accounts are read-only');

  const studentId = args.studentId ?? user.id;
  const testType = args.testType ?? 'sat';

  // Validate the intake fields.
  if (!Number.isFinite(args.goalScore) || args.goalScore < 400 || args.goalScore > 1600) {
    return actionFail('Enter a target score between 400 and 1600.');
  }
  if (!args.testDate || !/^\d{4}-\d{2}-\d{2}$/.test(args.testDate)) {
    return actionFail('A valid test date is required.');
  }
  if (!Number.isFinite(args.weeklyHours) || args.weeklyHours < 1 || args.weeklyHours > 40) {
    return actionFail('Weekly hours must be between 1 and 40.');
  }

  // Assemble per-skill inputs (coverage + curriculum + learnability + lessons).
  const { data: rows, error: inErr } = await supabase.rpc('get_plan_inputs', {
    p_student: studentId,
    p_test_type: testType,
  });
  if (inErr) return actionFail(`Could not load skill data: ${inErr.message}`);
  const rawSkills: SkillState[] = (rows ?? []).map(mapSkillRow);
  if (rawSkills.length === 0) {
    return actionFail('No curriculum is defined for this test type yet.');
  }

  // Composition: explicit args win; otherwise the student's intake row;
  // otherwise infer from evidence.
  let mode = args.mode ?? null;
  let prepLevel = args.prepLevel ?? null;
  let intent = args.intent ?? null;
  let composition: Omit<PlanComposition, 'mode'> = {
    studyDays: args.studyDays ?? null,
    targets: args.targets ?? null,
    fullTests: args.fullTests ?? true,
    selfRating: args.selfRating ?? null,
  };
  if (!mode) {
    const { data: intakeRow } = await supabase
      .from('student_intake')
      .select('prep_level, intent, targets, weekly_hours, study_days, self_rating, full_tests, completed_at, skipped_at')
      .eq('student_id', studentId)
      .maybeSingle();
    const intake = parseIntakeRow(intakeRow);
    if (intake.prepLevel && intake.intent) {
      mode = deriveMode(intake.prepLevel, intake.intent);
      prepLevel = intake.prepLevel;
      intent = intake.intent;
      composition = {
        studyDays: intake.studyDays,
        targets: intake.targets.map((t) => t.skillCode),
        fullTests: intake.fullTests,
        selfRating: intake.selfRating as Record<string, number | null> | null,
      };
    } else {
      mode = rawSkills.some((s) => s.attemptsCount >= LOW_EVIDENCE_ATTEMPTS)
        ? 'targeted'
        : 'foundations';
    }
  }
  const skills = applyEvidencePriors(rawSkills, composition);

  // Baseline: use the provided score, else the current predicted band total.
  let startingScore = args.startingScore ?? null;
  if (startingScore == null) {
    const { data: band } = await supabase.rpc('get_predicted_score_band', {
      p_student: studentId,
      p_test_type: testType,
    });
    startingScore = band?.[0]?.total_scaled ?? null;
  }

  const today = new Date().toISOString().slice(0, 10);
  const draft = generatePlan({
    goalScore: args.goalScore,
    startingScore,
    testDate: args.testDate,
    today,
    weeklyHours: args.weeklyHours,
    testType,
    skills,
    mode,
    studyDays: composition.studyDays,
    targets: composition.targets,
    fullTests: composition.fullTests,
  });

  const written = await writeDraftPlan(
    supabase,
    {
      studentId,
      createdBy: user.id,
      testType,
      goalScore: args.goalScore,
      startingScore,
      testDate: args.testDate,
      weeklyHours: args.weeklyHours,
      mode: draft.mode,
      prepLevel,
      intent,
      rationale: draft.rationale,
      phases: draft.phases,
      composition,
    },
    draft.tasks,
  );
  if (!written.ok) return actionFail(`Could not create the plan: ${written.error}`);

  return {
    ok: true,
    planId: written.planId,
    weeks: draft.weeks,
    taskCount: draft.tasks.length,
    rationale: draft.rationale,
    mode: draft.mode,
    phases: draft.phases,
  };
}

type ActivatePlanResult = ActionResult<{ planId: string; status: 'active' }>;

/**
 * Promote a reviewed DRAFT plan to the student's live plan (§2.4). The
 * heavy lifting — archiving any prior active plan and flipping this one
 * to active in a single transaction — is done by the activate_study_plan
 * SQL function so the one-active unique index is never violated. RLS on
 * study_plans decides who may activate (the student, or a tutor with a
 * visible student); an invisible plan surfaces as "not accessible".
 */
export async function activatePlan(planId: string): Promise<ActivatePlanResult> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { supabase, profile } = ctx;
  if (profile?.is_demo) return actionFail('Demo accounts are read-only');

  if (!planId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(planId)) {
    return actionFail('A valid plan id is required.');
  }

  const { data, error } = await supabase.rpc('activate_study_plan', {
    p_plan_id: planId,
  });
  if (error) return actionFail(error.message);
  if (!data) return actionFail('Plan not found or not accessible.');

  return { ok: true, planId: data, status: 'active' };
}

export interface ProposeRepaceArgs {
  /** Defaults to the caller (self-serve); a tutor/job passes a student id. */
  studentId?: string;
  testType?: 'sat' | 'act';
  /**
   * Self-serve students get auto-apply ("the app acting as the tutor",
   * §2.5): the re-paced draft is activated immediately. Tutored students
   * leave it false so the tutor reviews the draft on the Study Plan page.
   * The caller (UI / future weekly job) owns this routing decision.
   */
  autoApply?: boolean;
  driftThreshold?: number;
}

type ProposeRepaceResult = ActionResult<{
  repaced: boolean;
  reason: string;
  driftPoints: number | null;
  planId?: string;
  applied?: boolean;
  weeks?: number;
  taskCount?: number;
}>;

/**
 * Re-pace a student's active plan (§2.5) — the interactive entry point.
 * Auth + RLS scoping happen here; the orchestration itself lives in
 * runRepaceForStudent (lib/plan/repace-runner.ts), shared with the
 * weekly cron so the two paths can never drift apart.
 */
export async function proposeRepace(args: ProposeRepaceArgs = {}): Promise<ProposeRepaceResult> {
  let ctx;
  try {
    ctx = await requireUser();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error loading user');
  }
  const { user, supabase, profile } = ctx;
  if (profile?.is_demo) return actionFail('Demo accounts are read-only');

  const result = await runRepaceForStudent(supabase, {
    studentId: args.studentId ?? user.id,
    testType: args.testType ?? 'sat',
    createdBy: user.id,
    autoApply: args.autoApply ?? false,
    today: new Date().toISOString().slice(0, 10),
    driftThreshold: args.driftThreshold,
  });
  if (!result.ok) return actionFail(result.reason);

  return {
    ok: true,
    repaced: result.repaced,
    reason: result.reason,
    driftPoints: result.driftPoints,
    planId: result.planId,
    applied: result.applied,
    weeks: result.weeks,
    taskCount: result.taskCount,
  };
}
