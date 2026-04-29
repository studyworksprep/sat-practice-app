// Cached fetch for the tutor dashboard's three slow reads — the
// student_practice_stats view (per-student aggregates across the
// caller's visible roster), recent practice-test attempts, and the
// 8-week cohort weekly trend RPC. The view in particular scans
// every visible student's attempts on every render, so even with
// RLS pushdown a manager with many students pays a noticeable
// fixed cost per dashboard load.
//
// Cache strategy: TTL-only at 60s. Unlike the student dashboard
// (where submitAnswer can trivially flush its own user's tag), a
// tutor's data depends on which students are in their visible
// roster, so a per-tutor tag would need every student-side write
// to walk the roster graph and invalidate every viewer's cache.
// Not worth the complexity. 60s freshness on a tutor's roster
// summary is acceptable — they aren't watching for sub-minute
// changes — and the answer-submission path stays simple.

import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

const TTL_SECONDS = 60;
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

/** Load the cached tutor-dashboard payload for the given tutor.
 *  Caller passes their authenticated user id, which is folded
 *  into the cache key so different tutors get separate entries.
 *  RLS on the underlying tables (student_practice_stats view +
 *  practice_test_attempts_v2 + the trend RPC) still applies as
 *  the calling user, so a forged tutorId can't widen visibility. */
export function loadTutorDashboard(tutorId: string): Promise<TutorDashboardData> {
  return unstable_cache(
    async () => {
      const supabase = await createClient();

      const { data: rows } = await supabase
        .from('student_practice_stats')
        .select('*')
        .order('last_activity_at', { ascending: false, nullsFirst: false });

      const rawStudents: RawStudentRow[] = (rows as RawStudentRow[] | null) ?? [];

      // Student ids we'll filter the recent-tests query and the
      // trend RPC by. Empty array would short-circuit both calls,
      // but the no-roster path is handled by the page already; we
      // pass a single bogus uuid so the queries return nothing
      // cleanly without an extra branch here.
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
    },
    ['tutor-dashboard', tutorId],
    { revalidate: TTL_SECONDS },
  )();
}
