// Plan-editor Server Actions (§2.4). The tutor's editing verbs over a
// draft or active plan: move a task to another week, add a manual task,
// remove a pending task, swap the unit a task targets, and regenerate a
// single week from the student's current skill state.
//
// Authorization rides on RLS exactly like plan-actions.ts: study_plans /
// plan_tasks policies gate on can_view(student_id), so a tutor can edit a
// visible student's plan and a student their own — anyone else's write is
// rejected by the database (reads come back empty → "not found" here).
//
// Every human edit stamps plan_tasks.source so regeneration (§2.5) and
// week-regeneration below can preserve human judgment: 'tutor' when a
// staff member edits, 'student' when the plan's owner does.

'use server';

import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import {
  addDays,
  buildDrillPayload,
  buildLessonPayload,
  daysBetween,
  regenerateWeekTasks,
  survivesWeekRegeneration,
} from './generate-plan';
import { mapSkillRow } from './plan-inputs';
import type { ExistingTask, PlanTaskSource, PlanTaskType, SkillState } from './generate-plan';
import type { PlanInputRow } from './plan-inputs';
import type { ActionResult, Fail } from '@/lib/types';
import type { Json } from '@/lib/types/database';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_WEEK_INDEX = 51; // mirrors the generator's MAX_WEEKS - 1

// Task types a tutor can add by hand. full_test is deliberately included
// (extra mock before test day is a classic tutor call); review/vocab/
// flashcards resolve against the student's own queues at runtime.
const MANUAL_TASK_TYPES: ReadonlySet<string> = new Set([
  'lesson',
  'drill',
  'review',
  'practice_set',
  'full_test',
  'vocab',
  'flashcards',
]);

type SupabaseCtx = Awaited<ReturnType<typeof requireUser>>['supabase'];

interface PlanRow {
  id: string;
  student_id: string;
  test_type: 'sat' | 'act';
  status: string;
  goal_score: number | null;
  starting_score: number | null;
  test_date: string | null;
  config: unknown;
  created_at: string;
}

interface TaskRow {
  id: string;
  plan_id: string;
  week_index: number;
  scheduled_date: string | null;
  task_type: string;
  payload: unknown;
  source: string;
  status: string;
}

async function requireEditor() {
  const ctx = await requireUser();
  if (ctx.profile?.is_demo) throw new ApiError('Demo accounts are read-only', 403);
  return ctx;
}

function editErr(err: unknown): Fail {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail('Unexpected error') as Fail;
}

/** 'student' when the plan's owner edits their own plan, else 'tutor'. */
function sourceFor(userId: string, plan: PlanRow): PlanTaskSource {
  return userId === plan.student_id ? 'student' : 'tutor';
}

async function loadPlan(supabase: SupabaseCtx, planId: string): Promise<PlanRow | null> {
  const { data } = await supabase
    .from('study_plans')
    .select('id, student_id, test_type, status, goal_score, starting_score, test_date, config, created_at')
    .eq('id', planId)
    .in('status', ['draft', 'active'])
    .maybeSingle();
  return (data as PlanRow | null) ?? null;
}

async function loadTask(
  supabase: SupabaseCtx,
  taskId: string,
): Promise<{ task: TaskRow; plan: PlanRow } | null> {
  const { data } = await supabase
    .from('plan_tasks')
    .select('id, plan_id, week_index, scheduled_date, task_type, payload, source, status')
    .eq('id', taskId)
    .maybeSingle();
  if (!data) return null;
  const plan = await loadPlan(supabase, data.plan_id);
  if (!plan) return null;
  return { task: data as TaskRow, plan };
}

async function loadPlanTasks(supabase: SupabaseCtx, planId: string): Promise<TaskRow[]> {
  const { data } = await supabase
    .from('plan_tasks')
    .select('id, plan_id, week_index, scheduled_date, task_type, payload, source, status')
    .eq('plan_id', planId);
  return (data ?? []) as TaskRow[];
}

/** Week-0 anchor: the earliest scheduled task, else the plan's creation
 *  date — the same convention proposeRepace uses. */
function planAnchor(plan: PlanRow, tasks: readonly TaskRow[]): string {
  const dates = tasks
    .map((t) => t.scheduled_date)
    .filter((d): d is string => Boolean(d))
    .sort();
  return dates[0] ?? String(plan.created_at).slice(0, 10);
}

/** Clamp a date to the plan's test date (never schedule past test day). */
function clampToTest(date: string, plan: PlanRow): string {
  return plan.test_date && date > plan.test_date ? plan.test_date : date;
}

/** Look up a curriculum unit, validating the codes belong to the plan's
 *  test type. Returns null when the unit doesn't exist. */
async function loadUnit(
  supabase: SupabaseCtx,
  testType: string,
  domainCode: string,
  skillCode: string,
): Promise<{ expected_minutes: number; title: string } | null> {
  const { data } = await supabase
    .from('curriculum_units')
    .select('expected_minutes, title')
    .eq('test_type', testType)
    .eq('domain_code', domainCode)
    .eq('skill_code', skillCode)
    .maybeSingle();
  return data ?? null;
}

// ── Move a task to another week ───────────────────────────────────

export interface MoveTaskArgs {
  taskId: string;
  weekIndex: number;
}

export async function movePlanTask(args: MoveTaskArgs): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireEditor();
  } catch (err) {
    return editErr(err);
  }
  const { user, supabase } = ctx;

  if (!UUID_RE.test(args.taskId)) return actionFail('Invalid task.');
  if (!Number.isInteger(args.weekIndex) || args.weekIndex < 0 || args.weekIndex > MAX_WEEK_INDEX) {
    return actionFail('Invalid week.');
  }

  const found = await loadTask(supabase, args.taskId);
  if (!found) return actionFail('Task not found or not accessible.');
  const { task, plan } = found;
  if (task.status !== 'pending') return actionFail('Only open tasks can be moved.');
  if (task.week_index === args.weekIndex) return { ok: true };

  const tasks = await loadPlanTasks(supabase, plan.id);
  const anchor = planAnchor(plan, tasks);

  // Preserve the task's position within its week when it has one.
  const oldWeekStart = addDays(anchor, task.week_index * 7);
  const dayOffset = task.scheduled_date
    ? Math.min(6, Math.max(0, daysBetween(oldWeekStart, task.scheduled_date)))
    : 0;
  const newDate = clampToTest(addDays(anchor, args.weekIndex * 7 + dayOffset), plan);

  const { error } = await supabase
    .from('plan_tasks')
    .update({
      week_index: args.weekIndex,
      scheduled_date: newDate,
      source: sourceFor(user.id, plan),
    })
    .eq('id', task.id);
  if (error) return actionFail(error.message);
  return { ok: true };
}

// ── Add a manual task ─────────────────────────────────────────────

export interface AddManualTaskArgs {
  planId: string;
  weekIndex: number;
  taskType: PlanTaskType;
  /** Required for drill / lesson tasks; must name a curriculum unit. */
  domainCode?: string;
  skillCode?: string;
  /** Free-text title for tasks without a unit (and optional override). */
  title?: string;
  why?: string;
}

export async function addManualPlanTask(args: AddManualTaskArgs): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireEditor();
  } catch (err) {
    return editErr(err);
  }
  const { user, supabase } = ctx;

  if (!UUID_RE.test(args.planId)) return actionFail('Invalid plan.');
  if (!Number.isInteger(args.weekIndex) || args.weekIndex < 0 || args.weekIndex > MAX_WEEK_INDEX) {
    return actionFail('Invalid week.');
  }
  if (!MANUAL_TASK_TYPES.has(args.taskType)) return actionFail('Invalid task type.');

  const plan = await loadPlan(supabase, args.planId);
  if (!plan) return actionFail('Plan not found or not accessible.');

  const why = (args.why ?? '').trim().slice(0, 300) || 'Added by your tutor';
  const title = (args.title ?? '').trim().slice(0, 120);

  let payload: Record<string, unknown>;
  if (args.taskType === 'drill' || args.taskType === 'lesson') {
    const domainCode = (args.domainCode ?? '').trim();
    const skillCode = (args.skillCode ?? '').trim();
    if (!domainCode || !skillCode) return actionFail('Pick a skill for this task.');
    const unit = await loadUnit(supabase, plan.test_type, domainCode, skillCode);
    if (!unit) return actionFail('That skill is not in the curriculum.');
    const ref = { domainCode, skillCode, expectedMinutes: unit.expected_minutes };
    payload = args.taskType === 'drill' ? buildDrillPayload(ref, why) : buildLessonPayload(ref, why);
    if (title) payload.title = title;
  } else {
    if (!title) return actionFail('A title is required.');
    payload = { title, why };
  }

  const tasks = await loadPlanTasks(supabase, plan.id);
  const anchor = planAnchor(plan, tasks);
  const scheduledDate = clampToTest(addDays(anchor, args.weekIndex * 7), plan);

  const { error } = await supabase.from('plan_tasks').insert({
    plan_id: plan.id,
    week_index: args.weekIndex,
    scheduled_date: scheduledDate,
    task_type: args.taskType,
    payload: payload as unknown as Json,
    status: 'pending',
    source: sourceFor(user.id, plan),
  });
  if (error) return actionFail(error.message);
  return { ok: true };
}

// ── Remove a pending task ─────────────────────────────────────────

export async function removePlanTask(args: { taskId: string }): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireEditor();
  } catch (err) {
    return editErr(err);
  }
  const { supabase } = ctx;

  if (!UUID_RE.test(args.taskId)) return actionFail('Invalid task.');
  const found = await loadTask(supabase, args.taskId);
  if (!found) return actionFail('Task not found or not accessible.');
  // Completed/skipped rows are the student's history — never deleted.
  if (found.task.status !== 'pending') return actionFail('Only open tasks can be removed.');

  const { error } = await supabase.from('plan_tasks').delete().eq('id', found.task.id);
  if (error) return actionFail(error.message);
  return { ok: true };
}

// ── Swap the unit a drill / lesson targets ────────────────────────

export interface SwapTaskSkillArgs {
  taskId: string;
  domainCode: string;
  skillCode: string;
}

export async function swapPlanTaskSkill(args: SwapTaskSkillArgs): Promise<ActionResult> {
  let ctx;
  try {
    ctx = await requireEditor();
  } catch (err) {
    return editErr(err);
  }
  const { user, supabase } = ctx;

  if (!UUID_RE.test(args.taskId)) return actionFail('Invalid task.');
  const found = await loadTask(supabase, args.taskId);
  if (!found) return actionFail('Task not found or not accessible.');
  const { task, plan } = found;
  if (task.status !== 'pending') return actionFail('Only open tasks can be changed.');
  if (task.task_type !== 'drill' && task.task_type !== 'lesson') {
    return actionFail('Only drill and lesson tasks target a skill.');
  }

  const domainCode = args.domainCode.trim();
  const skillCode = args.skillCode.trim();
  const unit = await loadUnit(supabase, plan.test_type, domainCode, skillCode);
  if (!unit) return actionFail('That skill is not in the curriculum.');

  const why = `Swapped in by ${user.id === plan.student_id ? 'you' : 'your tutor'}`;
  const ref = { domainCode, skillCode, expectedMinutes: unit.expected_minutes };
  const payload =
    task.task_type === 'drill' ? buildDrillPayload(ref, why) : buildLessonPayload(ref, why);

  const { error } = await supabase
    .from('plan_tasks')
    .update({ payload: payload as unknown as Json, source: sourceFor(user.id, plan) })
    .eq('id', task.id);
  if (error) return actionFail(error.message);
  return { ok: true };
}

// ── Regenerate one week ───────────────────────────────────────────

export interface RegenerateWeekArgs {
  planId: string;
  weekIndex: number;
}

type RegenerateWeekActionResult = ActionResult<{ replaced: number; added: number }>;

export async function regeneratePlanWeek(
  args: RegenerateWeekArgs,
): Promise<RegenerateWeekActionResult> {
  let ctx;
  try {
    ctx = await requireEditor();
  } catch (err) {
    return editErr(err);
  }
  const { supabase } = ctx;

  if (!UUID_RE.test(args.planId)) return actionFail('Invalid plan.');
  if (!Number.isInteger(args.weekIndex) || args.weekIndex < 0 || args.weekIndex > MAX_WEEK_INDEX) {
    return actionFail('Invalid week.');
  }

  const plan = await loadPlan(supabase, args.planId);
  if (!plan) return actionFail('Plan not found or not accessible.');
  if (plan.goal_score == null || !plan.test_date) {
    return actionFail('The plan is missing a goal or test date.');
  }

  const { data: inputRows, error: inErr } = await supabase.rpc('get_plan_inputs', {
    p_student: plan.student_id,
    p_test_type: plan.test_type,
  });
  if (inErr) return actionFail(`Could not load skill data: ${inErr.message}`);
  const skills: SkillState[] = ((inputRows ?? []) as PlanInputRow[]).map(mapSkillRow);

  const tasks = await loadPlanTasks(supabase, plan.id);
  const anchor = planAnchor(plan, tasks);
  const existingTasks: ExistingTask[] = tasks.map((t) => ({
    weekIndex: t.week_index,
    scheduledDate: t.scheduled_date,
    taskType: t.task_type as PlanTaskType,
    payload: (t.payload ?? {}) as Record<string, unknown>,
    source: (t.source ?? 'generated') as PlanTaskSource,
    status: (t.status ?? 'pending') as 'pending' | 'completed' | 'skipped',
  }));

  const config = plan.config as Record<string, unknown> | null;
  const weeklyHours =
    typeof config?.weekly_hours === 'number' ? (config.weekly_hours as number) : 5;

  const fresh = regenerateWeekTasks({
    weekIndex: args.weekIndex,
    planStart: anchor,
    testDate: plan.test_date,
    goalScore: plan.goal_score,
    startingScore: plan.starting_score,
    weeklyHours,
    testType: plan.test_type,
    skills,
    existingTasks,
  });

  // Replace the week's still-pending generated tasks. Delete first, then
  // insert; a failure between the two leaves a thinner week (recoverable
  // by regenerating again) rather than duplicate tasks.
  const replaceIds = tasks
    .filter(
      (t) =>
        t.week_index === args.weekIndex &&
        !survivesWeekRegeneration({
          weekIndex: t.week_index,
          scheduledDate: t.scheduled_date,
          taskType: t.task_type as PlanTaskType,
          payload: (t.payload ?? {}) as Record<string, unknown>,
          source: (t.source ?? 'generated') as PlanTaskSource,
          status: (t.status ?? 'pending') as 'pending' | 'completed' | 'skipped',
        }),
    )
    .map((t) => t.id);

  if (replaceIds.length > 0) {
    const { error: delErr } = await supabase.from('plan_tasks').delete().in('id', replaceIds);
    if (delErr) return actionFail(delErr.message);
  }
  if (fresh.length > 0) {
    const { error: insErr } = await supabase.from('plan_tasks').insert(
      fresh.map((t) => ({
        plan_id: plan.id,
        week_index: t.weekIndex,
        scheduled_date: clampToTest(t.scheduledDate, plan),
        task_type: t.taskType,
        payload: t.payload as unknown as Json,
        status: 'pending',
        source: 'generated',
      })),
    );
    if (insErr) return actionFail(insErr.message);
  }

  return { ok: true, replaced: replaceIds.length, added: fresh.length };
}
