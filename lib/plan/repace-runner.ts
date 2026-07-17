// Re-pace orchestration, client-agnostic (§2.5). One implementation of
// "load the active plan → measure drift → regenerate → write the draft
// → maybe auto-apply", callable with either supabase client:
//
//   - proposeRepace (lib/plan/plan-actions.ts) passes the caller's
//     RLS-scoped client — the interactive path, authorization via RLS.
//   - the weekly cron (app/api/cron/repace/route.ts) passes the service
//     client — the scheduled path, iterating every active plan.
//
// Also home to writeDraftPlan, shared with generateStudyPlan, so the
// draft-replacement semantics live in exactly one place.

import { generatePlan, repacePlan } from './generate-plan';
import { mapSkillRow } from './plan-inputs';
import type {
  ExistingTask,
  PlanTaskDraft,
  PlanTaskSource,
  PlanTaskType,
  SkillState,
} from './generate-plan';
import type { PlanInputRow } from './plan-inputs';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';

// Both the RLS-scoped client and the service client satisfy this.
export type PlanDbClient = SupabaseClient<Database>;

export interface DraftTaskWrite {
  weekIndex: number;
  scheduledDate: string;
  taskType: PlanTaskType;
  payload: Record<string, unknown>;
  source: PlanTaskSource;
}

/**
 * Replace any prior draft for (student, test_type) and write a new one
 * plus its tasks. Shared by generateStudyPlan (§2.2) and the re-pace
 * paths (§2.5). The active plan (if any) is untouched — a draft is
 * reviewed and activated separately. With the RLS client, policies gate
 * every write; the cron's service client is the sanctioned system
 * context (see the route's audit log).
 *
 * createdBy is null for system-generated drafts (the weekly job) — the
 * student-facing "your plan was updated" note keys off that.
 */
export async function writeDraftPlan(
  supabase: PlanDbClient,
  meta: {
    studentId: string;
    createdBy: string | null;
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

function numFromJson(obj: unknown, key: string): number | null {
  if (obj && typeof obj === 'object' && typeof (obj as Record<string, unknown>)[key] === 'number') {
    return (obj as Record<string, number>)[key];
  }
  return null;
}

export interface RepaceRunArgs {
  studentId: string;
  testType: 'sat' | 'act';
  /** Recorded as the draft's author; null = the system (weekly job). */
  createdBy: string | null;
  /** Activate the re-paced draft immediately (self-serve students). */
  autoApply: boolean;
  /** ISO yyyy-mm-dd — injected for reproducibility. */
  today: string;
  driftThreshold?: number;
}

export interface RepaceRunResult {
  ok: boolean;
  repaced: boolean;
  reason: string;
  driftPoints: number | null;
  planId?: string;
  applied?: boolean;
  weeks?: number;
  taskCount?: number;
}

/**
 * Re-pace one student's active plan (§2.5): no-op success when there is
 * no active plan or no meaningful drift; otherwise writes the
 * regenerated draft (preserving tutor tasks) and, when autoApply is
 * set, activates it atomically via activate_study_plan.
 */
export async function runRepaceForStudent(
  supabase: PlanDbClient,
  args: RepaceRunArgs,
): Promise<RepaceRunResult> {
  const fail = (reason: string): RepaceRunResult => ({
    ok: false,
    repaced: false,
    reason,
    driftPoints: null,
  });
  const noop = (reason: string, driftPoints: number | null = null): RepaceRunResult => ({
    ok: true,
    repaced: false,
    reason,
    driftPoints,
  });

  // The active plan is what we re-pace against.
  const { data: active, error: activeErr } = await supabase
    .from('study_plans')
    .select('id, goal_score, starting_score, test_date, config, created_at')
    .eq('student_id', args.studentId)
    .eq('test_type', args.testType)
    .eq('status', 'active')
    .maybeSingle();
  if (activeErr) return fail(`Could not load the active plan: ${activeErr.message}`);
  if (!active) return noop('No active plan to re-pace.');
  if (!active.test_date || active.goal_score == null) {
    return noop('The active plan is missing a goal or test date.');
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
    p_student: args.studentId,
    p_test_type: args.testType,
  });
  if (inErr) return fail(`Could not load skill data: ${inErr.message}`);
  const skills: SkillState[] = ((inputRows ?? []) as PlanInputRow[]).map(mapSkillRow);

  const { data: band } = await supabase.rpc('get_predicted_score_band', {
    p_student: args.studentId,
    p_test_type: args.testType,
  });
  const currentScore = band?.[0]?.total_scaled ?? null;

  // Week-0 anchor: the earliest scheduled task, else the plan's creation date.
  const scheduledDates = existingTasks
    .map((t) => t.scheduledDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  const planStart = scheduledDates[0] ?? String(active.created_at).slice(0, 10);
  const weeklyHours = numFromJson(active.config, 'weekly_hours') ?? 5;

  const result = repacePlan({
    today: args.today,
    planStart,
    testDate: active.test_date,
    startingScore: active.starting_score,
    goalScore: active.goal_score,
    currentScore,
    weeklyHours,
    testType: args.testType,
    skills,
    existingTasks,
    driftThreshold: args.driftThreshold,
  });

  if (!result.shouldRepace || !result.tasks) {
    return noop(result.reason, result.driftPoints);
  }

  // Write the regenerated plan as a fresh draft (baseline = current score).
  const written = await writeDraftPlan(
    supabase,
    {
      studentId: args.studentId,
      createdBy: args.createdBy,
      testType: args.testType,
      goalScore: active.goal_score,
      startingScore: currentScore,
      testDate: active.test_date,
      weeklyHours,
    },
    result.tasks as PlanTaskDraft[],
  );
  if (!written.ok) return fail(`Could not write the re-paced plan: ${written.error}`);

  // Self-serve auto-apply activates the draft immediately; tutored
  // students leave it as a draft for review.
  let applied = false;
  if (args.autoApply) {
    const { error: actErr } = await supabase.rpc('activate_study_plan', {
      p_plan_id: written.planId,
    });
    if (actErr) {
      return fail(`Re-paced draft saved, but auto-apply failed: ${actErr.message}`);
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
