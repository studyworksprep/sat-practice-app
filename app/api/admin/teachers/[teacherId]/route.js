import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

// GET /api/admin/teachers/[teacherId] — teacher detail with assigned students and their activity
export async function GET(_request, { params }) {
  const { teacherId } = params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (adminProfile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Teacher profile + assigned student IDs in parallel
  const [{ data: teacher }, { data: assignments }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, is_active, high_school')
      .eq('id', teacherId)
      .maybeSingle(),
    supabase
      .from('teacher_student_assignments')
      .select('student_id')
      .eq('teacher_id', teacherId),
  ]);

  if (!teacher) {
    return NextResponse.json({ error: 'Teacher not found' }, { status: 404 });
  }

  const studentIds = (assignments || []).map(a => a.student_id);

  // Fetch student profiles, question statuses, test completions, and assignments all in parallel
  const [
    { data: studentProfiles },
    { data: allStatuses },
    { data: testCompletions },
    { data: questionAssignments },
  ] = await Promise.all([
    studentIds.length
      ? supabase
          .from('profiles')
          .select('id, email, first_name, last_name, is_active, graduation_year, high_school, target_sat_score')
          .in('id', studentIds)
          .order('email', { ascending: true })
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? supabase
          .from('question_status')
          .select('user_id, last_is_correct, last_attempt_at')
          .in('user_id', studentIds)
          .eq('is_done', true)
          .order('last_attempt_at', { ascending: false })
          .limit(10000)
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? supabase
          .from('practice_test_attempts')
          .select('id, user_id')
          .in('user_id', studentIds)
          .eq('status', 'completed')
      : Promise.resolve({ data: [] }),
    supabase
      .from('question_assignments')
      .select('id, title, created_at, due_date, question_count')
      .eq('created_by', teacherId)
      .order('created_at', { ascending: false })
      .limit(20),
  ]);

  const students = studentProfiles || [];

  // Per-student activity stats
  const studentStatsMap = {};
  for (const s of students) {
    studentStatsMap[s.id] = { total: 0, correct: 0, last7: 0, last30: 0 };
  }

  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  let totalLast7 = 0;
  let totalLast30 = 0;
  for (const s of (allStatuses || [])) {
    const stats = studentStatsMap[s.user_id];
    if (!stats) continue;
    stats.total++;
    if (s.last_is_correct) stats.correct++;
    if (s.last_attempt_at) {
      const d = new Date(s.last_attempt_at);
      if (d >= sevenDaysAgo) { stats.last7++; totalLast7++; }
      if (d >= thirtyDaysAgo) { stats.last30++; totalLast30++; }
    }
  }

  // Get practice test completions per student
  const testsPerStudent = {};
  for (const t of (testCompletions || [])) {
    if (!testsPerStudent[t.user_id]) testsPerStudent[t.user_id] = 0;
    testsPerStudent[t.user_id]++;
  }

  // Build student list with stats
  const studentsWithStats = students.map(s => {
    const stats = studentStatsMap[s.id] || { total: 0, correct: 0, last7: 0, last30: 0 };
    return {
      ...s,
      questions_done: stats.total,
      questions_correct: stats.correct,
      accuracy: stats.total > 0 ? Math.round((stats.correct / stats.total) * 100) : null,
      last_7_days: stats.last7,
      last_30_days: stats.last30,
      tests_completed: testsPerStudent[s.id] || 0,
    };
  });

  // Aggregate totals
  const statusList = allStatuses || [];
  const totalQuestionsDone = statusList.length;
  const totalCorrect = statusList.filter(s => s.last_is_correct).length;
  const totalTestsCompleted = (testCompletions || []).length;
  const activeStudents = studentsWithStats.filter(s => s.last_7_days > 0).length;

  return NextResponse.json({
    teacher,
    students: studentsWithStats,
    assignments: questionAssignments || [],
    totals: {
      students: students.length,
      questionsDone: totalQuestionsDone,
      correct: totalCorrect,
      accuracy: totalQuestionsDone > 0 ? Math.round((totalCorrect / totalQuestionsDone) * 100) : null,
      last7Days: totalLast7,
      last30Days: totalLast30,
      testsCompleted: totalTestsCompleted,
      activeStudents,
    },
  });
}
