import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';
import { computeScaledScore } from '../../../../lib/scoreConversion';

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);

const subjToSection = {
  RW: 'reading_writing', rw: 'reading_writing',
  M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
};

function displayName(profile) {
  if (!profile) return 'Student';
  if (profile.first_name || profile.last_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  }
  if (!profile.email) return 'Student';
  const local = profile.email.split('@')[0];
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * GET /api/teacher/practice-tests
 *
 * Returns comprehensive practice test analytics for the teacher dashboard:
 *   - All student completed tests with scores (paginated via ?page=&limit=)
 *   - Per-student score progression (before/after tutoring start)
 *   - Roster-wide domain mastery from practice test questions
 *   - Summary statistics
 */
export async function GET(request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  const role = profile?.role;
  if (role !== 'teacher' && role !== 'manager' && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Pagination params
  const url = new URL(request.url);
  const page = Math.max(0, parseInt(url.searchParams.get('page') || '0', 10));
  const limit = Math.min(50, Math.max(5, parseInt(url.searchParams.get('limit') || '20', 10)));

  // Get student IDs
  let studentIds = [];
  if (role === 'admin') {
    const { data } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['student', 'practice'])
      .neq('is_active', false);
    studentIds = (data || []).map(s => s.id);
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
    studentIds = [...new Set([...directIds, ...enrolledIds])];
  }

  if (!studentIds.length) {
    return NextResponse.json({
      tests: [], totalTests: 0, page, limit,
      summary: { totalStudents: 0, studentsWithTests: 0, avgComposite: null, highestComposite: null },
      progressions: [],
      domainMastery: [],
    });
  }

  const svc = createServiceClient();

  // Parallel fetch student profiles, all completed tests, and test question taxonomy
  const [
    { data: studentProfiles },
    { data: allCompletedTests },
  ] = await Promise.all([
    svc.from('profiles')
      .select('id, email, first_name, last_name, created_at, start_date, target_sat_score')
      .in('id', studentIds),
    svc.from('practice_test_attempts')
      .select('id, user_id, practice_test_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
      .in('user_id', studentIds)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(500),
  ]);

  const profileMap = {};
  for (const s of studentProfiles || []) profileMap[s.id] = s;

  const completed = allCompletedTests || [];
  const totalTests = completed.length;

  // Get test names
  const testIds = [...new Set(completed.map(a => a.practice_test_id))];
  const { data: testsInfo } = testIds.length
    ? await svc.from('practice_tests').select('id, name').in('id', testIds)
    : { data: [] };
  const testNameById = {};
  for (const t of testsInfo || []) testNameById[t.id] = t.name;

  // Compute scores for tests that don't have cached scores
  const uncached = completed.filter(a => a.composite_score == null);
  let computedScores = {};

  if (uncached.length) {
    const uncachedIds = uncached.map(a => a.id);
    const uncachedTestIds = [...new Set(uncached.map(a => a.practice_test_id))];

    const [{ data: moduleAttempts }, { data: lookupRows }] = await Promise.all([
      svc.from('practice_test_module_attempts')
        .select('practice_test_attempt_id, practice_test_module_id, correct_count')
        .in('practice_test_attempt_id', uncachedIds),
      svc.from('score_conversion')
        .select('test_id, section, module1_correct, module2_correct, scaled_score')
        .in('test_id', uncachedTestIds),
    ]);

    const modIds = [...new Set((moduleAttempts || []).map(ma => ma.practice_test_module_id))];
    const { data: mods } = modIds.length
      ? await svc.from('practice_test_modules').select('id, subject_code, module_number, route_code').in('id', modIds)
      : { data: [] };

    const modById = {};
    for (const m of mods || []) modById[m.id] = m;

    const lookupByTestSection = {};
    for (const row of lookupRows || []) {
      const key = `${row.test_id}/${row.section}`;
      if (!lookupByTestSection[key]) lookupByTestSection[key] = [];
      lookupByTestSection[key].push(row);
    }

    for (const a of uncached) {
      const maForAttempt = (moduleAttempts || []).filter(ma => ma.practice_test_attempt_id === a.id);
      const sections = {};
      let composite = null;

      for (const ma of maForAttempt) {
        const mod = modById[ma.practice_test_module_id];
        if (!mod) continue;
        const key = `${mod.subject_code}/${mod.module_number}`;
        if (!sections[mod.subject_code]) sections[mod.subject_code] = {};
        sections[mod.subject_code][mod.module_number] = { correct: ma.correct_count || 0, routeCode: mod.route_code };
      }

      const sectionScores = {};
      for (const subj of Object.keys(sections)) {
        const m1 = sections[subj][1] || { correct: 0 };
        const m2 = sections[subj][2] || { correct: 0, routeCode: null };
        const sectionName = subjToSection[subj] || 'math';
        const lookupKey = `${a.practice_test_id}/${sectionName}`;
        const scaled = computeScaledScore({
          section: sectionName,
          m1Correct: m1.correct,
          m2Correct: m2.correct,
          routeCode: m2.routeCode,
          lookupRows: lookupByTestSection[lookupKey] || [],
        });
        sectionScores[subj] = scaled;
        composite = (composite || 0) + scaled;
      }

      computedScores[a.id] = { composite, sectionScores };
    }
  }

  // Build enriched test list
  const allTests = completed.map(a => {
    const cached = a.composite_score != null;
    const composite = cached ? a.composite_score : (computedScores[a.id]?.composite ?? null);
    const rwScaled = cached ? a.rw_scaled : (computedScores[a.id]?.sectionScores?.RW || computedScores[a.id]?.sectionScores?.rw || null);
    const mathScaled = cached ? a.math_scaled : (computedScores[a.id]?.sectionScores?.M || computedScores[a.id]?.sectionScores?.m || null);
    const p = profileMap[a.user_id];
    return {
      attempt_id: a.id,
      student_id: a.user_id,
      student_name: displayName(p),
      test_name: testNameById[a.practice_test_id] || 'Practice Test',
      finished_at: a.finished_at,
      composite,
      rw_scaled: rwScaled,
      math_scaled: mathScaled,
    };
  });

  // Paginated results
  const paginatedTests = allTests.slice(page * limit, (page + 1) * limit);

  // Summary stats
  const composites = allTests.filter(t => t.composite != null).map(t => t.composite);
  const studentsWithTests = new Set(allTests.map(t => t.student_id)).size;
  const summary = {
    totalStudents: studentIds.length,
    studentsWithTests,
    totalTests,
    avgComposite: composites.length ? Math.round(composites.reduce((s, v) => s + v, 0) / composites.length) : null,
    highestComposite: composites.length ? Math.max(...composites) : null,
    medianComposite: composites.length ? composites.sort((a, b) => a - b)[Math.floor(composites.length / 2)] : null,
  };

  // Score progression per student (for impact analysis)
  // Group tests by student, sorted chronologically
  const testsByStudent = {};
  for (const t of allTests) {
    if (t.composite == null) continue;
    if (!testsByStudent[t.student_id]) testsByStudent[t.student_id] = [];
    testsByStudent[t.student_id].push(t);
  }

  const progressions = [];
  for (const [sid, tests] of Object.entries(testsByStudent)) {
    const sorted = [...tests].sort((a, b) => new Date(a.finished_at) - new Date(b.finished_at));
    const p = profileMap[sid];
    const startRaw = p?.start_date || p?.created_at;
    const startDate = startRaw ? new Date(startRaw) : null;

    // Split tests before/after the student's start date
    const before = startDate ? sorted.filter(t => new Date(t.finished_at) < startDate) : [];
    const after = startDate ? sorted.filter(t => new Date(t.finished_at) >= startDate) : sorted;

    const avgBefore = before.length ? Math.round(before.reduce((s, t) => s + t.composite, 0) / before.length) : null;
    const avgAfter = after.length ? Math.round(after.reduce((s, t) => s + t.composite, 0) / after.length) : null;
    const latest = sorted[sorted.length - 1]?.composite ?? null;
    const first = sorted[0]?.composite ?? null;

    progressions.push({
      student_id: sid,
      student_name: displayName(p),
      target_score: p?.target_sat_score || null,
      start_date: p?.start_date || p?.created_at || null,
      test_count: sorted.length,
      first_score: first,
      latest_score: latest,
      change: first != null && latest != null && sorted.length > 1 ? latest - first : null,
      avg_before: avgBefore,
      avg_after: avgAfter,
      scores: sorted.map(t => ({
        composite: t.composite,
        rw: t.rw_scaled,
        math: t.math_scaled,
        date: t.finished_at,
        test_name: t.test_name,
      })),
    });
  }
  progressions.sort((a, b) => (b.change ?? -9999) - (a.change ?? -9999));

  // Domain mastery from practice test questions
  // Fetch item-level results for all completed tests (limit to last 200 tests for performance)
  const recentTestAttemptIds = completed.slice(0, 200).map(a => a.id);
  let domainMastery = [];

  if (recentTestAttemptIds.length) {
    const { data: moduleAttemptData } = await svc
      .from('practice_test_module_attempts')
      .select('id, practice_test_attempt_id')
      .in('practice_test_attempt_id', recentTestAttemptIds);

    const maIds = (moduleAttemptData || []).map(ma => ma.id);
    let itemAttempts = [];

    if (maIds.length) {
      const { data: items } = await svc
        .from('practice_test_item_attempts')
        .select('practice_test_module_attempt_id, question_id, is_correct')
        .in('practice_test_module_attempt_id', maIds)
        .limit(10000);
      itemAttempts = items || [];
    }

    if (itemAttempts.length) {
      const questionIds = [...new Set(itemAttempts.map(i => i.question_id))];

      // Batch fetch taxonomy in chunks of 1000
      let allTax = [];
      for (let i = 0; i < questionIds.length; i += 1000) {
        const chunk = questionIds.slice(i, i + 1000);
        const { data: taxData } = await svc
          .from('question_taxonomy')
          .select('question_id, domain_code, domain_name, skill_name')
          .in('question_id', chunk);
        allTax = allTax.concat(taxData || []);
      }

      const taxMap = {};
      for (const t of allTax) taxMap[t.question_id] = t;

      // Aggregate by domain and skill
      const domainStats = {};
      for (const item of itemAttempts) {
        const tax = taxMap[item.question_id];
        if (!tax) continue;
        const dName = tax.domain_name || 'Unknown';
        if (!domainStats[dName]) {
          domainStats[dName] = {
            domain_name: dName,
            domain_code: tax.domain_code,
            isEnglish: !MATH_CODES.has(tax.domain_code),
            correct: 0,
            total: 0,
            skills: {},
          };
        }
        domainStats[dName].total++;
        if (item.is_correct) domainStats[dName].correct++;

        const sName = tax.skill_name || 'Unknown';
        if (!domainStats[dName].skills[sName]) {
          domainStats[dName].skills[sName] = { skill_name: sName, correct: 0, total: 0 };
        }
        domainStats[dName].skills[sName].total++;
        if (item.is_correct) domainStats[dName].skills[sName].correct++;
      }

      domainMastery = Object.values(domainStats).map(d => ({
        ...d,
        accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : null,
        skills: Object.values(d.skills)
          .map(s => ({
            ...s,
            accuracy: s.total > 0 ? Math.round((s.correct / s.total) * 100) : null,
          }))
          .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0)),
      })).sort((a, b) => a.domain_name.localeCompare(b.domain_name));
    }
  }

  return NextResponse.json({
    tests: paginatedTests,
    totalTests,
    page,
    limit,
    summary,
    progressions,
    domainMastery,
  });
}
