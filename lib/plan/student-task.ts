import type { TypedSupabaseClient } from '@/lib/supabase/server';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parsePlanTaskId(value: unknown): string | null {
  return typeof value === 'string' && UUID_RE.test(value) ? value : null;
}

export async function loadPlanTestTask(supabase: TypedSupabaseClient, userId: string, taskId: string) {
  const { data: task } = await supabase
    .from('plan_tasks')
    .select('payload, study_plans!inner(student_id, status, test_type)')
    .eq('id', taskId)
    .eq('task_type', 'full_test')
    .eq('status', 'pending')
    .eq('study_plans.student_id', userId)
    .eq('study_plans.status', 'active')
    .eq('study_plans.test_type', 'sat')
    .maybeSingle();
  const payload = task?.payload as Record<string, unknown> | null;
  if (!task || typeof payload?.assignment_id === 'string') return null;
  return { practiceTestId: parsePlanTaskId(payload?.practice_test_id) };
}

export function openPlanPractice(supabase: TypedSupabaseClient, userId: string, nowIso: string) {
  return supabase
    .from('practice_sessions')
    .select('id, plan_task_id, current_position')
    .eq('user_id', userId)
    .eq('test_type', 'sat')
    .eq('status', 'in_progress')
    .gt('expires_at', nowIso)
    .not('plan_task_id', 'is', null)
    .order('last_activity_at', { ascending: false })
    .order('id');
}

export function openPlanTests(supabase: TypedSupabaseClient, userId: string) {
  return supabase
    .from('practice_test_attempts_v2')
    .select('id, plan_task_id')
    .eq('user_id', userId)
    .eq('status', 'in_progress')
    .is('sections_only', null)
    .not('plan_task_id', 'is', null)
    .order('started_at', { ascending: false })
    .order('id');
}

export async function loadPlanTaskResumes(
  supabase: TypedSupabaseClient, userId: string, nowIso: string,
): Promise<Map<string, string>> {
  const [{ data: sessions }, { data: tests }] = await Promise.all([
    openPlanPractice(supabase, userId, nowIso),
    openPlanTests(supabase, userId),
  ]);
  const resumes = new Map<string, string>();
  for (const session of sessions ?? []) {
    if (session.plan_task_id && !resumes.has(session.plan_task_id)) {
      resumes.set(session.plan_task_id, `/practice/s/${session.id}/${session.current_position}`);
    }
  }
  for (const test of tests ?? []) {
    if (test.plan_task_id && !resumes.has(test.plan_task_id)) {
      resumes.set(test.plan_task_id, `/practice/test/attempt/${test.id}`);
    }
  }
  return resumes;
}
