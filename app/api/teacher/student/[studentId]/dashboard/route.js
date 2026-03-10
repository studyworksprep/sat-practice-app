import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';
import { computeScaledScore } from '../../../../../../lib/scoreConversion';

const subjToSection = {
  RW: 'reading_writing', rw: 'reading_writing',
  M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
};

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);

const BAND_WEIGHT = { 1: 1.0, 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8, 6: 2.0, 7: 2.2 };

// GET /api/teacher/student/[studentId]/dashboard
export async function GET(_request, { params }) {
  const { studentId } = params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Check role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (profile?.role !== 'teacher' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // For teachers, verify they can view this student
  if (profile.role === 'teacher') {
    const { data: assignment } = await supabase
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('teacher_id', user.id)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!assignment) {
      // Check class enrollments too
      const { data: classes } = await supabase
        .from('classes')
        .select('id')
        .eq('teacher_id', user.id);

      const classIds = (classes || []).map(c => c.id);
      let hasAccess = false;
      if (classIds.length) {
        const { data: enrollment } = await supabase
          .from('class_enrollments')
          .select('student_id')
          .in('class_id', classIds)
          .eq('student_id', studentId)
          .maybeSingle();
        hasAccess = !!enrollment;
      }

      if (!hasAccess) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
    }
  }

  // Fetch student profile
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('id, email, role, created_at, first_name, last_name, high_school, graduation_year, target_sat_score')
    .eq('id', studentId)
    .maybeSingle();

  if (!studentProfile) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // ── All attempts (ordered oldest-first so first occurrence = first attempt) ──
  const { data: allAttempts } = await supabase
    .from('attempts')
    .select('id, question_id, is_correct, created_at')
    .eq('user_id', studentId)
    .order('created_at', { ascending: true })
    .limit(5000);

  // ── Taxonomy for all attempted questions ──
  const taxMap = {};
  const allQids = [...new Set((allAttempts || []).map(a => a.question_id))];
  if (allQids.length > 0) {
    const { data: taxRows } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_name, difficulty, score_band')
      .in('question_id', allQids);
    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
  }

  // ── First attempt per question (source of truth for accuracy) ──
  const firstAttemptMap = new Map();
  for (const a of (allAttempts || [])) {
    if (!firstAttemptMap.has(a.question_id)) {
      firstAttemptMap.set(a.question_id, a);
    }
  }
  const firstAttempts = [...firstAttemptMap.values()];

  // ── Domain & topic stats (from first attempts only, with per-difficulty breakdown) ──
  const newDiffBucket = () => ({ 1: { attempted: 0, correct: 0 }, 2: { attempted: 0, correct: 0 }, 3: { attempted: 0, correct: 0 } });
  const domainMap = {};
  const topicMap = {};
  for (const att of firstAttempts) {
    const tax = taxMap[att.question_id];
    const domain = tax?.domain_name || 'Unknown';
    const skill = tax?.skill_name || 'Unknown';
    const diff = tax?.difficulty || 0;

    if (!domainMap[domain]) domainMap[domain] = { domain_code: tax?.domain_code || '', domain_name: domain, attempted: 0, correct: 0, byDifficulty: newDiffBucket() };
    domainMap[domain].attempted++;
    if (att.is_correct) domainMap[domain].correct++;
    if (diff >= 1 && diff <= 3) {
      domainMap[domain].byDifficulty[diff].attempted++;
      if (att.is_correct) domainMap[domain].byDifficulty[diff].correct++;
    }

    const key = `${domain}::${skill}`;
    if (!topicMap[key]) topicMap[key] = { domain_code: tax?.domain_code || '', domain_name: domain, skill_name: skill, attempted: 0, correct: 0, byDifficulty: newDiffBucket() };
    topicMap[key].attempted++;
    if (att.is_correct) topicMap[key].correct++;
    if (diff >= 1 && diff <= 3) {
      topicMap[key].byDifficulty[diff].attempted++;
      if (att.is_correct) topicMap[key].byDifficulty[diff].correct++;
    }
  }
  const domainStats = Object.values(domainMap).sort((a, b) => a.domain_name.localeCompare(b.domain_name));
  const topicStats = Object.values(topicMap).sort((a, b) => a.skill_name.localeCompare(b.skill_name));

  // ── Weighted strongest/weakest (from first attempts) ──
  const weightedTopics = {};
  for (const att of firstAttempts) {
    const tax = taxMap[att.question_id];
    const skill = tax?.skill_name || 'Unknown';
    const domain = tax?.domain_name || 'Unknown';
    const band = tax?.score_band || 4;
    const w = BAND_WEIGHT[band] || 1.5;
    const key = `${domain}::${skill}`;
    if (!weightedTopics[key]) weightedTopics[key] = { skill_name: skill, domain_name: domain, weightedCorrect: 0, weightedTotal: 0, rawCount: 0 };
    weightedTopics[key].weightedTotal += w;
    weightedTopics[key].rawCount += 1;
    if (att.is_correct) weightedTopics[key].weightedCorrect += w;
  }
  const qualifiedTopics = Object.values(weightedTopics).filter(t => t.rawCount >= 3);
  const sorted = qualifiedTopics.map(t => ({
    ...t,
    weightedPct: Math.round((t.weightedCorrect / t.weightedTotal) * 100),
  })).sort((a, b) => b.weightedPct - a.weightedPct);
  const strongest = sorted[0] || null;
  const weakest = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  // ── Recent accuracy (most recent 50 unique questions, first-attempt result) ──
  const recent50 = firstAttempts.slice(-50);
  const recentCorrect = recent50.filter(a => a.is_correct).length;
  const recentAccuracy = recent50.length > 0 ? Math.round((recentCorrect / recent50.length) * 100) : null;

  // ── Recent practice sessions (iterate newest-first for first-attempt logic) ──
  const recentAttempts = [...(allAttempts || [])].reverse();

  const sessions = [];
  let currentSession = null;
  const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
  for (const att of recentAttempts) {
    const ts = new Date(att.created_at).getTime();
    if (!currentSession || (currentSession.lastTs - ts) > SESSION_GAP_MS) {
      currentSession = { startedAt: att.created_at, lastTs: ts, questions: [] };
      sessions.push(currentSession);
    }
    currentSession.lastTs = ts;
    const existing = currentSession.questions.find(q => q.question_id === att.question_id);
    if (!existing) {
      const tax = taxMap[att.question_id];
      currentSession.questions.push({
        question_id: att.question_id,
        is_correct: att.is_correct,
        domain_name: tax?.domain_name || null,
        domain_code: tax?.domain_code || null,
        skill_name: tax?.skill_name || null,
        difficulty: tax?.difficulty ?? null,
      });
    } else {
      // Iterating newest-first: older attempt is the true first attempt, use its result
      existing.is_correct = att.is_correct;
    }
  }
  for (const s of sessions) {
    s.questions.reverse();
    delete s.lastTs;
  }
  const recentSessions = sessions.slice(0, 10);

  // ── Practice test scores ──
  const { data: completedAttempts } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, status, metadata, started_at, finished_at')
    .eq('user_id', studentId)
    .eq('status', 'completed')
    .order('finished_at', { ascending: false })
    .limit(10);

  let testScores = [];
  if (completedAttempts?.length) {
    const testIds = [...new Set(completedAttempts.map(a => a.practice_test_id))];
    const { data: tests } = await supabase.from('practice_tests').select('id, name').in('id', testIds);
    const testNameById = {};
    for (const t of tests || []) testNameById[t.id] = t.name;

    const attemptIds = completedAttempts.map(a => a.id);
    const { data: moduleAttempts } = await supabase
      .from('practice_test_module_attempts')
      .select('practice_test_attempt_id, practice_test_module_id, correct_count')
      .in('practice_test_attempt_id', attemptIds);

    const modIds = [...new Set((moduleAttempts || []).map(ma => ma.practice_test_module_id))];
    const { data: mods } = modIds.length
      ? await supabase.from('practice_test_modules').select('id, subject_code, module_number, route_code').in('id', modIds)
      : { data: [] };

    const modById = {};
    for (const m of mods || []) modById[m.id] = m;

    const { data: lookupRows } = await supabase
      .from('score_conversion')
      .select('test_id, section, module1_correct, module2_correct, scaled_score')
      .in('test_id', testIds);

    const lookupByTestSection = {};
    for (const row of lookupRows || []) {
      const key = `${row.test_id}/${row.section}`;
      if (!lookupByTestSection[key]) lookupByTestSection[key] = [];
      lookupByTestSection[key].push(row);
    }

    const maByPta = {};
    for (const ma of moduleAttempts || []) {
      const mod = modById[ma.practice_test_module_id];
      if (!mod) continue;
      if (!maByPta[ma.practice_test_attempt_id]) maByPta[ma.practice_test_attempt_id] = {};
      maByPta[ma.practice_test_attempt_id][`${mod.subject_code}/${mod.module_number}`] = {
        correct: ma.correct_count || 0,
        routeCode: mod.route_code,
        subjectCode: mod.subject_code,
      };
    }

    testScores = completedAttempts.map(a => {
      const modData = maByPta[a.id] || {};
      const subjects = [...new Set(Object.values(modData).map(d => d.subjectCode))];
      const sections = {};
      let composite = null;

      for (const subj of subjects) {
        const m1 = modData[`${subj}/1`] || { correct: 0 };
        const m2 = modData[`${subj}/2`] || { correct: 0, routeCode: null };
        const sectionName = subjToSection[subj] || 'math';
        const lookupKey = `${a.practice_test_id}/${sectionName}`;

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

      return {
        attempt_id: a.id,
        test_name: testNameById[a.practice_test_id] || 'Practice Test',
        finished_at: a.finished_at,
        composite,
        sections,
      };
    });
  }

  const highestTestScore = testScores.length > 0
    ? Math.max(...testScores.map(t => t.composite).filter(Boolean))
    : null;

  // ── Total questions available per domain and topic (unique question_ids, with per-difficulty) ──
  // Paginate because Supabase caps rows per request at ~1000
  let allTax = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_name, skill_name, difficulty')
      .range(from, from + 999);
    allTax = allTax.concat(data || []);
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  const newAvailSets = () => ({ all: new Set(), 1: new Set(), 2: new Set(), 3: new Set() });
  const domainAvail = {};
  const topicAvail = {};
  for (const dc of allTax) {
    const domain = dc.domain_name || 'Unknown';
    const skill = dc.skill_name || 'Unknown';
    const topicKey = `${domain}::${skill}`;
    const diff = dc.difficulty || 0;
    if (!domainAvail[domain]) domainAvail[domain] = newAvailSets();
    if (!topicAvail[topicKey]) topicAvail[topicKey] = newAvailSets();
    domainAvail[domain].all.add(dc.question_id);
    topicAvail[topicKey].all.add(dc.question_id);
    if (diff >= 1 && diff <= 3) {
      domainAvail[domain][diff].add(dc.question_id);
      topicAvail[topicKey][diff].add(dc.question_id);
    }
  }

  const availToObj = (sets) => ({
    totalAvailable: sets?.all.size || 0,
    availByDifficulty: { 1: sets?.[1].size || 0, 2: sets?.[2].size || 0, 3: sets?.[3].size || 0 },
  });

  // Add total available to domain and topic stats
  const domainStatsWithTotal = domainStats.map(d => ({
    ...d,
    ...availToObj(domainAvail[d.domain_name]),
  }));
  const topicStatsWithTotal = topicStats.map(t => ({
    ...t,
    ...availToObj(topicAvail[`${t.domain_name}::${t.skill_name}`]),
  }));

  // ── SAT registrations & official scores ──
  const { data: satRegistrations } = await supabase
    .from('sat_test_registrations')
    .select('id, test_date, created_at')
    .eq('student_id', studentId)
    .order('test_date', { ascending: true });

  const { data: satScores } = await supabase
    .from('sat_official_scores')
    .select('id, test_date, rw_score, math_score, composite_score, created_at')
    .eq('student_id', studentId)
    .order('test_date', { ascending: false });

  return NextResponse.json({
    student: studentProfile,
    satRegistrations: satRegistrations || [],
    officialScores: satScores || [],
    domainStats: domainStatsWithTotal,
    topicStats: topicStatsWithTotal,
    totalAttempted: firstAttempts.length,
    totalCorrect: firstAttempts.filter(a => a.is_correct).length,
    strongest,
    weakest,
    recentAccuracy,
    recentSessions,
    testScores,
    highestTestScore,
  });
}
