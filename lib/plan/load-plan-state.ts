// One home for "load this student's plan(s) + tasks + adherence".
// The tutor plan page and the session workspace (§4.1) both need the
// same RLS-scoped study_plans → plan_tasks read before calling the
// pure computeAdherence; extracting it keeps the loaders from
// drifting the way the roster/plan-page copies were starting to.
// (The roster keeps its own bulk query — one embed for the whole
// roster beats N single-student loads.)

import { computeAdherence, type AdherenceSummary } from './adherence';
import type { TypedSupabaseClient } from '@/lib/supabase/server';

export interface PlanTaskRow {
  id: string;
  plan_id: string;
  week_index: number;
  scheduled_date: string | null;
  task_type: string;
  payload: unknown;
  source: string;
  status: string;
}

export interface PlanRow {
  id: string;
  status: string;
  goal_score: number | null;
  starting_score: number | null;
  test_date: string | null;
  config: unknown;
  created_at: string;
}

export interface StudentPlanState {
  draft: PlanRow | null;
  active: PlanRow | null;
  tasksByPlan: Map<string, PlanTaskRow[]>;
  /** Adherence of the ACTIVE plan; null when there is none. */
  adherence: AdherenceSummary | null;
}

export async function loadStudentPlanState(
  supabase: TypedSupabaseClient,
  studentId: string,
  today: string,
  testType: 'sat' | 'act' = 'sat',
): Promise<StudentPlanState> {
  const { data: plans } = await supabase
    .from('study_plans')
    .select('id, status, goal_score, starting_score, test_date, config, created_at')
    .eq('student_id', studentId)
    .eq('test_type', testType)
    .in('status', ['draft', 'active'])
    .order('created_at', { ascending: false });

  const draft = (plans ?? []).find((p) => p.status === 'draft') ?? null;
  const active = (plans ?? []).find((p) => p.status === 'active') ?? null;

  const planIds = [draft?.id, active?.id].filter((v): v is string => Boolean(v));
  const tasksByPlan = new Map<string, PlanTaskRow[]>();
  if (planIds.length) {
    const { data: taskRows } = await supabase
      .from('plan_tasks')
      .select('id, plan_id, week_index, scheduled_date, task_type, payload, source, status')
      .in('plan_id', planIds)
      .order('scheduled_date', { ascending: true });
    for (const t of (taskRows ?? []) as PlanTaskRow[]) {
      if (!tasksByPlan.has(t.plan_id)) tasksByPlan.set(t.plan_id, []);
      tasksByPlan.get(t.plan_id)!.push(t);
    }
  }

  const adherence = active
    ? computeAdherence(
        (tasksByPlan.get(active.id) ?? []).map((t) => ({
          scheduledDate: t.scheduled_date,
          status: t.status as 'pending' | 'completed' | 'skipped',
        })),
        today,
      )
    : null;

  return { draft, active, tasksByPlan, adherence };
}
