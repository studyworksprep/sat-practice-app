import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/lib/types/database';
import { asExistingTask, record } from './customization';
import type { PlanTaskDraft } from './generate-plan';

export type PlanClient = SupabaseClient<Database>;
export const EDITABLE_PLAN_SELECT = 'id, student_id, test_type, status, goal_score, starting_score, test_date, config, created_at, updated_at, mode, prep_level, intent';
export const EDITABLE_TASK_SELECT = 'id, plan_id, week_index, scheduled_date, task_type, payload, source, status';

export async function loadEditablePlan(db: PlanClient, planId: string) {
  const { data, error } = await db.from('study_plans').select(EDITABLE_PLAN_SELECT)
    .eq('id', planId).in('status', ['draft', 'active']).maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

export async function loadEditableTasks(db: PlanClient, planId: string) {
  const { data, error } = await db.from('plan_tasks').select(EDITABLE_TASK_SELECT)
    .eq('plan_id', planId).order('scheduled_date').order('created_at').order('id');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function loadPlanForGeneration(db: PlanClient, studentId: string, testType: string) {
  const { data, error } = await db.from('study_plans').select(EDITABLE_PLAN_SELECT)
    .eq('student_id', studentId).eq('test_type', testType).in('status', ['draft', 'active'])
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  const plan = data?.find((p) => p.status === 'draft') ?? data?.find((p) => p.status === 'active') ?? null;
  const tasks = plan ? await loadEditableTasks(db, plan.id) : [];
  return { plan, tasks, existing: tasks.map(asExistingTask) };
}

export function taskWrite(t: PlanTaskDraft) {
  return { week_index: t.weekIndex, scheduled_date: t.scheduledDate, task_type: t.taskType, payload: t.payload };
}

export async function applyPlanEdit(db: PlanClient, planId: string, edit: Record<string, unknown>) {
  const { data, error } = await db.rpc('edit_study_plan', { p_plan_id: planId, p_edit: edit as Json });
  if (error) throw new Error(error.message);
  return data ?? 0;
}

export function weeklyHours(config: unknown): number {
  const h = record(config).weekly_hours;
  return typeof h === 'number' ? h : 5;
}
