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
import { generatePlan } from './generate-plan';
import type { PlanSection, SkillState } from './generate-plan';
import type { ActionResult } from '@/lib/types';
import type { Json } from '@/lib/types/database';

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
  const skills: SkillState[] = (rows ?? []).map((r) => ({
    domainCode: r.domain_code,
    skillCode: r.skill_code,
    section: (r.section === 'math' ? 'math' : 'reading_writing') as PlanSection,
    mastery: r.mastery,
    attemptsCount: r.attempts_count ?? 0,
    coverageStatus: r.coverage_status ?? 'not_started',
    masteryThreshold: r.mastery_threshold ?? 80,
    learnability: r.learnability,
    expectedMinutes: r.expected_minutes ?? 60,
    sequence: r.sequence ?? 0,
    questionsAvailable: r.questions_available ?? 0,
    hasLesson: r.has_lesson ?? false,
  }));
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

  // Replace any prior draft for this (student, test_type), then write the
  // new draft + its tasks. The active plan (if any) is untouched — a draft
  // is reviewed and activated separately (§2.4).
  await supabase
    .from('study_plans')
    .delete()
    .eq('student_id', studentId)
    .eq('test_type', testType)
    .eq('status', 'draft');

  const { data: plan, error: planErr } = await supabase
    .from('study_plans')
    .insert({
      student_id: studentId,
      created_by: user.id,
      test_type: testType,
      goal_score: args.goalScore,
      starting_score: startingScore,
      test_date: args.testDate,
      status: 'draft',
      config: { weekly_hours: args.weeklyHours },
    })
    .select('id')
    .single();
  if (planErr || !plan) {
    return actionFail(`Could not create the plan: ${planErr?.message ?? 'unknown error'}`);
  }

  const taskRows = draft.tasks.map((t) => ({
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
    return actionFail(`Could not create the plan's tasks: ${taskErr.message}`);
  }

  return {
    ok: true,
    planId: plan.id,
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
