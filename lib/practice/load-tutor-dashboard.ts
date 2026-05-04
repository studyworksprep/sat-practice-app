// Tutor-dashboard data load.
//
// Two queries:
//
//   1. profiles (RLS-scoped) — name + static profile detail for every
//      student the tutor can see. Replaced an earlier
//      student_practice_stats view query that aggregated four
//      attempt counts per student via a heavy GROUP BY join across
//      the whole attempts table; on a 40-student roster that scan
//      was ~1.5–2 s, and the per-student perf data wasn't worth it
//      on a "find a student" surface — the per-student detail page
//      already has it.
//
//   2. practice_test_attempts_v2 (RLS-scoped, limit 5) — recent
//      practice tests across the roster. Down from 10 since the
//      surface is "what just happened?" not "audit history".
//
// We previously also called get_roster_weekly_trend for an 8-week
// cohort sparkline on the stat row. Dropped: same disposability
// rationale, and the sparkline burned another 8× attempts scan.
//
// Both queries run in parallel. RLS does the visibility filtering
// — a forged tutorId can't widen the result set.
//
// See docs/architecture-plan.md §3.6.

import { createClient } from '@/lib/supabase/server';

const RECENT_TEST_LIMIT = 5;

export interface TutorDashboardData {
  rawStudents: Array<RawStudentRow>;
  recentTestAttempts: Array<RecentTestAttempt>;
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

/** Load the tutor-dashboard payload for the given tutor. RLS on
 *  profiles + practice_test_attempts_v2 applies as the calling
 *  user via can_view, so a forged tutorId can't widen visibility. */
export async function loadTutorDashboard(_tutorId: string): Promise<TutorDashboardData> {
  const supabase = await createClient();

  // Fetch the visible-student profiles first; their ids drive the
  // recent-tests `.in()` filter. RLS on profiles uses can_view, so
  // we get exactly the tutor's roster.
  const { data: profileRows } = await supabase
    .from('profiles')
    .select(
      'id, email, first_name, last_name, target_sat_score, high_school, graduation_year, sat_test_date',
    )
    .eq('role', 'student')
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false });

  const rawStudents: RawStudentRow[] = (profileRows ?? []).map((p) => ({
    user_id: p.id as string,
    email: p.email,
    first_name: p.first_name,
    last_name: p.last_name,
    target_sat_score: p.target_sat_score,
    high_school: p.high_school,
    graduation_year: p.graduation_year,
    sat_test_date: p.sat_test_date,
  }));

  // Recent test attempts. Pass a single bogus uuid when the roster
  // is empty so the query returns nothing without a syntax-level
  // empty `.in()` (PostgREST rejects those).
  const rosterIds = rawStudents.length > 0
    ? rawStudents.map((r) => r.user_id)
    : ['00000000-0000-0000-0000-000000000000'];

  const { data: recentTestAttempts } = await supabase
    .from('practice_test_attempts_v2')
    .select(`
      id, user_id, status, finished_at, started_at,
      composite_score, rw_scaled, math_scaled,
      practice_test:practice_tests_v2!inner(name, code)
    `)
    .in('user_id', rosterIds)
    .order('started_at', { ascending: false })
    .limit(RECENT_TEST_LIMIT);

  return {
    rawStudents,
    recentTestAttempts: (recentTestAttempts as RecentTestAttempt[] | null) ?? [],
  };
}
