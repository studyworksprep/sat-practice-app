// ACT totals and first-answer category accuracy are aggregated in Postgres.
// One RLS-scoped RPC replaces three count queries, a raw history download
// and a dependent question-metadata read. Tutor callers retain their
// existing access through the same attempts/question policies.
import { createClient } from '@/lib/supabase/server';
import { shapeActDashboardAggregate } from './dashboard-summary';
import type { ActDashboardAggregate, ActDashboardRpcRow } from './dashboard-summary';

export type { ActDashboardAggregate } from './dashboard-summary';

const PERFORMANCE_LOOKBACK_DAYS = 90;

export async function loadDashboardAggregateAct(userId: string): Promise<ActDashboardAggregate> {
  const supabase = await createClient();
  const nowMs = Date.now();
  const { data, error } = await supabase.rpc('get_act_student_dashboard_stats', {
    p_user_id: userId,
    p_week_ago: new Date(nowMs - 7 * 86_400_000).toISOString(),
    p_lookback_start: new Date(nowMs - PERFORMANCE_LOOKBACK_DAYS * 86_400_000).toISOString(),
  });
  if (error) throw error;
  return shapeActDashboardAggregate(data?.[0] as unknown as ActDashboardRpcRow | undefined);
}
