import type { TypedSupabaseClient } from '@/lib/supabase/server';
import type { loadStudentPlanState } from '@/lib/plan/load-plan-state';
import type { getDueReviewItems } from '@/lib/review/queue';

export const DEFAULT_PREP_WINDOW_DAYS = 14;

interface Dependencies {
  loadPlan: typeof loadStudentPlanState;
  loadDue: typeof getDueReviewItems;
}

/** Start each dependent read as soon as its actual input is available.
 * All queries keep the caller's client/RLS; no shared user-data cache. */
export async function loadSessionWorkspace(
  supabase: TypedSupabaseClient,
  studentId: string,
  now: Date,
  { loadPlan, loadDue }: Dependencies,
) {
  const nowIso = now.toISOString();
  const today = nowIso.slice(0, 10);
  const studentRead = Promise.resolve(supabase.from('profiles')
    .select('first_name, last_name, email, target_sat_score, sat_test_date')
    .eq('id', studentId).maybeSingle());
  const notesRead = Promise.resolve(supabase.from('tutor_notes')
    .select('id, author_id, body, session_at').eq('student_id', studentId)
    .order('session_at', { ascending: false }).limit(6));
  const assignmentsRead = Promise.resolve(supabase.from('assignment_students_v2')
    .select(`completed_at, assignment:assignments_v2 (
      id, assignment_type, title, due_date, archived_at, deleted_at, created_at
    )`).eq('student_id', studentId).eq('test_type', 'sat'));

  const baseRead = Promise.all([
    studentRead,
    notesRead,
    loadPlan(supabase, studentId, today),
    supabase.rpc('get_student_coverage', { p_student: studentId }),
    supabase.rpc('get_predicted_score_band', { p_student: studentId, p_test_type: 'sat' }),
    loadDue(supabase, studentId, nowIso).catch(() => []),
  ]);
  const masteryNowRead = Promise.resolve(supabase.rpc('get_skill_mastery_asof', {
    p_student: studentId, p_asof: today,
  }));

  // Notes determine the prep window. Coverage/band/plan do not, so a
  // slow coverage query must not postpone these four independent reads.
  const prepRead = Promise.all([studentRead, notesRead]).then(async ([{ data: student }, { data: notes }]) => {
    if (!student) return null;
    const lastNoteIso = notes?.[0]?.session_at ?? null;
    const sinceIso = lastNoteIso
      ?? new Date(now.getTime() - DEFAULT_PREP_WINDOW_DAYS * 86_400_000).toISOString();
    const [masteryThen, performance, sessions] = await Promise.all([
      supabase.rpc('get_skill_mastery_asof', { p_student: studentId, p_asof: sinceIso.slice(0, 10) }),
      supabase.rpc('get_roster_skill_performance', {
        p_roster: [studentId], p_since: sinceIso,
        p_min_skill_attempts: 3, p_min_student_attempts: 3, p_struggling_threshold: 0.6,
      }),
      supabase.from('practice_sessions').select('id', { count: 'exact', head: true })
        .eq('user_id', studentId).gte('created_at', sinceIso),
    ]);
    return { lastNoteIso, sinceIso, masteryThenRows: masteryThen.data,
      performanceRows: performance.data, sessionsSince: sessions.count };
  });

  const reportsRead = Promise.all([studentRead, assignmentsRead]).then(async ([{ data: student }, { data: rows }]) => {
    if (!student) return null;
    const assignments = (rows ?? [])
      .map(r => ({ completedAt: r.completed_at, a: r.assignment }))
      .filter(r => r.a && !r.a.deleted_at && !r.a.archived_at)
      .sort((x, y) => (y.a!.created_at ?? '').localeCompare(x.a!.created_at ?? ''))
      .slice(0, 3);
    const ids = assignments.map(r => r.a!.id);
    const { data: reportSessions } = ids.length
      ? await supabase.from('practice_sessions').select('id, status, filter_criteria')
        .eq('user_id', studentId).in('filter_criteria->>assignment_id', ids)
      : { data: [] };
    return { assignments, reportSessions };
  });

  // Attach handlers together, including the early-started work, so a
  // rejected dependency cannot leave an unhandled background promise.
  const [base, masteryNow, prep, reports] = await Promise.all([
    baseRead, masteryNowRead, prepRead, reportsRead,
  ]);
  const [{ data: student }, { data: noteRows }, planState,
    { data: coverageRows }, { data: bandRows }, dueItems] = base;
  if (!student || !prep || !reports) return null;
  return { student, noteRows, planState, coverageRows, bandRows, dueItems,
    masteryNowRows: masteryNow.data, ...prep, ...reports };
}
