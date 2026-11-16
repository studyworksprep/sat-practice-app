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

import { composePhases, daysBetween, generatePlan, repacePlan } from './generate-plan';
import { applyEvidencePriors, mapSkillRow, planCompositionFromRow } from './plan-inputs';
import { loadSyllabusInputs } from './unit-steps';
import { asExistingTask, editorConfig, filterCustomizedTasks, planStartDate, stampGeneratedTasks } from './customization';
import { applyPlanEdit, loadEditablePlan, loadEditableTasks, taskWrite } from './editor-state';
import type {
  ExistingTask,
  PlanMode,
  PlanPhase,
  PlanTaskSource,
  PlanTaskType,
  SkillState,
} from './generate-plan';
import type { PlanComposition } from './plan-inputs';
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
 * Rebuild a draft in place, or copy the active plan into a review draft,
 * preserving human edits and history. Shared by generation and re-pace
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
    /** Composition (§5): how the plan was built and the intake answers
     *  behind it. Optional so pre-phase callers keep working. */
    mode?: PlanMode | null;
    prepLevel?: string | null;
    intent?: string | null;
    rationale?: string | null;
    phases?: PlanPhase[] | null;
    composition?: Partial<Omit<PlanComposition, 'mode'>> | null;
    sourcePlanId?: string | null;
    expectedUpdatedAt?: string | null;
    empty?: boolean;
    editor?: Json;
  },
  tasks: DraftTaskWrite[],
): Promise<{ ok: true; planId: string } | { ok: false; error: string }> {
  const { data, error } = await supabase.rpc('write_study_plan_draft', {
    p_meta: {
      student_id: meta.studentId, created_by: meta.createdBy, test_type: meta.testType,
      goal_score: meta.goalScore, starting_score: meta.startingScore, test_date: meta.testDate,
      mode: meta.mode ?? null, prep_level: meta.prepLevel ?? null, intent: meta.intent ?? null,
      rationale: meta.rationale ?? null,
      phases: (meta.phases ?? []).map((p) => ({ type: p.type, start_week: p.startWeek, end_week: p.endWeek, summary: p.summary })),
      today: new Date().toISOString().slice(0, 10),
      config: {
        ...(meta.editor ? { editor: meta.editor } : {}),
        weekly_hours: meta.weeklyHours, study_days: meta.composition?.studyDays ?? null,
        targets: meta.composition?.targets ?? null, full_tests: meta.composition?.fullTests ?? true,
        evidence: { self_rating: meta.composition?.selfRating ?? null },
      },
    } as unknown as Json,
    p_tasks: tasks.map(taskWrite) as unknown as Json,
    p_source_plan_id: meta.sourcePlanId ?? undefined,
    p_empty: meta.empty ?? false,
    p_expected_updated_at: meta.expectedUpdatedAt ?? undefined,
  });
  if (error || !data) return { ok: false, error: error?.message ?? 'Could not save the draft.' };
  return { ok: true, planId: data };
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
    .select('id, goal_score, starting_score, test_date, config, created_at, updated_at, mode, prep_level, intent')
    .eq('student_id', args.studentId)
    .eq('test_type', args.testType)
    .eq('status', 'active')
    .maybeSingle();
  if (activeErr) return fail(`Could not load the active plan: ${activeErr.message}`);
  if (!active) return noop('No active plan to re-pace.');
  if (editorConfig(active.config).manual) return noop('This plan is built by the tutor.');
  const { data: waiting, error: draftError } = await supabase.from('study_plans').select('id')
    .eq('student_id', args.studentId).eq('test_type', args.testType).eq('status', 'draft').limit(1);
  if (waiting?.length) return noop('A draft is already waiting for review.');
  if (draftError) return fail(`Could not check for a review draft: ${draftError.message}`);
  if (!active.test_date || active.goal_score == null) {
    return noop('The active plan is missing a goal or test date.');
  }

  // Its tasks — needed to preserve the tutor's manual edits.
  const { data: taskRows, error: taskError } = await supabase
    .from('plan_tasks')
    .select('week_index, scheduled_date, task_type, payload, source, status')
    .eq('plan_id', active.id);
  if (taskError) return fail(`Could not load the existing schedule: ${taskError.message}`);
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
  const composition = planCompositionFromRow(active);
  const skills: SkillState[] = applyEvidencePriors(
    ((inputRows ?? []) as PlanInputRow[]).map(mapSkillRow),
    composition,
  );

  const [{ data: band }, syllabus] = await Promise.all([
    supabase.rpc('get_predicted_score_band', {
      p_student: args.studentId,
      p_test_type: args.testType,
    }),
    // Unit syllabi (flag `unit_syllabus`): null → pre-syllabus generator.
    loadSyllabusInputs(supabase, args.studentId, args.testType),
  ]);
  const currentScore = band?.[0]?.total_scaled ?? null;

  // Week-0 anchor: the earliest scheduled task, else the plan's creation date.
  const scheduledDates = existingTasks
    .map((t) => t.scheduledDate)
    .filter((d): d is string => Boolean(d))
    .sort();
  const planStart = planStartDate(active.config, active.created_at, scheduledDates);
  const weeklyHours = numFromJson(active.config, 'weekly_hours') ?? 5;

  const result = repacePlan({
    config: active.config,
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
    mode: composition.mode ?? undefined,
    studyDays: composition.studyDays,
    targets: composition.targets,
    fullTests: composition.fullTests,
    unitSteps: syllabus?.unitSteps ?? null,
    sectionSteps: syllabus?.sectionSteps ?? null,
    completedLessonIds: syllabus?.completedLessonIds ?? null,
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
      mode: result.mode ?? composition.mode,
      prepLevel: active.prep_level,
      intent: active.intent,
      rationale: result.rationale,
      phases: composePhases(result.mode ?? composition.mode ?? 'targeted',
        Math.max(0, Math.floor(daysBetween(planStart, args.today) / 7)) + (result.weeks ?? 0), composition.fullTests),
      composition,
      sourcePlanId: active.id,
      expectedUpdatedAt: active.updated_at,
    },
    filterCustomizedTasks(stampGeneratedTasks(result.tasks.filter((t) => t.source === 'generated')
      .map((t) => ({ ...t, weekIndex: Math.max(0, Math.floor(daysBetween(planStart, t.scheduledDate) / 7)) }))), active.config, existingTasks),
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

// ── Regenerate the remaining weeks IN PLACE (plan hub §6.2) ────────
//
// The hub's "adjust" (hours, days, date, target) and "rebuild" verbs
// need the plan to change without becoming a different plan: completed
// tasks stay as the record, human-authored tasks stay, the plan id
// stays. So instead of writing a draft and activating it (which archives
// the old plan), this replaces only the still-pending GENERATED tasks
// from today onward with a fresh composition from the student's current
// evidence, laid over the plan's original grid so phases hold their
// place. Callers update goal/date/config on the plan row first.

export interface RegenerateRemainingArgs {
  planId: string;
  /** ISO yyyy-mm-dd — injected for reproducibility. */
  today: string;
  weekIndex?: number;
}

export async function regenerateRemainingTasks(
  supabase: PlanDbClient,
  args: RegenerateRemainingArgs,
): Promise<{ ok: true; taskCount: number; weeks: number } | { ok: false; error: string }> {
  try {
    const plan = await loadEditablePlan(supabase, args.planId);
    if (!plan) return { ok: false, error: 'Plan not found or not accessible.' };
    if (!plan.test_date || plan.goal_score == null) return { ok: false, error: 'Set a goal and test date first.' };
    const tasks = await loadEditableTasks(supabase, plan.id);
    const anchor = planStartDate(plan.config, plan.created_at, tasks.map((t) => t.scheduled_date));
    const isWeek = args.weekIndex != null;
    const generationStart = isWeek ? anchor : args.today;
    if (daysBetween(generationStart, plan.test_date) <= 0) return { ok: false, error: 'The test date has passed — set a new date first.' };
    const elapsed = isWeek ? 0 : Math.max(0, Math.floor(daysBetween(anchor, args.today) / 7));
    if (editorConfig(plan.config).manual) return { ok: true, taskCount: tasks.length, weeks: Math.max(1, Math.ceil(daysBetween(anchor, plan.test_date) / 7)) };
    const [{ data: rows, error }, syllabus] = await Promise.all([
      supabase.rpc('get_plan_inputs', { p_student: plan.student_id, p_test_type: plan.test_type }),
      loadSyllabusInputs(supabase, plan.student_id, plan.test_type as 'sat' | 'act'),
    ]);
    if (error) return { ok: false, error: `Could not load skill data: ${error.message}` };
    const composition = planCompositionFromRow(plan);
    const excluded = new Set(editorConfig(plan.config).excludedSkills);
    const skills = applyEvidencePriors((rows ?? []).map(mapSkillRow), composition).filter((s) => !excluded.has(s.skillCode));
    const draft = generatePlan({
      goalScore: plan.goal_score, startingScore: plan.starting_score, testDate: plan.test_date,
      today: generationStart, weeklyHours: numFromJson(plan.config, 'weekly_hours') ?? 5,
      testType: plan.test_type as 'sat' | 'act', skills,
      mode: composition.mode ?? undefined, studyDays: composition.studyDays,
      targets: composition.targets, fullTests: composition.fullTests,
      unitSteps: syllabus?.unitSteps, sectionSteps: syllabus?.sectionSteps,
      completedLessonIds: syllabus?.completedLessonIds, elapsedWeeks: elapsed,
    });
    const mapped = stampGeneratedTasks(draft.tasks.map((t) => ({ ...t, weekIndex: t.weekIndex + elapsed })));
    const fresh = filterCustomizedTasks(mapped, plan.config, tasks.map(asExistingTask))
      .filter((t) => !isWeek || t.weekIndex === args.weekIndex);
    const count = await applyPlanEdit(supabase, plan.id, {
      operation: 'replace', expected_updated_at: plan.updated_at,
      ...(isWeek ? { week_index: args.weekIndex } : { from_date: args.today }),
      tasks: fresh.map(taskWrite),
    });
    if (!isWeek) {
      const { error: summaryError } = await supabase.from('study_plans').update({
        phases: composePhases(draft.mode, elapsed + draft.weeks, composition.fullTests)
          .map((p) => ({ type: p.type, start_week: p.startWeek, end_week: p.endWeek, summary: p.summary })),
        rationale: draft.rationale,
      }).eq('id', plan.id);
      if (summaryError) return { ok: false, error: 'The schedule was updated, but its summary could not be saved. Please rebuild again.' };
    }
    return { ok: true, taskCount: count, weeks: draft.weeks };
  } catch (err) { return { ok: false, error: err instanceof Error ? err.message : 'Could not rebuild the plan.' }; }
}
