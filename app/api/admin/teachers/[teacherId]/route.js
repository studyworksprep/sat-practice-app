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

  if (adminProfile?.role !== 'admin' && adminProfile?.role !== 'manager') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // If manager, verify they are assigned to this teacher
  if (adminProfile.role === 'manager') {
    const { data: mta } = await supabase
      .from('manager_teacher_assignments')
      .select('teacher_id')
      .eq('manager_id', user.id)
      .eq('teacher_id', teacherId)
      .maybeSingle();
    if (!mta) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  // Teacher profile + assigned student IDs in parallel
  const [{ data: teacher }, { data: assignments }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, is_active, high_school, teacher_invite_code')
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

  // ── Teacher's own training data ──────────────────────────────────
  // Practice test results
  const { data: teacherTests } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, status, started_at, finished_at, composite_score, rw_scaled, math_scaled')
    .eq('user_id', teacherId)
    .eq('status', 'completed')
    .order('finished_at', { ascending: false })
    .limit(20);

  // Get test names for teacher's tests
  const teacherTestIds = [...new Set((teacherTests || []).map(t => t.practice_test_id))];
  const { data: teacherTestNames } = teacherTestIds.length
    ? await supabase.from('practice_tests').select('id, name').in('id', teacherTestIds)
    : { data: [] };
  const testNameMap = {};
  for (const t of teacherTestNames || []) testNameMap[t.id] = t.name;

  const teacherPracticeTests = (teacherTests || []).map(t => ({
    id: t.id,
    test_name: testNameMap[t.practice_test_id] || 'Practice Test',
    finished_at: t.finished_at,
    composite: t.composite_score,
    rw_scaled: t.rw_scaled,
    math_scaled: t.math_scaled,
  }));

  // Teacher's own practice sessions (question attempts)
  const { data: teacherStatuses } = await supabase
    .from('question_status')
    .select('question_id, last_is_correct, last_attempt_at')
    .eq('user_id', teacherId)
    .eq('is_done', true)
    .order('last_attempt_at', { ascending: false })
    .limit(5000);

  const teacherQs = teacherStatuses || [];
  const teacherQsDone = teacherQs.length;
  const teacherQsCorrect = teacherQs.filter(q => q.last_is_correct).length;
  const teacherAccuracy = teacherQsDone > 0 ? Math.round((teacherQsCorrect / teacherQsDone) * 100) : null;

  // Recent sessions: group by date
  const sessionsByDate = {};
  for (const q of teacherQs) {
    if (!q.last_attempt_at) continue;
    const date = new Date(q.last_attempt_at).toISOString().split('T')[0];
    if (!sessionsByDate[date]) sessionsByDate[date] = { date, total: 0, correct: 0 };
    sessionsByDate[date].total++;
    if (q.last_is_correct) sessionsByDate[date].correct++;
  }
  const teacherSessions = Object.values(sessionsByDate)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  // Domain/skill metrics from teacher's question attempts
  let teacherDomainMastery = [];
  if (teacherQs.length) {
    const tQuestionIds = teacherQs.map(q => q.question_id);
    let allTax = [];
    for (let i = 0; i < tQuestionIds.length; i += 1000) {
      const chunk = tQuestionIds.slice(i, i + 1000);
      const { data: taxData } = await supabase
        .from('question_taxonomy')
        .select('question_id, domain_code, domain_name, skill_name')
        .in('question_id', chunk);
      allTax = allTax.concat(taxData || []);
    }

    const taxMap = {};
    for (const t of allTax) taxMap[t.question_id] = t;

    const MATH_CODES = new Set(['H', 'P', 'Q', 'S']);
    const domainStats = {};
    for (const q of teacherQs) {
      const tax = taxMap[q.question_id];
      if (!tax) continue;
      const dName = tax.domain_name || 'Unknown';
      if (!domainStats[dName]) {
        domainStats[dName] = {
          domain_name: dName,
          domain_code: tax.domain_code,
          isEnglish: !MATH_CODES.has(tax.domain_code),
          correct: 0, total: 0, skills: {},
        };
      }
      domainStats[dName].total++;
      if (q.last_is_correct) domainStats[dName].correct++;

      const sName = tax.skill_name || 'Unknown';
      if (!domainStats[dName].skills[sName]) {
        domainStats[dName].skills[sName] = { skill_name: sName, correct: 0, total: 0 };
      }
      domainStats[dName].skills[sName].total++;
      if (q.last_is_correct) domainStats[dName].skills[sName].correct++;
    }

    teacherDomainMastery = Object.values(domainStats).map(d => ({
      ...d,
      accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : null,
      skills: Object.values(d.skills)
        .map(s => ({ ...s, accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : null }))
        .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)),
    })).sort((a, b) => a.domain_name.localeCompare(b.domain_name));
  }

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
    training: {
      practiceTests: teacherPracticeTests,
      questionsDone: teacherQsDone,
      questionsCorrect: teacherQsCorrect,
      accuracy: teacherAccuracy,
      recentSessions: teacherSessions,
      domainMastery: teacherDomainMastery,
    },
  });
}
