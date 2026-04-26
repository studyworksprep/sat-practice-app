import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/admin/teacher-effectiveness
// Returns per-teacher metrics so admins can gauge effectiveness at a glance.
export const GET = legacyApiRoute(async () => {
  const { supabase } = await requireRole(['admin']);

  const now = new Date();
  const d7 = new Date(now); d7.setDate(d7.getDate() - 7);
  const d30 = new Date(now); d30.setDate(d30.getDate() - 30);

  // 1) All teachers (+ managers who act as teachers)
  const { data: teachers } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, role, created_at')
    .in('role', ['teacher', 'manager'])
    .eq('is_active', true)
    .order('created_at', { ascending: true });

  if (!teachers || teachers.length === 0) return NextResponse.json({ teachers: [] });

  const teacherIds = teachers.map(t => t.id);

  // 2) Student assignments per teacher
  const { data: assignments } = await supabase
    .from('teacher_student_assignments')
    .select('teacher_id, student_id')
    .in('teacher_id', teacherIds)
    .limit(10000);

  const teacherStudents = {}; // teacher_id -> Set of student_ids
  for (const a of assignments || []) {
    if (!teacherStudents[a.teacher_id]) teacherStudents[a.teacher_id] = new Set();
    teacherStudents[a.teacher_id].add(a.student_id);
  }

  // 3) All assigned student IDs for batch queries
  const allStudentIds = [...new Set((assignments || []).map(a => a.student_id))];

  // 4) Student activity (attempts in last 7d and 30d)
  let studentActivity7 = {}; // student_id -> count
  let studentActivity30 = {}; // student_id -> count
  let studentAccuracy30 = {}; // student_id -> { total, correct }

  if (allStudentIds.length > 0) {
    // Batch in chunks
    for (let i = 0; i < allStudentIds.length; i += 300) {
      const chunk = allStudentIds.slice(i, i + 300);

      const { data: attempts30 } = await supabase
        .from('attempts')
        .select('user_id, is_correct, created_at')
        .in('user_id', chunk)
        .gte('created_at', d30.toISOString())
        .limit(50000);

      for (const a of attempts30 || []) {
        // 30-day counts
        studentActivity30[a.user_id] = (studentActivity30[a.user_id] || 0) + 1;
        if (!studentAccuracy30[a.user_id]) studentAccuracy30[a.user_id] = { total: 0, correct: 0 };
        studentAccuracy30[a.user_id].total++;
        if (a.is_correct) studentAccuracy30[a.user_id].correct++;

        // 7-day counts
        if (new Date(a.created_at) >= d7) {
          studentActivity7[a.user_id] = (studentActivity7[a.user_id] || 0) + 1;
        }
      }
    }
  }

  // 5) Practice test scores per student (completed)
  let studentTestScores = {}; // student_id -> [composite_score, ...]
  if (allStudentIds.length > 0) {
    for (let i = 0; i < allStudentIds.length; i += 300) {
      const chunk = allStudentIds.slice(i, i + 300);
      const { data: tests } = await supabase
        .from('practice_test_attempts')
        .select('user_id, composite_score')
        .in('user_id', chunk)
        .eq('status', 'completed')
        .not('composite_score', 'is', null)
        .limit(5000);

      for (const t of tests || []) {
        if (!studentTestScores[t.user_id]) studentTestScores[t.user_id] = [];
        studentTestScores[t.user_id].push(t.composite_score);
      }
    }
  }

  // 6) Assignment completion rates per teacher
  const { data: qAssignments } = await supabase
    .from('question_assignments')
    .select('id, teacher_id, question_ids, filter_criteria')
    .in('teacher_id', teacherIds)
    .limit(5000);

  const teacherAssignmentIds = {};
  for (const qa of qAssignments || []) {
    if (!teacherAssignmentIds[qa.teacher_id]) teacherAssignmentIds[qa.teacher_id] = [];
    teacherAssignmentIds[qa.teacher_id].push(qa);
  }

  // Get student-assignment mappings
  const allAssignIds = (qAssignments || []).map(qa => qa.id);
  const assignStudentsMap = {}; // assignment_id -> [student_id, ...]
  if (allAssignIds.length > 0) {
    for (let i = 0; i < allAssignIds.length; i += 300) {
      const chunk = allAssignIds.slice(i, i + 300);
      const { data: saRows } = await supabase
        .from('question_assignment_students')
        .select('assignment_id, student_id')
        .in('assignment_id', chunk)
        .limit(10000);
      for (const sa of saRows || []) {
        if (!assignStudentsMap[sa.assignment_id]) assignStudentsMap[sa.assignment_id] = [];
        assignStudentsMap[sa.assignment_id].push(sa.student_id);
      }
    }
  }

  // Get question completion status for all assignment questions
  const allAssignQids = [...new Set((qAssignments || []).flatMap(qa => qa.question_ids || []))];
  const assignDoneByStudent = {}; // student_id -> Set of done question_ids
  if (allAssignQids.length > 0 && allStudentIds.length > 0) {
    for (let i = 0; i < allStudentIds.length; i += 100) {
      const chunk = allStudentIds.slice(i, i + 100);
      const { data: statusRows } = await supabase
        .from('question_status')
        .select('user_id, question_id')
        .in('user_id', chunk)
        .in('question_id', allAssignQids)
        .eq('is_done', true)
        .limit(50000);
      for (const s of statusRows || []) {
        if (!assignDoneByStudent[s.user_id]) assignDoneByStudent[s.user_id] = new Set();
        assignDoneByStudent[s.user_id].add(s.question_id);
      }
    }
  }

  // Also check practice test completion for PT assignments
  const ptAssignTestIds = [...new Set(
    (qAssignments || [])
      .filter(qa => qa.filter_criteria?.type === 'practice_test')
      .map(qa => qa.filter_criteria.practice_test_id)
      .filter(Boolean)
  )];
  const ptDoneByStudent = {}; // student_id -> Set of completed practice_test_ids
  if (ptAssignTestIds.length && allStudentIds.length) {
    const { data: ptAttempts } = await supabase
      .from('practice_test_attempts')
      .select('user_id, practice_test_id')
      .in('user_id', allStudentIds)
      .in('practice_test_id', ptAssignTestIds)
      .eq('status', 'completed')
      .limit(5000);
    for (const pt of ptAttempts || []) {
      if (!ptDoneByStudent[pt.user_id]) ptDoneByStudent[pt.user_id] = new Set();
      ptDoneByStudent[pt.user_id].add(pt.practice_test_id);
    }
  }

  // Compute per-assignment completion
  const assignCompletionMap = {}; // assignment_id -> { total, completed }
  for (const qa of qAssignments || []) {
    const students = assignStudentsMap[qa.id] || [];
    const isPT = qa.filter_criteria?.type === 'practice_test';
    let total = 0, completed = 0;

    for (const sid of students) {
      total++;
      if (isPT) {
        const testId = qa.filter_criteria.practice_test_id;
        if (ptDoneByStudent[sid]?.has(testId)) completed++;
      } else {
        const qids = qa.question_ids || [];
        const doneSet = assignDoneByStudent[sid] || new Set();
        if (qids.length > 0 && qids.every(qid => doneSet.has(qid))) completed++;
      }
    }

    assignCompletionMap[qa.id] = { total, completed };
  }

  // 7) Build per-teacher metrics
  const result = teachers.map(t => {
    const students = teacherStudents[t.id] || new Set();
    const studentCount = students.size;
    const studentArr = [...students];

    // Active students (attempted anything in last 7 days)
    const activeStudents7d = studentArr.filter(sid => (studentActivity7[sid] || 0) > 0).length;

    // Average student accuracy (30d)
    let totalAcc = 0, accCount = 0;
    for (const sid of studentArr) {
      const acc = studentAccuracy30[sid];
      if (acc && acc.total > 0) {
        totalAcc += acc.correct / acc.total;
        accCount++;
      }
    }
    const avgStudentAccuracy = accCount > 0 ? Math.round((totalAcc / accCount) * 100) : null;

    // Average questions per student per week (30d)
    let totalQuestions30 = 0;
    for (const sid of studentArr) {
      totalQuestions30 += studentActivity30[sid] || 0;
    }
    const avgQuestionsPerWeek = studentCount > 0 ? Math.round((totalQuestions30 / studentCount) / 4.3) : 0;

    // Average test score across students' best scores
    let testScoreSum = 0, testScoreCount = 0;
    for (const sid of studentArr) {
      const scores = studentTestScores[sid];
      if (scores && scores.length > 0) {
        testScoreSum += Math.max(...scores);
        testScoreCount++;
      }
    }
    const avgBestTestScore = testScoreCount > 0 ? Math.round(testScoreSum / testScoreCount) : null;

    // Students who took at least one test
    const studentsTested = studentArr.filter(sid => (studentTestScores[sid]?.length || 0) > 0).length;

    // Assignment completion rate
    const myAssigns = teacherAssignmentIds[t.id] || [];
    let assignTotal = 0, assignCompleted = 0;
    for (const qa of myAssigns) {
      const ac = assignCompletionMap[qa.id];
      if (ac) {
        assignTotal += ac.total;
        assignCompleted += ac.completed;
      }
    }
    const assignmentCompletionRate = assignTotal > 0 ? Math.round((assignCompleted / assignTotal) * 100) : null;

    // Engagement rate: % of students active in last 7 days
    const engagementRate = studentCount > 0 ? Math.round((activeStudents7d / studentCount) * 100) : null;

    const name = [t.first_name, t.last_name].filter(Boolean).join(' ') || t.email;

    return {
      id: t.id,
      name,
      email: t.email,
      role: t.role,
      studentCount,
      activeStudents7d,
      engagementRate,
      avgStudentAccuracy,
      avgQuestionsPerWeek,
      avgBestTestScore,
      studentsTested,
      assignmentsCreated: myAssigns.length,
      assignmentCompletionRate,
    };
  });

  return NextResponse.json({ teachers: result });
});
