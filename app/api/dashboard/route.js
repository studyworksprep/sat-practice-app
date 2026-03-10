import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { computeScaledScore } from '../../../lib/scoreConversion';

const subjToSection = {
  RW: 'reading_writing', rw: 'reading_writing',
  M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
};

// Score-band weight: higher bands are harder questions
const BAND_WEIGHT = { 1: 1.0, 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8, 6: 2.0, 7: 2.2 };

// GET /api/dashboard
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // ── Question statuses ──
  const { data: statusRows, error } = await supabase
    .from('question_status')
    .select('question_id, last_is_correct, last_attempt_at')
    .eq('user_id', user.id)
    .eq('is_done', true)
    .order('last_attempt_at', { ascending: false })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  const rows = statusRows || [];

  // ── Taxonomy ──
  const taxMap = {};
  if (rows.length > 0) {
    const ids = [...new Set(rows.map(r => r.question_id))];
    const { data: taxRows, error: taxErr } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_name, difficulty, score_band')
      .in('question_id', ids);
    if (taxErr) return NextResponse.json({ error: taxErr.message }, { status: 400 });
    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
  }

  // ── Domain & topic stats ──
  const domainMap = {};
  const topicMap = {};
  for (const row of rows) {
    const tax = taxMap[row.question_id];
    const domain = tax?.domain_name || 'Unknown';
    const skill = tax?.skill_name || 'Unknown';

    if (!domainMap[domain]) domainMap[domain] = { domain_code: tax?.domain_code || '', domain_name: domain, attempted: 0, correct: 0 };
    domainMap[domain].attempted++;
    if (row.last_is_correct) domainMap[domain].correct++;

    const key = `${domain}::${skill}`;
    if (!topicMap[key]) topicMap[key] = { domain_code: tax?.domain_code || '', domain_name: domain, skill_name: skill, attempted: 0, correct: 0 };
    topicMap[key].attempted++;
    if (row.last_is_correct) topicMap[key].correct++;
  }
  const domainStats = Object.values(domainMap).sort((a, b) => a.domain_name.localeCompare(b.domain_name));
  const topicStats = Object.values(topicMap).sort((a, b) => a.skill_name.localeCompare(b.skill_name));

  // ── Weighted strongest/weakest topics ──
  const weightedTopics = {};
  for (const row of rows) {
    const tax = taxMap[row.question_id];
    const skill = tax?.skill_name || 'Unknown';
    const domain = tax?.domain_name || 'Unknown';
    const band = tax?.score_band || 4;
    const w = BAND_WEIGHT[band] || 1.5;
    const key = `${domain}::${skill}`;
    if (!weightedTopics[key]) weightedTopics[key] = { skill_name: skill, domain_name: domain, weightedCorrect: 0, weightedTotal: 0, rawCount: 0 };
    weightedTopics[key].weightedTotal += w;
    weightedTopics[key].rawCount += 1;
    if (row.last_is_correct) weightedTopics[key].weightedCorrect += w;
  }

  const qualifiedTopics = Object.values(weightedTopics).filter(t => t.rawCount >= 3);
  const sorted = qualifiedTopics.map(t => ({
    ...t,
    weightedPct: Math.round((t.weightedCorrect / t.weightedTotal) * 100),
  })).sort((a, b) => b.weightedPct - a.weightedPct);

  const strongest = sorted[0] || null;
  const weakest = sorted.length > 1 ? sorted[sorted.length - 1] : null;

  // ── Recent accuracy (last 50) ──
  const recent50 = rows.slice(0, 50);
  const recentCorrect = recent50.filter(r => r.last_is_correct).length;
  const recentAccuracy = recent50.length > 0 ? Math.round((recentCorrect / recent50.length) * 100) : null;

  // ── Recent practice sessions (grouped by time proximity) ──
  const { data: recentAttempts } = await supabase
    .from('attempts')
    .select('id, question_id, is_correct, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200);

  // Fetch taxonomy for any question_ids not already in taxMap
  const attemptQids = [...new Set((recentAttempts || []).map(a => a.question_id))];
  const missingQids = attemptQids.filter(qid => !taxMap[qid]);
  if (missingQids.length > 0) {
    const { data: extraTax } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_name, difficulty, score_band')
      .in('question_id', missingQids);
    for (const t of (extraTax || [])) taxMap[t.question_id] = t;
  }

  const sessions = [];
  let currentSession = null;
  const SESSION_GAP_MS = 2 * 60 * 60 * 1000;

  for (const att of recentAttempts || []) {
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
  const recentSessions = sessions.slice(0, 5);

  // ── Practice test scores (last 4 completed) ──
  const { data: completedAttempts } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, status, metadata, started_at, finished_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('finished_at', { ascending: false })
    .limit(4);

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

  // ── Profile (target score + student info) ──
  const { data: profile } = await supabase
    .from('profiles')
    .select('target_sat_score, first_name, last_name, high_school, graduation_year, sat_test_date')
    .eq('id', user.id)
    .maybeSingle();

  const targetScore = profile?.target_sat_score || null;

  // ── Teacher name (from teacher_student_assignments) ──
  let teacherName = null;
  {
    const { data: tsa } = await supabase
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('student_id', user.id)
      .limit(1)
      .maybeSingle();
    if (tsa?.teacher_id) {
      const { data: teacherProfile } = await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', tsa.teacher_id)
        .maybeSingle();
      if (teacherProfile) {
        teacherName = [teacherProfile.first_name, teacherProfile.last_name].filter(Boolean).join(' ') || teacherProfile.email?.split('@')[0] || null;
      }
    }
  }

  // ── Streak calculation ──
  const practiceDays = new Set();
  for (const att of recentAttempts || []) {
    const d = new Date(att.created_at);
    practiceDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  for (const r of rows) {
    if (r.last_attempt_at) {
      const d = new Date(r.last_attempt_at);
      practiceDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
    }
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const practicedToday = practiceDays.has(todayStr);

  let currentStreak = 0;
  let checkDate = new Date(today);
  if (!practiceDays.has(todayStr)) {
    checkDate.setDate(checkDate.getDate() - 1);
  }
  for (let i = 0; i < 365; i++) {
    const dateStr = `${checkDate.getFullYear()}-${String(checkDate.getMonth() + 1).padStart(2, '0')}-${String(checkDate.getDate()).padStart(2, '0')}`;
    if (practiceDays.has(dateStr)) {
      currentStreak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      break;
    }
  }

  // ── Daily activity (last 14 days) ──
  const dailyActivity = [];
  {
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      dailyActivity.push({ date: dateStr, attempted: 0, correct: 0 });
    }
    const dayIndex = {};
    for (let i = 0; i < dailyActivity.length; i++) dayIndex[dailyActivity[i].date] = i;

    for (const row of rows) {
      if (!row.last_attempt_at) continue;
      const d = new Date(row.last_attempt_at);
      const ds = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (dayIndex[ds] !== undefined) {
        dailyActivity[dayIndex[ds]].attempted++;
        if (row.last_is_correct) dailyActivity[dayIndex[ds]].correct++;
      }
    }
  }

  // ── Goal progress ──
  const goalProgress = targetScore && highestTestScore
    ? Math.min(100, Math.round((highestTestScore / targetScore) * 100))
    : null;
  const pointsToGoal = targetScore && highestTestScore
    ? Math.max(0, targetScore - highestTestScore)
    : null;

  // ── Topic recommendations (top 3 weak topics) ──
  const weakTopics = sorted.length > 1
    ? sorted.slice(-3).reverse().map(t => ({
        skill_name: t.skill_name,
        domain_name: t.domain_name,
        weightedPct: t.weightedPct,
        rawCount: t.rawCount,
      }))
    : [];

  return NextResponse.json({
    domainStats,
    topicStats,
    totalAttempted: rows.length,
    totalCorrect: rows.filter(r => r.last_is_correct).length,
    strongest,
    weakest,
    recentAccuracy,
    recentSessions,
    testScores,
    highestTestScore,
    targetScore,
    currentStreak,
    practicedToday,
    goalProgress,
    pointsToGoal,
    weakTopics,
    dailyActivity,
    studentProfile: {
      firstName: profile?.first_name || null,
      lastName: profile?.last_name || null,
      school: profile?.high_school || null,
      graduationYear: profile?.graduation_year || null,
      satTestDate: profile?.sat_test_date || null,
    },
    teacherName,
  });
}
