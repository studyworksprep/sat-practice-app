import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';
import { computeScaledScore } from '../../../../lib/scoreConversion';

const subjToSection = {
  RW: 'reading_writing', rw: 'reading_writing',
  M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
};

/**
 * GET /api/teacher/roster-overview
 *
 * Returns per-student summary data for the teacher dashboard overview:
 *   - profile info, last activity, total questions attempted
 *   - recent accuracy (last 30 first-attempts) + trend vs previous 30
 *   - highest & latest practice-test composite scores
 *   - weekly attempt count (last 7 days)
 *   - computed alerts (inactive, declining, improving)
 */
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, first_name, last_name, email, teacher_invite_code')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Get student list (same logic as /api/teacher/students) ──
  let studentProfiles = [];

  if (profile.role === 'admin') {
    const { data } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, target_sat_score, graduation_year, high_school')
      .in('role', ['student', 'practice'])
      .neq('is_active', false);
    studentProfiles = data || [];
  } else {
    const { data: assignments } = await supabase
      .from('teacher_student_assignments')
      .select('student_id')
      .eq('teacher_id', user.id);

    const { data: classes } = await supabase
      .from('classes')
      .select('id')
      .eq('teacher_id', user.id);

    const classIds = (classes || []).map(c => c.id);
    let enrolledIds = [];
    if (classIds.length) {
      const { data: enrollments } = await supabase
        .from('class_enrollments')
        .select('student_id')
        .in('class_id', classIds);
      enrolledIds = (enrollments || []).map(e => e.student_id);
    }

    const directIds = (assignments || []).map(a => a.student_id);
    const allIds = [...new Set([...directIds, ...enrolledIds])];

    if (!allIds.length) return NextResponse.json({ students: [], alerts: {} });

    const { data } = await supabase
      .from('profiles')
      .select('id, email, first_name, last_name, target_sat_score, graduation_year, high_school')
      .in('id', allIds)
      .neq('is_active', false);
    studentProfiles = data || [];
  }

  if (!studentProfiles.length) return NextResponse.json({ students: [], alerts: {} });

  const ids = studentProfiles.map(s => s.id);
  const profileMap = Object.fromEntries(studentProfiles.map(s => [s.id, s]));

  // ── Batch queries in parallel ──
  const cutoff90d = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [attemptsRes, testAttemptsRes] = await Promise.all([
    // Recent attempts (last 90 days) – oldest first for first-attempt dedup
    supabase
      .from('attempts')
      .select('user_id, question_id, is_correct, created_at')
      .in('user_id', ids)
      .gte('created_at', cutoff90d)
      .order('created_at', { ascending: true })
      .limit(50000),
    // Completed practice tests
    supabase
      .from('practice_test_attempts')
      .select('id, user_id, practice_test_id, status, finished_at')
      .in('user_id', ids)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false }),
  ]);

  const allAttempts = attemptsRes.data || [];
  const allTestAttempts = testAttemptsRes.data || [];

  // ── Also fetch total question count from question_status for full history ──
  const { data: statusAgg } = await supabase
    .from('question_status')
    .select('user_id, last_attempt_at')
    .in('user_id', ids)
    .eq('is_done', true);

  // Count total done per user and find last activity across all time
  const totalDoneByUser = {};
  const lastActivityByUser = {};
  for (const row of statusAgg || []) {
    totalDoneByUser[row.user_id] = (totalDoneByUser[row.user_id] || 0) + 1;
    if (!lastActivityByUser[row.user_id] || row.last_attempt_at > lastActivityByUser[row.user_id]) {
      lastActivityByUser[row.user_id] = row.last_attempt_at;
    }
  }

  // ── Practice test scores (batch) ──
  const testScoreByUser = {}; // { userId: { highest, latest, latestSections } }

  if (allTestAttempts.length) {
    const testIds = [...new Set(allTestAttempts.map(a => a.practice_test_id))];
    const attemptIds = allTestAttempts.map(a => a.id);

    const [testsRes, moduleAttemptsRes] = await Promise.all([
      supabase.from('practice_tests').select('id, name').in('id', testIds),
      supabase.from('practice_test_module_attempts')
        .select('practice_test_attempt_id, practice_test_module_id, correct_count')
        .in('practice_test_attempt_id', attemptIds),
    ]);

    const modIds = [...new Set((moduleAttemptsRes.data || []).map(ma => ma.practice_test_module_id))];
    const [modsRes, lookupRes] = await Promise.all([
      modIds.length
        ? supabase.from('practice_test_modules').select('id, subject_code, module_number, route_code').in('id', modIds)
        : { data: [] },
      supabase.from('score_conversion')
        .select('test_id, section, module1_correct, module2_correct, scaled_score')
        .in('test_id', testIds),
    ]);

    const modById = {};
    for (const m of modsRes.data || []) modById[m.id] = m;

    const lookupByTestSection = {};
    for (const row of lookupRes.data || []) {
      const key = `${row.test_id}/${row.section}`;
      if (!lookupByTestSection[key]) lookupByTestSection[key] = [];
      lookupByTestSection[key].push(row);
    }

    // Group module attempts by practice_test_attempt_id
    const maByPta = {};
    for (const ma of moduleAttemptsRes.data || []) {
      const mod = modById[ma.practice_test_module_id];
      if (!mod) continue;
      if (!maByPta[ma.practice_test_attempt_id]) maByPta[ma.practice_test_attempt_id] = {};
      maByPta[ma.practice_test_attempt_id][`${mod.subject_code}/${mod.module_number}`] = {
        correct: ma.correct_count || 0,
        routeCode: mod.route_code,
        subjectCode: mod.subject_code,
      };
    }

    // Compute scores per test attempt
    for (const ta of allTestAttempts) {
      const modData = maByPta[ta.id] || {};
      const subjects = [...new Set(Object.values(modData).map(d => d.subjectCode))];
      const sections = {};
      let composite = null;

      for (const subj of subjects) {
        const m1 = modData[`${subj}/1`] || { correct: 0 };
        const m2 = modData[`${subj}/2`] || { correct: 0, routeCode: null };
        const sectionName = subjToSection[subj] || 'math';
        const lookupKey = `${ta.practice_test_id}/${sectionName}`;

        const scaled = computeScaledScore({
          section: sectionName,
          m1Correct: m1.correct,
          m2Correct: m2.correct,
          routeCode: m2.routeCode,
          lookupRows: lookupByTestSection[lookupKey] || [],
        });

        sections[subj] = { scaled };
        composite = (composite || 0) + scaled;
      }

      if (composite == null) continue;

      if (!testScoreByUser[ta.user_id]) {
        testScoreByUser[ta.user_id] = { highest: composite, latest: composite, latestSections: sections };
      } else {
        if (composite > testScoreByUser[ta.user_id].highest) {
          testScoreByUser[ta.user_id].highest = composite;
        }
        // allTestAttempts is sorted desc, so first seen = latest
      }
    }
  }

  // ── Per-student: recent accuracy + trend from attempts ──
  // Group attempts by user
  const attemptsByUser = {};
  for (const a of allAttempts) {
    if (!attemptsByUser[a.user_id]) attemptsByUser[a.user_id] = [];
    attemptsByUser[a.user_id].push(a);
  }

  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const students = ids.map(id => {
    const p = profileMap[id];
    const userAttempts = attemptsByUser[id] || [];

    // First attempt per question (ordered ascending, so first occurrence = first attempt)
    const firstAttemptMap = {};
    for (const a of userAttempts) {
      if (!firstAttemptMap[a.question_id]) firstAttemptMap[a.question_id] = a;
    }
    // Sort descending by date for recency
    const firstAttempts = Object.values(firstAttemptMap)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Recent = last 30 first-attempts, Previous = next 30
    const recent = firstAttempts.slice(0, 30);
    const previous = firstAttempts.slice(30, 60);

    const recentAccuracy = recent.length >= 3
      ? Math.round((recent.filter(a => a.is_correct).length / recent.length) * 100)
      : null;
    const previousAccuracy = previous.length >= 3
      ? Math.round((previous.filter(a => a.is_correct).length / previous.length) * 100)
      : null;
    const accuracyTrend = (recentAccuracy !== null && previousAccuracy !== null)
      ? recentAccuracy - previousAccuracy
      : null;

    // Weekly attempts count
    const weeklyAttempts = userAttempts.filter(a => a.created_at >= weekAgo).length;

    const scores = testScoreByUser[id] || {};

    return {
      id,
      email: p.email,
      first_name: p.first_name,
      last_name: p.last_name,
      target_sat_score: p.target_sat_score,
      graduation_year: p.graduation_year,
      high_school: p.high_school,
      last_activity: lastActivityByUser[id] || null,
      total_attempted: totalDoneByUser[id] || 0,
      recent_accuracy: recentAccuracy,
      accuracy_trend: accuracyTrend,
      highest_test_score: scores.highest || null,
      latest_test_score: scores.latest || null,
      latest_sections: scores.latestSections || null,
      weekly_attempts: weeklyAttempts,
    };
  });

  // Sort: most recently active first, no-activity students at bottom
  students.sort((a, b) => {
    if (!a.last_activity && !b.last_activity) return 0;
    if (!a.last_activity) return 1;
    if (!b.last_activity) return -1;
    return new Date(b.last_activity) - new Date(a.last_activity);
  });

  // ── Compute alerts ──
  const now = new Date();

  const inactive = students
    .filter(s => {
      if (!s.last_activity) return true;
      return (now - new Date(s.last_activity)) > 5 * 24 * 60 * 60 * 1000;
    })
    .map(s => ({
      id: s.id,
      days_inactive: s.last_activity
        ? Math.floor((now - new Date(s.last_activity)) / (24 * 60 * 60 * 1000))
        : null,
    }));

  const declining = students
    .filter(s => s.accuracy_trend !== null && s.accuracy_trend <= -8)
    .map(s => ({ id: s.id, trend: s.accuracy_trend, recent_accuracy: s.recent_accuracy }));

  const improving = students
    .filter(s => s.accuracy_trend !== null && s.accuracy_trend >= 8)
    .map(s => ({ id: s.id, trend: s.accuracy_trend, recent_accuracy: s.recent_accuracy }));

  const teacherName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email || 'Teacher';

  return NextResponse.json({
    teacher: {
      name: teacherName,
      role: profile.role,
      invite_code: profile.teacher_invite_code || null,
    },
    students,
    alerts: { inactive, declining, improving },
  });
}
