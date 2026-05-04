// Tutor-dashboard data load: student_practice_stats view + recent
// practice-test attempts + 8-week cohort weekly trend RPC.
//
// We previously wrapped this whole thing in unstable_cache with a
// 60-second TTL. That turned out to be unsafe: in some Next 16
// invocation paths (background revalidation, prefetch, etc.) the
// closure runs after the originating request scope has already
// been torn down. The supabase client captured outside the cache
// still holds a reference to a `cookieStore` from `await cookies()`,
// but that object is request-scoped — the next call returns no
// cookies, so Supabase sends the query without an auth header,
// RLS on student_practice_stats denies (the view filters by
// auth.uid() via can_view), the view returns [] for the tutor's
// roster, and that empty result gets stored in the cache for the
// next 60 seconds. The user sees "you don't have any students"
// until the TTL elapses.
//
// Repro path the user reported: tutor dashboard → student profile
// → back to tutor dashboard → empty roster.
//
// Fix: load the queries inline on every render. They're three
// parallel reads gated by RLS, ~200–400 ms total in production —
// cheaper than the prior cache-miss path used to be when it had to
// chunk and reaggregate. Re-add caching here only if a profile
// shows it's actually expensive, and use a request-scoped strategy
// (React.cache) rather than the cross-request unstable_cache.
//
// See docs/architecture-plan.md §3.6.

import { createClient } from '@/lib/supabase/server';

const SPARK_WEEKS = 8;
const RECENT_TEST_LIMIT = 10;

export interface TutorDashboardData {
  rawStudents: Array<RawStudentRow>;
  recentTestAttempts: Array<RecentTestAttempt>;
  trendRows: Array<TrendRow>;
}

interface RawStudentRow {
  user_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  target_sat_score: number | null;
  high_school: string | null;
  graduation_year: number | null;
  sat_test_date: string | null;
  total_attempts: number | string | null;
  correct_attempts: number | string | null;
  week_attempts: number | string | null;
  last_activity_at: string | null;
}

interface RecentTestAttempt {
  id: string;
  user_id: string;
  status: string;
  finished_at: string | null;
  started_at: string | null;
  composite_score: number | null;
  rw_scaled: number | null;
  math_scaled: number | null;
  practice_test: { name: string | null; code: string | null } | null;
}

interface TrendRow {
  start_iso: string;
  end_iso: string;
  attempts: number | string | null;
  correct: number | string | null;
  accuracy: number | string | null;
}

/** Load the tutor-dashboard payload for the given tutor. RLS on the
 *  underlying tables (student_practice_stats view +
 *  practice_test_attempts_v2 + the trend RPC) applies as the calling
 *  user, so a forged tutorId can't widen visibility. */
export async function loadTutorDashboard(tutorId: string): Promise<TutorDashboardData> {
  const supabase = await createClient();

  const { data: rows } = await supabase
    .from('student_practice_stats')
    .select('*')
    .order('last_activity_at', { ascending: false, nullsFirst: false });

  const rawStudents: RawStudentRow[] = (rows as RawStudentRow[] | null) ?? [];

  // Roster ids drive the recent-tests filter and the trend RPC.
  // Empty roster short-circuits both: pass a single bogus uuid for
  // the tests query (returns nothing cleanly) and skip the RPC.
  const rosterIds = rawStudents.length > 0
    ? rawStudents.map((r) => r.user_id)
    : ['00000000-0000-0000-0000-000000000000'];

  const [
    { data: recentTestAttempts },
    { data: trendRows },
  ] = await Promise.all([
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, user_id, status, finished_at, started_at,
        composite_score, rw_scaled, math_scaled,
        practice_test:practice_tests_v2!inner(name, code)
      `)
      .in('user_id', rosterIds)
      .order('started_at', { ascending: false })
      .limit(RECENT_TEST_LIMIT),
    rawStudents.length > 0
      ? supabase.rpc('get_roster_weekly_trend', {
          p_roster: rosterIds,
          p_num_weeks: SPARK_WEEKS,
        })
      : Promise.resolve({ data: [] }),
  ]);

  return {
    rawStudents,
    recentTestAttempts: (recentTestAttempts as RecentTestAttempt[] | null) ?? [],
    trendRows: (trendRows as TrendRow[] | null) ?? [],
  };
}
