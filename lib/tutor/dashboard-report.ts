// Lazy report resolution: no extra queries on the dashboard itself.
// The caller must verify the visible assignment/student membership first.
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';

type Assignment = Pick<Database['public']['Tables']['assignments_v2']['Row'],
  'id' | 'assignment_type' | 'test_type' | 'act_source_test' | 'practice_test_id'>;

export async function resolveDashboardReport(
  supabase: SupabaseClient<Database>, assignment: Assignment, studentId: string, completedAt?: string,
) {
  const assignmentHref = `/tutor/assignments/${assignment.id}`;
  const studentReport = `${assignmentHref}/students/${studentId}`;
  if (assignment.assignment_type === 'lesson') return studentReport;

  if (assignment.assignment_type === 'practice_test') {
    const isAct = assignment.test_type === 'act';
    const testId = isAct ? assignment.act_source_test : assignment.practice_test_id;
    if (!testId) return null;
    const testQuery = isAct
      ? supabase.from('act_practice_test_attempts').select('id').eq('source_test', testId)
      : supabase.from('practice_test_attempts_v2').select('id').eq('practice_test_id', testId);
    let query = testQuery
      .eq('user_id', studentId)
      .eq('status', 'completed');
    if (completedAt) query = query.lte('finished_at', completedAt);
    const { data, error } = await query.order('finished_at', { ascending: false }).limit(1).maybeSingle();
    if (error) throw error;
    return data ? `/tutor/students/${studentId}/tests/${data.id}/results` : null;
  }

  if (!['questions', 'lesson_pack'].includes(assignment.assignment_type)) return null;
  let query = supabase.from('practice_sessions')
    .select('id')
    .eq('user_id', studentId)
    .eq('test_type', assignment.test_type ?? 'sat')
    .eq('filter_criteria->>assignment_id', assignment.id)
    .eq('status', 'completed');
  if (completedAt) query = query.lte('created_at', completedAt);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (data) return `/tutor/sessions/${data.id}`;
  // The legacy per-student report can reconstruct SAT question attempts.
  // It cannot reconstruct ACT attempts, so show an honest fallback instead.
  return assignment.test_type === 'act' ? null : studentReport;
}
