import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/teachers — list teachers (admins see all, managers see assigned)
export const GET = legacyApiRoute(async () => {
  const { user, profile, service: svc } = await requireServiceRole(
    'manager/admin teachers roster aggregate',
    { allowedRoles: ['manager', 'admin'] },
  );

  let teachers;
  if (profile.role === 'admin') {
    // Admins see all teachers and managers
    const { data } = await svc
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, is_active, role')
      .in('role', ['teacher', 'manager'])
      .order('email', { ascending: true })
      .limit(1000);
    teachers = data || [];
  } else {
    // Managers see only their assigned teachers
    const { data: mta } = await svc
      .from('manager_teacher_assignments')
      .select('teacher_id')
      .eq('manager_id', user.id)
      .limit(500);

    const teacherIds = (mta || []).map(a => a.teacher_id);
    if (teacherIds.length === 0) {
      return NextResponse.json({ teachers: [] });
    }

    const { data } = await svc
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, is_active, role')
      .in('id', teacherIds)
      .order('email', { ascending: true })
      .limit(1000);
    teachers = data || [];
  }

  // Get student counts for these teachers
  const teacherIds = teachers.map(t => t.id);
  const { data: assignments } = teacherIds.length
    ? await svc
        .from('teacher_student_assignments')
        .select('teacher_id, student_id')
        .in('teacher_id', teacherIds)
        .limit(10000)
    : { data: [] };

  const assignmentsByTeacher = {};
  for (const a of assignments || []) {
    if (!assignmentsByTeacher[a.teacher_id]) assignmentsByTeacher[a.teacher_id] = [];
    assignmentsByTeacher[a.teacher_id].push(a.student_id);
  }

  // ── Per-teacher roster stats: accuracy + test scores ──
  const allStudentIds = [...new Set((assignments || []).map(a => a.student_id))];

  // Batch fetch student question_status for accuracy
  let allStudentStatuses = [];
  if (allStudentIds.length) {
    const BATCH = 50;
    for (let i = 0; i < allStudentIds.length; i += BATCH) {
      const batch = allStudentIds.slice(i, i + BATCH);
      const { data } = await svc.from('question_status')
        .select('user_id, last_is_correct')
        .in('user_id', batch).eq('is_done', true).limit(50000);
      if (data) allStudentStatuses.push(...data);
    }
  }

  // Batch fetch student practice test scores
  let allStudentTests = [];
  if (allStudentIds.length) {
    const { data } = await svc.from('practice_test_attempts')
      .select('user_id, composite_score')
      .in('user_id', allStudentIds)
      .eq('status', 'completed')
      .not('composite_score', 'is', null)
      .limit(10000);
    allStudentTests = data || [];
  }

  // Aggregate per teacher
  const rosterStatsByTeacher = {};
  for (const tid of teacherIds) {
    const sids = new Set(assignmentsByTeacher[tid] || []);
    const statuses = allStudentStatuses.filter(s => sids.has(s.user_id));
    const tests = allStudentTests.filter(t => sids.has(t.user_id));
    const total = statuses.length;
    const correct = statuses.filter(s => s.last_is_correct).length;
    const avgScore = tests.length > 0
      ? Math.round(tests.reduce((s, t) => s + t.composite_score, 0) / tests.length)
      : null;
    rosterStatsByTeacher[tid] = {
      rosterAccuracy: total > 0 ? Math.round((correct / total) * 100) : null,
      rosterQuestionsDone: total,
      rosterAvgScore: avgScore,
      rosterTestCount: tests.length,
    };
  }

  // ── Per-teacher training stats ──
  let teacherTrainingStatuses = [];
  if (teacherIds.length) {
    const { data } = await svc.from('question_status')
      .select('user_id, last_is_correct')
      .in('user_id', teacherIds).eq('is_done', true).limit(50000);
    teacherTrainingStatuses = data || [];
  }

  let teacherTrainingTests = [];
  if (teacherIds.length) {
    const { data } = await svc.from('practice_test_attempts')
      .select('user_id, composite_score')
      .in('user_id', teacherIds)
      .eq('status', 'completed')
      .not('composite_score', 'is', null)
      .limit(5000);
    teacherTrainingTests = data || [];
  }

  const trainingByTeacher = {};
  for (const tid of teacherIds) {
    const statuses = teacherTrainingStatuses.filter(s => s.user_id === tid);
    const tests = teacherTrainingTests.filter(t => t.user_id === tid);
    const total = statuses.length;
    const correct = statuses.filter(s => s.last_is_correct).length;
    trainingByTeacher[tid] = {
      trainingQuestionsDone: total,
      trainingAccuracy: total > 0 ? Math.round((correct / total) * 100) : null,
      trainingTestCount: tests.length,
      trainingBestScore: tests.length > 0 ? Math.max(...tests.map(t => t.composite_score)) : null,
    };
  }

  const result = teachers.map(t => ({
    ...t,
    student_count: (assignmentsByTeacher[t.id] || []).length,
    ...(rosterStatsByTeacher[t.id] || {}),
    ...(trainingByTeacher[t.id] || {}),
  }));

  return NextResponse.json({ teachers: result });
});
