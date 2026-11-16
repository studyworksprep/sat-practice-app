'use server';

import { randomUUID } from 'node:crypto';
import { requireUser } from '@/lib/api/auth';
import { actionFail, ApiError } from '@/lib/api/response';
import {
  addDays, buildDrillPayload, buildLessonPayload, daysBetween,
  defaultUnitSteps, expandUnitSyllabus, teachingSteps,
} from './generate-plan';
import { planStartDate, record, taskScheduleOrder, taskSkill, taskUnitKey } from './customization';
import { applyPlanEdit, loadEditablePlan, loadEditableTasks, taskWrite } from './editor-state';
import { regenerateRemainingTasks } from './repace-runner';
import { UNIT_STEP_SELECT, buildSyllabi, loadTechniqueNameMap, type UnitStepRow } from './unit-steps';
import type { PlanTaskDraft, PlanTaskType } from './generate-plan';
import type { ActionResult } from '@/lib/types';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPES = new Set(['lesson', 'drill', 'review', 'practice_set', 'full_test', 'vocab', 'flashcards']);

async function requireEditor() {
  const ctx = await requireUser();
  if (ctx.profile.is_demo) throw new ApiError('Demo accounts are read-only', 403);
  return ctx;
}
function failure(err: unknown): ActionResult {
  if (err instanceof ApiError) return err.toActionResult();
  return actionFail(err instanceof Error ? err.message : 'Could not edit the plan.');
}
function checkId(id: string) {
  if (!UUID_RE.test(id)) throw new Error('Invalid plan or task.');
}
function checkWeek(week: number) {
  if (!Number.isInteger(week) || week < 0 || week > 51) throw new Error('Choose a valid week.');
}
async function taskContext(taskId: string) {
  checkId(taskId);
  const ctx = await requireEditor();
  const { data: task, error } = await ctx.supabase.from('plan_tasks')
    .select('id, plan_id, task_type, payload, status').eq('id', taskId).maybeSingle();
  if (error || !task) throw new Error('Task not found or not accessible.');
  const plan = await loadEditablePlan(ctx.supabase, task.plan_id);
  if (!plan) throw new Error('Plan not found or not accessible.');
  if (task.status !== 'pending') throw new Error('Only open tasks can be edited.');
  return { ...ctx, task, plan };
}
async function planContext(planId: string) {
  checkId(planId);
  const ctx = await requireEditor();
  const plan = await loadEditablePlan(ctx.supabase, planId);
  if (!plan) throw new Error('Plan not found or not accessible.');
  return { ...ctx, plan };
}
async function unitFor(db: Awaited<ReturnType<typeof requireEditor>>['supabase'], testType: string, domain: string, skill: string) {
  const { data, error } = await db.from('curriculum_units').select('id, title, expected_minutes')
    .eq('test_type', testType).eq('domain_code', domain).eq('skill_code', skill).maybeSingle();
  if (error || !data) throw new Error('Choose a skill in this curriculum.');
  return data;
}

export interface MoveTaskArgs { taskId: string; weekIndex: number }
export async function movePlanTask(args: MoveTaskArgs): Promise<ActionResult> {
  try {
    checkWeek(args.weekIndex);
    const { supabase, task, plan } = await taskContext(args.taskId);
    await applyPlanEdit(supabase, plan.id, { operation: 'move', task_ids: [task.id], week_index: args.weekIndex });
    return { ok: true };
  } catch (err) { return failure(err); }
}

export interface AddManualTaskArgs {
  planId: string; weekIndex: number; taskType: PlanTaskType;
  domainCode?: string; skillCode?: string; title?: string; why?: string;
  questionCount?: number;
}
export async function addManualPlanTask(args: AddManualTaskArgs): Promise<ActionResult> {
  try {
    checkWeek(args.weekIndex);
    if (!TYPES.has(args.taskType)) throw new Error('Choose a task type.');
    const { supabase, plan } = await planContext(args.planId);
    const title = (args.title ?? '').trim().slice(0, 120);
    const why = (args.why ?? '').trim().slice(0, 300) || 'Added by your tutor';
    let payload: Record<string, unknown>;
    if (['drill', 'lesson', 'practice_set'].includes(args.taskType)) {
      const domainCode = (args.domainCode ?? '').trim();
      const skillCode = (args.skillCode ?? '').trim();
      const unit = await unitFor(supabase, plan.test_type, domainCode, skillCode);
      const ref = { domainCode, skillCode, expectedMinutes: unit.expected_minutes };
      payload = args.taskType === 'lesson' ? buildLessonPayload(ref, why) : buildDrillPayload(ref, why);
      if (args.taskType !== 'lesson') {
        const count = args.questionCount ?? 8;
        if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error('Choose 1–50 questions.');
        payload.filter_criteria = { ...record(payload.filter_criteria), count };
      }
      if (args.taskType === 'practice_set') payload.title = `Practice set: ${unit.title}`;
      if (title) payload.title = title;
    } else {
      if (!title) throw new Error('A title is required.');
      payload = { title, why };

    }
    payload.standalone = true;
    const tasks = await loadEditableTasks(supabase, plan.id);
    payload.schedule_order = Math.max(0, ...tasks.map((t) => taskScheduleOrder(t.payload))) + 1;
    const anchor = planStartDate(plan.config, plan.created_at, tasks.map((t) => t.scheduled_date));
    const date = addDays(anchor, args.weekIndex * 7);
    if (plan.test_date && date > plan.test_date) throw new Error('Choose a week before the test date.');
    await applyPlanEdit(supabase, plan.id, {
      operation: 'add', restore_skills: args.skillCode ? [args.skillCode] : [],
      tasks: [{ week_index: args.weekIndex, scheduled_date: date, task_type: args.taskType, payload }],
    });
    return { ok: true };
  } catch (err) { return failure(err); }
}

export interface AddUnitSyllabusArgs { planId: string; weekIndex: number; domainCode: string; skillCode: string; why?: string }
export async function addUnitSyllabusToWeek(args: AddUnitSyllabusArgs): Promise<ActionResult> {
  try {
    checkWeek(args.weekIndex);
    const { supabase, plan } = await planContext(args.planId);
    const unit = await unitFor(supabase, plan.test_type, args.domainCode, args.skillCode);
    const [{ data: rows, error: stepError }, { data: done, error: doneError }, { data: tagged }, names, tasks] = await Promise.all([
      supabase.from('curriculum_unit_steps').select(UNIT_STEP_SELECT).eq('unit_id', unit.id).order('position'),
      supabase.from('lesson_progress').select('lesson_id').eq('student_id', plan.student_id).not('completed_at', 'is', null),
      supabase.from('lesson_topics').select('lesson_id, lessons!inner(status)').eq('skill_code', args.skillCode).eq('lessons.status', 'published').limit(1),
      loadTechniqueNameMap(supabase), loadEditableTasks(supabase, plan.id),
    ]);
    if (stepError || doneError) throw new Error('Could not load the unit syllabus.');
    const authored = buildSyllabi((rows ?? []) as unknown as UnitStepRow[], names)[args.skillCode];
    const fallback = defaultUnitSteps({
      domainCode: args.domainCode, skillCode: args.skillCode, expectedMinutes: unit.expected_minutes,
      section: 'math', mastery: null, attemptsCount: 0, coverageStatus: 'not_started',
      masteryThreshold: 80, learnability: null, sequence: 0, questionsAvailable: 1, hasLesson: Boolean(tagged?.length),
    });
    const steps = teachingSteps(authored?.length ? authored : fallback);
    if (!steps.some((s) => s.kind === 'drill' && s.role === 'mixed')) steps.push({ position: steps.length + 1, kind: 'drill', role: 'mixed' });
    const expanded = expandUnitSyllabus(
      { domainCode: args.domainCode, skillCode: args.skillCode, expectedMinutes: unit.expected_minutes }, steps,
      { completedLessonIds: (done ?? []).map((r) => r.lesson_id), why: (args.why ?? '').trim().slice(0, 300) || 'Added by your tutor' },
    );
    const key = `unit:${randomUUID()}`;
    const orderStart = Math.max(0, ...tasks.map((t) => taskScheduleOrder(t.payload))) + 1;
    const anchor = planStartDate(plan.config, plan.created_at, tasks.map((t) => t.scheduled_date));
    const start = addDays(anchor, args.weekIndex * 7);
    const availableDays = plan.test_date ? daysBetween(start, plan.test_date) : 6;
    if (availableDays < 0) throw new Error('Choose a week before the test date.');
    const additions: PlanTaskDraft[] = expanded.map((t, i) => ({
      ...t, weekIndex: args.weekIndex, scheduledDate: addDays(start, Math.min(i, 6, availableDays)), source: 'tutor',
      payload: { ...t.payload, schedule_order: orderStart + i, plan_unit_key: key, plan_unit_title: unit.title, editor_unit: true },
    }));
    await applyPlanEdit(supabase, plan.id, { operation: 'add', tasks: additions.map(taskWrite), restore_skills: [args.skillCode] });
    return { ok: true };
  } catch (err) { return failure(err); }
}

export async function removePlanTask(args: { taskId: string }): Promise<ActionResult> {
  try {
    const { supabase, plan, task } = await taskContext(args.taskId);
    await applyPlanEdit(supabase, plan.id, { operation: 'remove', task_ids: [task.id] });
    return { ok: true };
  } catch (err) { return failure(err); }
}
export interface SwapTaskSkillArgs { taskId: string; domainCode: string; skillCode: string }
export async function swapPlanTaskSkill(args: SwapTaskSkillArgs): Promise<ActionResult> {
  try {
    const { supabase, task, plan } = await taskContext(args.taskId);
    if (!['lesson', 'drill', 'practice_set'].includes(task.task_type)) throw new Error('This task does not target a skill.');
    const unit = await unitFor(supabase, plan.test_type, args.domainCode, args.skillCode);
    const ref = { domainCode: args.domainCode, skillCode: args.skillCode, expectedMinutes: unit.expected_minutes };
    const why = 'Selected by your tutor';
    const payload = { ...(task.task_type === 'lesson' ? buildLessonPayload(ref, why) : buildDrillPayload(ref, why)),
      standalone: true, schedule_order: taskScheduleOrder(task.payload) };
    await applyPlanEdit(supabase, plan.id, { operation: 'update', task_ids: [task.id], payload });
    return { ok: true };
  } catch (err) { return failure(err); }
}

export interface UnitEditArgs { planId: string; unitKey: string; weekIndex?: number }
async function editUnit(args: UnitEditArgs, operation: 'move' | 'remove'): Promise<ActionResult> {
  try {
    if (!args.unitKey || args.unitKey.length > 160) throw new Error('Choose a unit.');
    if (operation === 'move') checkWeek(args.weekIndex as number);
    const { supabase, plan } = await planContext(args.planId);
    const tasks = await loadEditableTasks(supabase, plan.id);
    const unit = tasks.filter((t) => taskUnitKey(t.task_type, t.payload) === args.unitKey && t.status === 'pending');
    if (!unit.length) throw new Error('This unit has no open tasks.');
    await applyPlanEdit(supabase, plan.id, {
      operation, whole_unit: true, task_ids: unit.map((t) => t.id), week_index: args.weekIndex,
      excluded_skills: operation === 'remove' ? [...new Set(unit.map((t) => taskSkill(t.payload)).filter(Boolean))] : [],
    });
    return { ok: true };
  } catch (err) { return failure(err); }
}
export async function movePlanUnit(args: UnitEditArgs): Promise<ActionResult> { return editUnit(args, 'move'); }
export async function removePlanUnit(args: UnitEditArgs): Promise<ActionResult> { return editUnit(args, 'remove'); }

export interface RegenerateWeekArgs { planId: string; weekIndex: number }
export async function regeneratePlanWeek(args: RegenerateWeekArgs): Promise<ActionResult> {
  try {
    checkWeek(args.weekIndex);
    const { supabase, plan } = await planContext(args.planId);
    const result = await regenerateRemainingTasks(supabase, {
      planId: plan.id, today: new Date().toISOString().slice(0, 10), weekIndex: args.weekIndex,
    });
    return result.ok ? { ok: true } : actionFail(result.error);
  } catch (err) { return failure(err); }
}
