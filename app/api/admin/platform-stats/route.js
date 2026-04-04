import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/admin/platform-stats
// Returns active-user counts, practice volume trends, and feature adoption data.
export async function GET() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const now = new Date();
  const todayStart = new Date(now); todayStart.setHours(0, 0, 0, 0);
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  // ── 1) Active Users ─────────────────────────────────────────────
  // "Active" = has at least one attempt in the period
  const [au1, au7, au30] = await Promise.all([
    supabase.rpc('count_distinct_users_since', { since: todayStart.toISOString() }),
    supabase.rpc('count_distinct_users_since', { since: d7.toISOString() }),
    supabase.rpc('count_distinct_users_since', { since: d30.toISOString() }),
  ]);

  // Fallback: if RPC doesn't exist, query directly
  let activeToday = au1?.data ?? null;
  let active7d = au7?.data ?? null;
  let active30d = au30?.data ?? null;

  if (activeToday === null || active7d === null || active30d === null) {
    const { data: allAttempts } = await supabase
      .from('attempts')
      .select('user_id, created_at')
      .gte('created_at', d30.toISOString());

    const users1 = new Set();
    const users7 = new Set();
    const users30 = new Set();
    for (const a of allAttempts || []) {
      const t = new Date(a.created_at);
      users30.add(a.user_id);
      if (t >= d7) users7.add(a.user_id);
      if (t >= todayStart) users1.add(a.user_id);
    }
    activeToday = users1.size;
    active7d = users7.size;
    active30d = users30.size;
  }

  // Active users by role (last 30 days)
  const { data: activeByRoleRows } = await supabase
    .from('attempts')
    .select('user_id')
    .gte('created_at', d30.toISOString());

  const activeUserIds30 = [...new Set((activeByRoleRows || []).map(r => r.user_id))];
  const activeByRole = { student: 0, teacher: 0, manager: 0, admin: 0, practice: 0 };

  if (activeUserIds30.length > 0) {
    // Batch lookup in chunks of 200
    for (let i = 0; i < activeUserIds30.length; i += 200) {
      const chunk = activeUserIds30.slice(i, i + 200);
      const { data: profs } = await supabase
        .from('profiles')
        .select('role')
        .in('id', chunk);
      for (const p of profs || []) {
        if (activeByRole[p.role] !== undefined) activeByRole[p.role]++;
      }
    }
  }

  // ── 2) Practice Volume (weekly, last 8 weeks) ──────────────────
  const d56 = new Date(now); d56.setDate(d56.getDate() - 56);
  const { data: volumeAttempts } = await supabase
    .from('attempts')
    .select('created_at, source')
    .gte('created_at', d56.toISOString());

  // Build weekly buckets
  const weeks = [];
  for (let i = 7; i >= 0; i--) {
    const wStart = new Date(now);
    wStart.setDate(wStart.getDate() - (i + 1) * 7);
    wStart.setHours(0, 0, 0, 0);
    const wEnd = new Date(now);
    wEnd.setDate(wEnd.getDate() - i * 7);
    wEnd.setHours(0, 0, 0, 0);
    weeks.push({
      label: wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      start: wStart,
      end: wEnd,
      questions: 0,
      testQuestions: 0,
    });
  }

  for (const a of volumeAttempts || []) {
    const t = new Date(a.created_at);
    for (const w of weeks) {
      if (t >= w.start && t < w.end) {
        w.questions++;
        if (a.source === 'practice_test') w.testQuestions++;
        break;
      }
    }
  }

  // Also count completed practice tests
  const { data: completedTests } = await supabase
    .from('practice_test_attempts')
    .select('finished_at')
    .eq('status', 'completed')
    .gte('finished_at', d56.toISOString());

  const weeklyTests = weeks.map(w => ({ ...w, testsCompleted: 0 }));
  for (const t of completedTests || []) {
    const dt = new Date(t.finished_at);
    for (const w of weeklyTests) {
      if (dt >= w.start && dt < w.end) {
        w.testsCompleted++;
        break;
      }
    }
  }

  const volumeWeeks = weeklyTests.map(w => ({
    label: w.label,
    questions: w.questions,
    testQuestions: w.testQuestions,
    testsCompleted: w.testsCompleted,
  }));

  // ── 3) Feature Adoption (last 30 days) ─────────────────────────
  // Count distinct users who used each feature, separated by role.
  // First get role lookup for all users to filter correctly.
  const { data: allProfiles } = await supabase
    .from('profiles')
    .select('id, role');
  const roleById = {};
  for (const p of allProfiles || []) roleById[p.id] = p.role;

  const isStudentRole = (uid) => ['student', 'practice'].includes(roleById[uid]);
  const isTeacherRole = (uid) => ['teacher', 'manager', 'admin'].includes(roleById[uid]);

  const [
    flashcardRes,
    vocabRes,
    lessonProgressRes,
    bugRes,
    practiceTestRes,
    desmosRes,
    assignmentRes,
    notesRes,
    lessonAssignRes,
    registrationRes,
    officialScoreRes,
  ] = await Promise.all([
    // Student features
    supabase.from('flashcard_sets').select('user_id').gte('created_at', d30.toISOString()),
    supabase.from('sat_vocabulary_progress').select('user_id').gte('updated_at', d30.toISOString()),
    supabase.from('lesson_progress').select('user_id').gte('updated_at', d30.toISOString()),
    supabase.from('bug_reports').select('created_by').gte('created_at', d30.toISOString()),
    supabase.from('practice_test_attempts').select('user_id').eq('status', 'completed').gte('finished_at', d30.toISOString()),
    supabase.from('desmos_saved_states').select('saved_by').gte('created_at', d30.toISOString()),
    // Teacher features
    supabase.from('question_assignments').select('teacher_id').gte('created_at', d30.toISOString()),
    supabase.from('question_notes').select('author_id').gte('created_at', d30.toISOString()),
    supabase.from('lesson_assignments').select('teacher_id').gte('created_at', d30.toISOString()),
    supabase.from('sat_test_registrations').select('created_by').gte('created_at', d30.toISOString()),
    supabase.from('sat_official_scores').select('created_by').gte('created_at', d30.toISOString()),
  ]);

  // Count distinct users filtered by role
  const distinctByRole = (rows, field, roleFn) =>
    new Set((rows || []).map(r => r[field]).filter(uid => uid && roleFn(uid))).size;

  const studentAdoption = [
    { feature: 'Practice Tests', users: distinctByRole(practiceTestRes.data, 'user_id', isStudentRole) },
    { feature: 'Flashcards', users: distinctByRole(flashcardRes.data, 'user_id', isStudentRole) },
    { feature: 'SAT Vocabulary', users: distinctByRole(vocabRes.data, 'user_id', isStudentRole) },
    { feature: 'Lessons', users: distinctByRole(lessonProgressRes.data, 'user_id', isStudentRole) },
    { feature: 'Desmos Calculator', users: distinctByRole(desmosRes.data, 'saved_by', isTeacherRole) },
    { feature: 'Bug Reports', users: distinctByRole(bugRes.data, 'created_by', isStudentRole) },
  ];

  const teacherAdoption = [
    { feature: 'Assignments', users: distinctByRole(assignmentRes.data, 'teacher_id', isTeacherRole) },
    { feature: 'Question Notes', users: distinctByRole(notesRes.data, 'author_id', isTeacherRole) },
    { feature: 'Lesson Assignments', users: distinctByRole(lessonAssignRes.data, 'teacher_id', isTeacherRole) },
    { feature: 'Test Registrations', users: distinctByRole(registrationRes.data, 'created_by', isTeacherRole) },
    { feature: 'Official Scores', users: distinctByRole(officialScoreRes.data, 'created_by', isTeacherRole) },
  ];

  // Total counts by role for adoption percentages
  const [{ count: totalStudents }, { count: totalTeachers }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['student', 'practice']),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).in('role', ['teacher', 'manager', 'admin']),
  ]);

  return NextResponse.json({
    activeUsers: { today: activeToday, d7: active7d, d30: active30d, byRole: activeByRole },
    volumeWeeks,
    studentAdoption,
    teacherAdoption,
    totalStudents: totalStudents || 0,
    totalTeachers: totalTeachers || 0,
  });
}
