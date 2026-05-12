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
//   2. assignment_students_v2 (RLS-scoped, limit 8) — recently
//      completed assignments across the roster. Replaces the prior
//      practice_test_attempts_v2 panel: most tutors operate through
//      assignments, and practice-test assignments now auto-complete
//      their junction row when the attempt finishes
//      (markPracticeTestAssignmentsCompletedIfDone in
//      app/next/(student)/practice/test/actions.js), so the
//      assignments panel covers question, lesson, and practice-test
//      completions in one place. Self-directed practice + practice
//      tests are still reachable through the roster → student page.
//
// Both queries run in parallel. RLS does the visibility filtering
// — a forged tutorId can't widen the result set.
//
// See docs/architecture-plan.md §3.6.

import { createClient } from '@/lib/supabase/server';

const RECENT_COMPLETIONS_LIMIT = 8;

export interface TutorDashboardData {
  rawStudents: Array<RawStudentRow>;
  recentCompletions: Array<RecentAssignmentCompletion>;
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

export interface RecentAssignmentCompletion {
  student_id: string;
  completed_at: string | null;
  assignment: {
    id: string;
    assignment_type: 'questions' | 'practice_test' | 'lesson';
    title: string | null;
    question_ids: string[] | null;
    practice_test_id: string | null;
    lesson_id: string | null;
    practice_test: { name: string | null; code: string | null } | null;
    lesson: { title: string | null } | null;
  } | null;
}

/** Load the tutor-dashboard payload for the given tutor. RLS on
 *  profiles + assignment_students_v2 applies as the calling user
 *  via can_view, so a forged tutorId can't widen visibility. */
export async function loadTutorDashboard(_tutorId: string): Promise<TutorDashboardData> {
  const supabase = await createClient();

  // Fetch the visible-student profiles first; their ids drive the
  // recent-completions `.in()` filter. RLS on profiles uses can_view,
  // so we get exactly the tutor's roster.
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

  // Pass a single bogus uuid when the roster is empty so the query
  // returns nothing without a syntax-level empty `.in()` (PostgREST
  // rejects those).
  const rosterIds = rawStudents.length > 0
    ? rawStudents.map((r) => r.user_id)
    : ['00000000-0000-0000-0000-000000000000'];

  // Recently completed assignments across the roster. Filter out
  // archived/deleted assignments via the embedded join — those
  // shouldn't appear on a "what just happened?" surface.
  const { data: recentCompletions } = await supabase
    .from('assignment_students_v2')
    .select(`
      student_id, completed_at,
      assignment:assignments_v2!inner(
        id, assignment_type, title, question_ids,
        practice_test_id, lesson_id, archived_at, deleted_at,
        practice_test:practice_tests_v2(name, code),
        lesson:lessons(title)
      )
    `)
    .in('student_id', rosterIds)
    .not('completed_at', 'is', null)
    .is('assignment.deleted_at', null)
    .is('assignment.archived_at', null)
    .order('completed_at', { ascending: false })
    .limit(RECENT_COMPLETIONS_LIMIT);

  return {
    rawStudents,
    recentCompletions:
      (recentCompletions as RecentAssignmentCompletion[] | null) ?? [],
  };
}
