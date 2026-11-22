// Plan-engine Server Actions (§2.2 wiring). generateStudyPlan turns the
// deterministic generator into a saved, reviewable plan:
//   rpc(get_plan_inputs) → generatePlan() → write study_plan + plan_tasks
//
// The plan is written as a DRAFT (the tutor/student reviews before it
// goes active, §2.4). Regenerating updates the prior draft for the same
// (student, test_type). Authorization rides on RLS: the study_plans /
// plan_tasks policies gate on can_view(student_id), so a student can
// generate for themselves and a tutor for a visible student — anyone
// else's insert is rejected by the database.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import { composePhases, daysBetween, generatePlan, LOW_EVIDENCE_ATTEMPTS } from './generate-plan';
import { applyEvidencePriors, mapSkillRow } from './plan-inputs';
import { isSectionFocus, storedSectionFocus, type SectionFocus } from './section-focus';
import { loadSyllabusInputs } from './unit-steps';
import { editorConfig, filterCustomizedTasks, planStartDate, record, stampGeneratedTasks } from './customization';
import { loadPlanForGeneration } from './editor-state';
import { deriveMode, parseIntakeRow } from './intake';
import { runRepaceForStudent, writeDraftPlan } from './repace-runner';
import type { PlanMode, PlanPhase, SkillState } from './generate-plan';
import type { PlanComposition } from './plan-inputs';
import type { ActionResult } from '@/lib/types';
import type { Json } from '@/lib/types/database';

type GenerateStudyPlanResult = ActionResult<{
  planId: string;
  weeks: number;
  taskCount: number;
  rationale: string;
  mode: PlanMode;
  phases: PlanPhase[];
}>;

export interface GenerateStudyPlanArgs {
  /** Start a new empty draft; existing drafts are archived for history. */
  empty?: boolean;
  /** Defaults to the caller (self-serve); a tutor passes a visible student's id. */
  studentId?: string;
  /** Omit to use the student's current profile target. */
  goalScore?: number;
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
  sectionFocus?: SectionFocus;
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

  let goalScore = args.goalScore;
  if (goalScore == null && testType === 'sat') {
    const { data: student, error } = await supabase.from('profiles')
      .select('target_sat_score').eq('id', studentId).maybeSingle();
    if (error) return actionFail('Could not load the student target score.');
    goalScore = student?.target_sat_score ?? undefined;
  }
  // Validate the intake fields.
  if (goalScore == null || !Number.isFinite(goalScore) || goalScore < 400 || goalScore > 1600) {
    return actionFail('Enter a target score between 400 and 1600.');
  }
  if (!args.testDate || !/^\d{4}-\d{2}-\d{2}$/.test(args.testDate)) {
    return actionFail('A valid test date is required.');
  }
  if (!Number.isFinite(args.weeklyHours) || args.weeklyHours < 1 || args.weeklyHours > 40) {
    return actionFail('Weekly hours must be between 1 and 40.');
  }
  if (args.sectionFocus !== undefined && !isSectionFocus(args.sectionFocus)) return actionFail('Choose an SAT section.');
  const today = new Date().toISOString().slice(0, 10);
  if (args.testDate <= today) return actionFail('Choose a future test date.');
  if (args.empty) {
    const result = await writeDraftPlan(supabase, {
      studentId, createdBy: user.id, testType, goalScore,
      startingScore: null, testDate: args.testDate, weeklyHours: args.weeklyHours,
      empty: true, rationale: 'Built by your tutor, one unit or task at a time.',
    }, []);
    return result.ok
      ? { ok: true, planId: result.planId, weeks: Math.ceil(daysBetween(today, args.testDate) / 7), taskCount: 0, rationale: 'Built by your tutor.', mode: 'self_directed', phases: [] }
      : actionFail(result.error);
  }
  let previous: Awaited<ReturnType<typeof loadPlanForGeneration>>;
  try {
    previous = await loadPlanForGeneration(supabase, studentId, testType);
  } catch (err) {
    return actionFail(err instanceof Error ? err.message : 'Could not load the current plan.');
  }
  // Choosing the automatic builder is an explicit switch from a blank
  // plan. Student rebuilds and cron re-pacing never make that switch.
  const generationConfig = { ...record(previous.plan?.config), editor: { ...record(record(previous.plan?.config).editor), manual: false } };

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
  const sectionFocus = args.sectionFocus ?? storedSectionFocus(previous.plan?.config);
  let composition: Omit<PlanComposition, 'mode'> = {
    sectionFocus,
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
        sectionFocus,
        studyDays: intake.studyDays,
        targets: intake.targets.map((t) => t.skillCode),
        fullTests: intake.fullTests,
        selfRating: intake.selfRating as Record<string, number | null> | null,
      };
    } else {
      mode = rawSkills.some((s) => (sectionFocus === 'both' || s.section === sectionFocus) && s.attemptsCount >= LOW_EVIDENCE_ATTEMPTS)
        ? 'targeted'
        : 'foundations';
    }
  }
  const excluded = new Set(editorConfig(previous.plan?.config).excludedSkills);
  const skills = applyEvidencePriors(rawSkills, composition).filter((s) => !excluded.has(s.skillCode));
  // Unit syllabi (flag `unit_syllabus`): null → pre-syllabus generator.
  const syllabus = await loadSyllabusInputs(supabase, studentId, testType);

  // Baseline: use the provided score, else the current predicted band total.
  let startingScore = args.startingScore ?? null;
  if (startingScore == null) {
    const { data: band } = await supabase.rpc('get_predicted_score_band', {
      p_student: studentId,
      p_test_type: testType,
    });
    startingScore = band?.[0]?.total_scaled ?? null;
  }

  const anchor = previous.plan ? planStartDate(previous.plan.config, previous.plan.created_at, previous.tasks.map((t) => t.scheduled_date)) : today;
  const elapsed = Math.max(0, Math.floor(daysBetween(anchor, today) / 7));
  const draft = generatePlan({
    goalScore,
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
    sectionFocus,
    unitSteps: syllabus?.unitSteps ?? null,
    sectionSteps: syllabus?.sectionSteps ?? null,
    completedLessonIds: syllabus?.completedLessonIds ?? null,
    elapsedWeeks: elapsed,
  });

  if (sectionFocus !== 'both' && draft.tasks.length === 0) {
    return actionFail('There are no available units to schedule in this section.');
  }

  const written = await writeDraftPlan(
    supabase,
    {
      studentId,
      createdBy: user.id,
      testType,
      goalScore,
      startingScore,
      testDate: args.testDate,
      weeklyHours: args.weeklyHours,
      mode: draft.mode,
      prepLevel,
      intent,
      rationale: draft.rationale,
      phases: composePhases(draft.mode, elapsed + draft.weeks, sectionFocus === 'both' && composition.fullTests),
      composition,
      sourcePlanId: previous.plan?.id,
      expectedUpdatedAt: previous.plan?.updated_at,
      editor: generationConfig.editor as Json,
    },
    filterCustomizedTasks(stampGeneratedTasks(draft.tasks.map((t) => ({ ...t, weekIndex: t.weekIndex + elapsed }))), generationConfig, previous.existing),
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
