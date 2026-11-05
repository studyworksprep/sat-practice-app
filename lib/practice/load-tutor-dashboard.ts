import { createClient } from '@/lib/supabase/server';
import type { TypedSupabaseClient } from '@/lib/supabase/server';

import { computeAdherence, type AdherenceTask } from '@/lib/plan/adherence';
import { loadDashboardActivity } from '@/lib/tutor/load-dashboard-activity';
import type { DashboardActivity } from '@/lib/tutor/dashboard-activity';
import { ACTIVITY_LOOKBACK_DAYS, type StudentSignals } from '@/lib/tutor/dashboard-attention';
import { isLateAssignment, type AssignmentRow } from '@/lib/tutor/nav-badges';

export interface TutorDashboardData {
  rawStudents: Array<RawStudentRow>;
  activities: DashboardActivity[];
  activityUnavailable: boolean;
  /** Per-student signals for the attention list, tiles and students panel. */
  signals: StudentSignals[];
  /** Same count as the sidebar's "N late" on Assignments. */
  lateAssignments: number;
  signalsUnavailable: boolean;
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
 *  via can_view, so a forged tutorId can't widen visibility; tutorId
 *  only scopes "assignments this tutor sent". */
export async function loadTutorDashboard(tutorId: string): Promise<TutorDashboardData> {
  const supabase = await createClient();

  // Active students only: archived students live on the roster's
  // past-students view, not on the week's dashboard.
  const { data: profileRows, error: profileError } = await supabase
    .from('profiles')
    .select(
      'id, email, first_name, last_name, target_sat_score, high_school, graduation_year, sat_test_date, is_active',
    )
    .eq('role', 'student')
    .order('last_name', { ascending: true, nullsFirst: false })
    .order('first_name', { ascending: true, nullsFirst: false });

  if (profileError) throw profileError;

  const rawStudents: RawStudentRow[] = (profileRows ?? [])
    .filter((p) => p.is_active !== false)
    .map((p) => ({
      user_id: p.id as string,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      target_sat_score: p.target_sat_score,
      high_school: p.high_school,
      graduation_year: p.graduation_year,
      sat_test_date: p.sat_test_date,
    }));
  const ids = rawStudents.map((row) => row.user_id);

  // Each half degrades on its own: a failed source drops that panel,
  // never the page (student search keeps working either way).
  const [activityPart, signalPart] = await Promise.all([
    loadDashboardActivity(supabase, ids)
      .then((activities) => ({ activities, activityUnavailable: false }))
      .catch((error) => {
        console.error('Tutor dashboard activity load failed', error);
        return { activities: [] as DashboardActivity[], activityUnavailable: true };
      }),
    loadStudentSignals(supabase, tutorId, rawStudents.map((st) => ({
      id: st.user_id,
      name: [st.first_name, st.last_name].filter(Boolean).join(' ') || st.email || '—',
      targetScore: st.target_sat_score,
      satTestDate: st.sat_test_date,
    })))
      .then((r) => ({ ...r, signalsUnavailable: false }))
      .catch((error) => {
        console.error('Tutor dashboard signals load failed', error);
        return { signals: [] as StudentSignals[], lateAssignments: 0, signalsUnavailable: true };
      }),
  ]);

  return { rawStudents, ...activityPart, ...signalPart };
}

export interface SignalStudent {
  id: string;
  name: string;
  targetScore: number | null;
  satTestDate: string | null;
}

/** Per-student signals for a roster: plan adherence, this tutor's open
 *  and overdue work, last practice, test date and latest SAT practice
 *  score. Shared by the dashboard and the roster. RLS-scoped reads. */
export async function loadStudentSignals(
  supabase: TypedSupabaseClient,
  tutorId: string,
  students: SignalStudent[],
): Promise<{ signals: StudentSignals[]; lateAssignments: number }> {
  const ids = students.map((s) => s.id);
  if (ids.length === 0) return { signals: [], lateAssignments: 0 };
  const since = new Date(Date.now() - ACTIVITY_LOOKBACK_DAYS * 86_400_000).toISOString();

  const [plans, assignments, sessions, tests] = await Promise.all([
    supabase.from('study_plans')
      .select('student_id, test_type, test_date, plan_tasks(status, scheduled_date)')
      .in('student_id', ids).eq('status', 'active'),
    supabase.from('assignments_v2')
      .select('due_date, archived_at, assignment_students_v2(student_id, completed_at)')
      .eq('teacher_id', tutorId)
      .is('deleted_at', null)
      .is('archived_at', null),
    // Newest first, so the first row per student is their last activity.
    supabase.from('practice_sessions')
      .select('user_id, last_activity_at')
      .in('user_id', ids)
      .gte('last_activity_at', since)
      .order('last_activity_at', { ascending: false })
      .limit(2000),
    supabase.from('practice_test_attempts_v2')
      .select('user_id, composite_score, finished_at')
      .in('user_id', ids)
      .eq('status', 'completed')
      .not('composite_score', 'is', null)
      .order('finished_at', { ascending: false })
      .limit(500),
  ]);
  for (const r of [plans, assignments, sessions, tests]) if (r.error) throw r.error;

  const today = new Date().toISOString().slice(0, 10);
  const planByStudent = new Map<string, { behind: boolean; overdue: number; testDate: string | null }>();
  for (const plan of plans.data ?? []) {
    const prev = planByStudent.get(plan.student_id) ?? { behind: false, overdue: 0, testDate: null };
    // "Behind" follows the roster's rule: the active SAT plan.
    if (plan.test_type === 'sat') {
      const summary = computeAdherence(
        (plan.plan_tasks ?? []).map((t) => ({
          scheduledDate: t.scheduled_date,
          status: t.status as AdherenceTask['status'],
        })),
        today,
      );
      if (summary.status === 'behind') {
        prev.behind = true;
        prev.overdue = Math.max(prev.overdue, summary.overdueCount);
      }
    }
    prev.testDate = prev.testDate ?? plan.test_date ?? null;
    planByStudent.set(plan.student_id, prev);
  }

  const nowMs = Date.now();
  let lateAssignments = 0;
  const overdueByStudent = new Map<string, number>();
  const openByStudent = new Map<string, number>();
  const bump = (map: Map<string, number>, id: string) => map.set(id, (map.get(id) ?? 0) + 1);
  for (const row of (assignments.data ?? []) as Array<AssignmentRow & {
    assignment_students_v2: Array<{ student_id: string; completed_at: string | null }> | null;
  }>) {
    const late = isLateAssignment(row, nowMs);
    if (late) lateAssignments += 1;
    for (const m of row.assignment_students_v2 ?? []) {
      if (m.completed_at) continue;
      bump(openByStudent, m.student_id);
      if (late) bump(overdueByStudent, m.student_id);
    }
  }

  const lastActive = new Map<string, string>();
  for (const s of sessions.data ?? []) {
    if (s.last_activity_at && !lastActive.has(s.user_id)) lastActive.set(s.user_id, s.last_activity_at);
  }
  const latestScore = new Map<string, number>();
  for (const t of tests.data ?? []) {
    if (t.composite_score != null && !latestScore.has(t.user_id)) latestScore.set(t.user_id, t.composite_score);
  }

  const signals = students.map((st): StudentSignals => {
    const plan = planByStudent.get(st.id);
    return {
      id: st.id,
      name: st.name,
      lastActiveAt: lastActive.get(st.id) ?? null,
      hasPlan: Boolean(plan),
      planBehind: plan?.behind ?? false,
      overdueTasks: plan?.overdue ?? 0,
      overdueAssignments: overdueByStudent.get(st.id) ?? 0,
      openAssignments: openByStudent.get(st.id) ?? 0,
      testDate: plan?.testDate ?? st.satTestDate ?? null,
      latestScore: latestScore.get(st.id) ?? null,
      goalScore: st.targetScore,
    };
  });
  return { signals, lateAssignments };
}
