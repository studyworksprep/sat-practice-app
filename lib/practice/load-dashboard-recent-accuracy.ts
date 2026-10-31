import type { TypedSupabaseClient } from '@/lib/supabase/server';
import { accuracyKey } from './dashboard-summary';
import type { DashboardAccuracy } from './dashboard-summary';

export async function loadDashboardRecentAccuracy(
  supabase: TypedSupabaseClient,
  userId: string,
  sessionIds: string[],
  assignmentIds: string[],
): Promise<Map<string, DashboardAccuracy>> {
  const out = new Map<string, DashboardAccuracy>();
  if (!sessionIds.length && !assignmentIds.length) return out;
  const { data, error } = await supabase.rpc('get_dashboard_recent_accuracy', {
    p_user_id: userId, p_session_ids: sessionIds, p_assignment_ids: assignmentIds,
  });
  if (error) throw error;
  for (const row of data ?? []) {
    out.set(accuracyKey(row.kind, row.id), {
      attempted: Number(row.attempted), correct: Number(row.correct),
    });
  }
  return out;
}
