import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { actFormName } from '@/lib/practice/act-form-names';
import { buildDashboardActivity, sessionAssignmentId } from './dashboard-activity';
import type { ActivityCompletion } from './dashboard-activity';

// Limit each indexed source, then merge. This feed deliberately has no
// whole-roster accuracy aggregates or unbounded attempt-history reads.
const LIMIT = 20;
export async function loadDashboardActivity(supabase: TypedSupabaseClient, studentIds: string[], now = new Date()) {
  if (!studentIds.length) return [];
  const since = new Date(now.getTime() - 14 * 86400000).toISOString();
  const [sessionResult, completionResult, satResult, actResult] = await Promise.all([
    supabase.from('practice_sessions')
      .select('id,user_id,test_type,status,last_activity_at,question_ids,filter_criteria')
      .in('user_id', studentIds).in('test_type', ['sat', 'act']).in('mode', ['practice', 'review'])
      .in('status', ['in_progress', 'completed']).gte('last_activity_at', since)
      .order('last_activity_at', { ascending: false }).limit(LIMIT),
    supabase.from('assignment_students_v2')
      .select('student_id,completed_at,assignment:assignments_v2!inner(id,title,assignment_type,archived_at,deleted_at)')
      .in('student_id', studentIds).gte('completed_at', since)
      .is('assignment.archived_at', null).is('assignment.deleted_at', null)
      .order('completed_at', { ascending: false }).limit(LIMIT),
    supabase.from('practice_test_attempts_v2')
      .select('id,user_id,finished_at,composite_score,rw_scaled,math_scaled,test:practice_tests_v2(name)')
      .in('user_id', studentIds).eq('status', 'completed').gte('finished_at', since)
      .order('finished_at', { ascending: false }).limit(LIMIT),
    supabase.from('act_practice_test_attempts')
      .select('id,user_id,finished_at,source_test,composite_score,english_scaled,math_scaled,reading_scaled,science_scaled')
      .in('user_id', studentIds).eq('status', 'completed').gte('finished_at', since)
      .order('finished_at', { ascending: false }).limit(LIMIT),
  ]);
  for (const result of [sessionResult, completionResult, satResult, actResult]) {
    if (result.error) throw result.error;
  }
  const sessions = sessionResult.data ?? [];
  const assignmentIds = [...new Set(sessions.map(sessionAssignmentId).filter((id): id is string => Boolean(id)))];
  const assignmentResult = assignmentIds.length ? await supabase.from('assignments_v2')
    .select('id,title,assignment_type').in('id', assignmentIds).is('archived_at', null).is('deleted_at', null)
    : { data: [], error: null };
  if (assignmentResult.error) throw assignmentResult.error;
  return buildDashboardActivity({ studentIds, sessions, since,
    completions: (completionResult.data ?? []) as ActivityCompletion[],
    assignments: assignmentResult.data ?? [],
    tests: [
      ...(satResult.data ?? []).map(test => ({ ...test, testType: 'sat' as const, testName: test.test?.name ?? 'SAT practice test' })),
      ...(actResult.data ?? []).map(test => ({ ...test, testType: 'act' as const, testName: actFormName(test.source_test) })),
    ],
  });
}
