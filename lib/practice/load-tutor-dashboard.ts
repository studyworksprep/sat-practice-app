import { createClient } from '@/lib/supabase/server';

import { loadDashboardActivity } from '@/lib/tutor/load-dashboard-activity';
import type { DashboardActivity } from '@/lib/tutor/dashboard-activity';

export interface TutorDashboardData {
  rawStudents: Array<RawStudentRow>;
  activities: DashboardActivity[];
  activityUnavailable: boolean;
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

/** Load the tutor-dashboard payload for the given tutor. RLS on
 *  profiles + assignment_students_v2 applies as the calling user
 *  via can_view, so a forged tutorId can't widen visibility. */
export async function loadTutorDashboard(_tutorId: string): Promise<TutorDashboardData> {
  const supabase = await createClient();

  // Fetch the visible-student profiles first; their ids drive the
  // recent-completions `.in()` filter. RLS on profiles uses can_view,
  // so we get exactly the tutor's roster.
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select(
      'id, email, first_name, last_name, target_sat_score, high_school, graduation_year, sat_test_date',
    )
    .eq('role', 'student')
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false });

  if (profileError) throw profileError;

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

  // Preserve student search if one activity source is temporarily unavailable.
  try {
    const activities = await loadDashboardActivity(supabase, rawStudents.map(row => row.user_id));
    return { rawStudents, activities, activityUnavailable: false };
  } catch (error) {
    console.error('Tutor dashboard activity load failed', error);
    return { rawStudents, activities: [], activityUnavailable: true };
  }
}
