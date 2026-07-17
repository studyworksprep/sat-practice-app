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
import { generatePlan, repacePlan } from './generate-plan';
import { mapSkillRow } from './plan-inputs';
import type {
  ExistingTask,
  PlanTaskSource,
  PlanTaskType,
  SkillState,
} from './generate-plan';
import type { ActionResult } from '@/lib/types';
import type { Json } from '@/lib/types/database';

// ── Shared internals ──────────────────────────────────────────────

type SupabaseCtx = Awaited<ReturnType<typeof requireUser>>['supabase'];

function numFromJson(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && typeof (obj as Record<string, unknown>)[key] === 'number') {
    return (obj as Record<string, number>)[key];
  }
  return null;
}

interface DraftTaskWrite {
  weekIndex: number;
  scheduledDate: string;
  taskType: PlanTaskType;
  payload: Record<string, unknown>;
  source: PlanTaskSource;
}

/**
 * Replace any prior draft for (student, test_type) and write a new one
 * plus its tasks. Shared by generateStudyPlan (§2.2) and proposeRepace
 * (§2.5). The active plan (if any) is untouched — a draft is reviewed and
 * activated separately. RLS on both tables gates every write.
 */
async function writeDraftPlan(
  supabase: SupabaseCtx,
  meta: {
    studentId: string;
    createdBy: string;
    testType: 'sat' | 'act';
    goalScore: number;
    startingScore: number | null;
    testDate: string;
    weeklyHours: number;
  },
  tasks: DraftTaskWrite[],
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  await supabase
    .from('study_plans')
    .delete()
    .eq('student_id', meta.studentId)
    .eq('test_type', meta.testType)
    .eq('status', 'draft');

  const { data: plan, error: planErr } = await supabase
    .from('study_plans')
    .insert({
      student_id: meta.studentId,
      created_by: meta.createdBy,
      test_type: meta.testType,
      goal_score: meta.goalScore,
      starting_score: meta.startingScore,
      test_date: meta.testDate,
      status: 'draft',
      config: { weekly_hours: meta.weeklyHours },
    })
    .select('id')
    .single();
  if (planErr || !plan) {
    return { ok: false, error: planErr?.message ?? 'unknown error' };
  }

  const taskRows = tasks.map((t) => ({
    plan_id: plan.id,
    week_index: t.weekIndex,
    scheduled_date: t.scheduledDate,
    task_type: t.taskType,
    payload: t.payload as unknown as Json,
    status: 'pending',
    source: t.source,
  }));
  const { error: taskErr } = await supabase.from('plan_tasks').insert(taskRows);
  if (taskErr) {
    // Don't leave an empty draft behind if the tasks fail to write.
    await supabase.from('study_plans').delete().eq('id', plan.id);
    return { ok: false, error: taskErr.message };
  }
  return { ok: true, planId: plan.id };
}

type GenerateStudyPlanResult = ActionResult<{
  planId: string;
  weeks: number;
  taskCount: number;
  rationale: string;
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
  const skills: SkillState[] = (rows ?? []).map(mapSkillRow);
  if (skills.length === 0) {
    return actionFail('No curriculum is defined for this test type yet.');
  }

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
 * Re-pace a student's active plan (§2.5). Compares the student's current
 * predicted score against the plan's implied trajectory; if drift exceeds
 * the threshold, regenerates the remaining horizon (preserving tutor
 * edits) as a fresh draft — and, for self-serve callers, activates it.
 * A no-op success is returned when there's no active plan or no drift.
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

  const studentId = args.studentId ?? user.id;
  const testType = args.testType ?? 'sat';

  // The active plan is what we re-pace against.
  const { data: active, error: activeErr } = await supabase
    .from('study_plans')
    .select('id, goal_score, starting_score, test_date, config, created_at')
    .eq('student_id', studentId)
    .eq('test_type', testType)
    .eq('status', 'active')
    .maybeSingle();
  if (activeErr) return actionFail(`Could not load the active plan: ${activeErr.message}`);
  if (!active) {
    return { ok: true, repaced: false, reason: 'No active plan to re-pace.', driftPoints: null };
  }
  if (!active.test_date || active.goal_score == null) {
    return {
      ok: true,
      repaced: false,
      reason: 'The active plan is missing a goal or test date.',
      driftPoints: null,
    };
  }

  // Its tasks — needed to preserve the tutor's manual edits.
  const { data: taskRows } = await supabase
    .from('plan_tasks')
    .select('week_index, scheduled_date, task_type, payload, source, status')
    .eq('plan_id', active.id);
  const existingTasks: ExistingTask[] = (taskRows ?? []).map((t) => ({
    weekIndex: t.week_index,
    scheduledDate: t.scheduled_date,
    taskType: t.task_type as PlanTaskType,
    payload: (t.payload ?? {}) as Record<string, unknown>,
    source: (t.source ?? 'generated') as PlanTaskSource,
    status: (t.status ?? 'pending') as 'pending' | 'completed' | 'skipped',
  }));

  // Current per-skill state + current predicted score.
  const { data: inputRows, error: inErr } = await supabase.rpc('get_plan_inputs', {
    p_student: studentId,
    p_test_type: testType,
  });
  if (inErr) return actionFail(`Could not load skill data: ${inErr.message}`);
  const skills: SkillState[] = (inputRows ?? []).map(mapSkillRow);

  const { data: band } = await supabase.rpc('get_predicted_score_band', {
    p_student: studentId,
    p_test_type: testType,
  });
  const currentScore = band?.[0]?.total_scaled ?? null;

  // Week-0 anchor: the earliest scheduled task, else the plan's creation date.
  const scheduledDates = existingTasks
    .map((t) => t.scheduledDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  const planStart = scheduledDates[0] ?? String(active.created_at).slice(0, 10);
  const weeklyHours = numFromJson(active.config, 'weekly_hours') ?? 5;

  const today = new Date().toISOString().slice(0, 10);
  const result = repacePlan({
    today,
    planStart,
    testDate: active.test_date,
    startingScore: active.starting_score,
    goalScore: active.goal_score,
    currentScore,
    weeklyHours,
    testType,
    skills,
    existingTasks,
    driftThreshold: args.driftThreshold,
  });

  if (!result.shouldRepace || !result.tasks) {
    return { ok: true, repaced: false, reason: result.reason, driftPoints: result.driftPoints };
  }

  // Write the regenerated plan as a fresh draft (baseline = current score).
  const written = await writeDraftPlan(
    supabase,
    {
      studentId,
      createdBy: user.id,
      testType,
      goalScore: active.goal_score,
      startingScore: currentScore,
      testDate: active.test_date,
      weeklyHours,
    },
    result.tasks,
  );
  if (!written.ok) return actionFail(`Could not write the re-paced plan: ${written.error}`);

  // Self-serve auto-apply activates the draft immediately; tutored students
  // leave it as a draft for review.
  let applied = false;
  if (args.autoApply) {
    const { error: actErr } = await supabase.rpc('activate_study_plan', {
      p_plan_id: written.planId,
    });
    if (actErr) {
      return actionFail(`Re-paced draft saved, but auto-apply failed: ${actErr.message}`);
    }
    applied = true;
  }

  return {
    ok: true,
    repaced: true,
    reason: result.reason,
    driftPoints: result.driftPoints,
    planId: written.planId,
    applied,
    weeks: result.weeks ?? undefined,
    taskCount: result.tasks.length,
  };
}
