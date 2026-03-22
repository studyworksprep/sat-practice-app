import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';
import { computeTestScores } from '../../../../lib/testScoreHelper';

const MATH_CODES = new Set(['H', 'P', 'S', 'Q']);

const DIFF_WEIGHT = { 1: 0.6, 2: 1.0, 3: 1.5 };
const BAND_WEIGHT = { 1: 0.7, 2: 0.85, 3: 1.0, 4: 1.15, 5: 1.3, 6: 1.5, 7: 1.7 };
const VOLUME_THRESHOLD = 5;
const VOLUME_CURVE = 0.15;

function computeMastery(attempts) {
  if (!attempts.length) return null;
  let weightedCorrect = 0;
  let weightedTotal = 0;
  for (const a of attempts) {
    const dw = DIFF_WEIGHT[a.difficulty] || 1.0;
    const bw = BAND_WEIGHT[a.score_band] || 1.15;
    const w = dw * bw;
    weightedTotal += w;
    if (a.is_correct) weightedCorrect += w;
  }
  const rawAccuracy = weightedTotal > 0 ? weightedCorrect / weightedTotal : 0;
  const volumeFactor = 1 - Math.exp(-VOLUME_CURVE * attempts.length);
  const recencyBonus = computeRecencyBonus(attempts);
  const mastery = rawAccuracy * volumeFactor * (1 + recencyBonus);
  return Math.min(Math.round(mastery * 100), 100);
}

function computeRecencyBonus(attempts) {
  if (!attempts.length) return 0;
  const now = Date.now();
  const DAY = 86400000;
  let recentCorrect = 0;
  let recentTotal = 0;
  for (const a of attempts) {
    const age = now - new Date(a.created_at).getTime();
    if (age <= 14 * DAY) {
      recentTotal++;
      if (a.is_correct) recentCorrect++;
    }
  }
  if (recentTotal < 3) return 0;
  const recentAcc = recentCorrect / recentTotal;
  return recentAcc > 0.7 ? 0.05 : 0;
}

// GET /api/teacher/dashboard — roster-wide metrics for the teacher dashboard hub
export async function GET() {
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

  // Get student IDs
  let studentIds = [];
  if (role === 'admin') {
    const { data: allStudents } = await supabase
      .from('profiles')
      .select('id')
      .in('role', ['student', 'practice'])
      .neq('is_active', false);
    studentIds = (allStudents || []).map(s => s.id);
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
      students: [],
      recentSessions: [],
      recentTests: [],
      activityByStudent: [],
      rosterMastery: { domains: [], topics: [] },
      upcomingRegistrations: [],
    });
  }

  // Parallel fetch all data
  const svc = createServiceClient();
  const [
    { data: studentProfiles },
    { data: allAttempts },
    { data: completedTests },
    { data: flashcardData },
    { data: registrations },
  ] = await Promise.all([
    svc
      .from('profiles')
      .select('id, email, first_name, last_name, created_at, target_sat_score')
      .in('id', studentIds),
    svc
      .from('attempts')
      .select('id, user_id, question_id, is_correct, created_at, source')
      .in('user_id', studentIds)
      .eq('source', 'practice')
      .order('created_at', { ascending: false })
      .limit(10000),
    svc
      .from('practice_test_attempts')
      .select('id, user_id, practice_test_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
      .in('user_id', studentIds)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(200),
    svc
      .from('flashcard_sets')
      .select('id, user_id')
      .in('user_id', studentIds),
    svc
      .from('sat_test_registrations')
      .select('id, student_id, test_date')
      .in('student_id', studentIds)
      .gte('test_date', new Date().toISOString().split('T')[0])
      .order('test_date', { ascending: true })
      .limit(50),
  ]);

  // Fetch taxonomy only for question IDs that appear in attempts (avoids 50k limit issues)
  const attemptQids = [...new Set((allAttempts || []).map(a => a.question_id).filter(Boolean))];
  let allTax = [];
  if (attemptQids.length > 0) {
    // Supabase .in() has a practical limit, so batch in chunks
    const CHUNK = 1000;
    const taxChunks = await Promise.all(
      Array.from({ length: Math.ceil(attemptQids.length / CHUNK) }, (_, i) =>
        svc
          .from('question_taxonomy')
          .select('question_id, domain_code, domain_name, skill_name, difficulty, score_band')
          .in('question_id', attemptQids.slice(i * CHUNK, (i + 1) * CHUNK))
      )
    );
    for (const { data } of taxChunks) {
      if (data) allTax.push(...data);
    }
  }

  // Get flashcard counts per student
  const flashcardSetIds = (flashcardData || []).map(s => s.id);
  let flashcardCounts = {};
  if (flashcardSetIds.length) {
    const { data: cards } = await svc
      .from('flashcards')
      .select('id, set_id')
      .in('set_id', flashcardSetIds);
    const setOwner = {};
    for (const s of (flashcardData || [])) setOwner[s.id] = s.user_id;
    for (const c of (cards || [])) {
      const owner = setOwner[c.set_id];
      if (owner) flashcardCounts[owner] = (flashcardCounts[owner] || 0) + 1;
    }
  }

  // Build taxonomy map
  const taxMap = {};
  for (const t of (allTax || [])) taxMap[t.question_id] = t;

  // Build student profiles map
  const profileMap = {};
  for (const s of (studentProfiles || [])) profileMap[s.id] = s;

  // ── Recent practice sessions (across all students, last 2 weeks) ──
  const twoWeeksAgo = Date.now() - 14 * 86400000;
  const recentPracticeAttempts = (allAttempts || []).filter(
    a => new Date(a.created_at).getTime() > twoWeeksAgo
  );

  // Group into sessions per student
  const sessionsByStudent = {};
  for (const att of recentPracticeAttempts) {
    if (!sessionsByStudent[att.user_id]) sessionsByStudent[att.user_id] = [];
    sessionsByStudent[att.user_id].push(att);
  }

  const allSessions = [];
  const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
  for (const [uid, atts] of Object.entries(sessionsByStudent)) {
    const sorted = atts.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    let currentSession = null;
    for (const att of sorted) {
      const ts = new Date(att.created_at).getTime();
      if (!currentSession || (currentSession.lastTs - ts) > SESSION_GAP_MS) {
        currentSession = {
          studentId: uid,
          studentName: displayName(profileMap[uid]),
          startedAt: att.created_at,
          lastTs: ts,
          questions: [],
          seenQids: new Set(),
        };
        allSessions.push(currentSession);
      }
      currentSession.lastTs = ts;
      const existing = currentSession.questions.find(q => q.question_id === att.question_id);
      if (!existing) {
        currentSession.seenQids.add(att.question_id);
        const tax = taxMap[att.question_id];
        currentSession.questions.push({
          question_id: att.question_id,
          is_correct: att.is_correct,
          domain_name: tax?.domain_name || null,
          skill_name: tax?.skill_name || null,
          difficulty: tax?.difficulty ?? null,
        });
      } else {
        // Iterating newest-first: older attempt is the true first attempt, use its result
        existing.is_correct = att.is_correct;
      }
    }
  }
  // Sort all sessions by start time, take most recent 20
  allSessions.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt));
  const recentSessions = allSessions.slice(0, 20).map(s => {
    s.questions.reverse();
    const correct = s.questions.filter(q => q.is_correct).length;
    return {
      studentId: s.studentId,
      studentName: s.studentName,
      startedAt: s.startedAt,
      questionCount: s.questions.length,
      correct,
      accuracy: s.questions.length > 0 ? Math.round((correct / s.questions.length) * 100) : null,
      questions: s.questions,
    };
  });

  // ── Recent practice tests (across all students) ──
  const testScores = await computeTestScores(supabase, completedTests);
  const recentTests = testScores.slice(0, 20).map(ts => ({
    ...ts,
    studentId: (completedTests || []).find(ct => ct.id === ts.attempt_id)?.user_id,
    studentName: displayName(profileMap[(completedTests || []).find(ct => ct.id === ts.attempt_id)?.user_id]),
  }));

  // ── Activity by student (last 30 days) ──
  const thirtyDaysAgo = Date.now() - 30 * 86400000;
  const sevenDaysAgo = Date.now() - 7 * 86400000;
  const activityByStudent = studentIds.map(uid => {
    const studentAttempts = (allAttempts || []).filter(a => a.user_id === uid);
    const recent30 = studentAttempts.filter(a => new Date(a.created_at).getTime() > thirtyDaysAgo);
    const recent7 = studentAttempts.filter(a => new Date(a.created_at).getTime() > sevenDaysAgo);
    const practiceQuestions30 = recent30.filter(a => a.source === 'practice').length;
    const practiceTests30 = (completedTests || []).filter(
      t => t.user_id === uid && new Date(t.finished_at).getTime() > thirtyDaysAgo
    ).length;
    const totalQuestions = studentAttempts.length;
    const totalTests = (completedTests || []).filter(t => t.user_id === uid).length;
    const flashcards = flashcardCounts[uid] || 0;
    const lastActive = studentAttempts.length > 0 ? studentAttempts[0].created_at : null;
    const practiceQuestions7 = recent7.filter(a => a.source === 'practice').length;

    return {
      studentId: uid,
      studentName: displayName(profileMap[uid]),
      email: profileMap[uid]?.email,
      targetScore: profileMap[uid]?.target_sat_score,
      totalQuestions,
      totalTests,
      flashcards,
      practiceQuestions30,
      practiceQuestions7,
      practiceTests30,
      lastActive,
    };
  }).sort((a, b) => {
    if (!a.lastActive && !b.lastActive) return 0;
    if (!a.lastActive) return 1;
    if (!b.lastActive) return -1;
    return new Date(b.lastActive) - new Date(a.lastActive);
  });

  // ── Roster-wide mastery by domain and topic ──
  // First-attempt map per student per question
  const firstAttemptsByQuestion = {};
  const sortedAttempts = [...(allAttempts || [])].sort(
    (a, b) => new Date(a.created_at) - new Date(b.created_at)
  );
  for (const att of sortedAttempts) {
    const key = `${att.user_id}::${att.question_id}`;
    if (!firstAttemptsByQuestion[key]) {
      firstAttemptsByQuestion[key] = att;
    }
  }
  const firstAttempts = Object.values(firstAttemptsByQuestion).filter(a => a.source === 'practice');

  // Group by domain and topic
  const domainMasteryMap = {};
  const topicMasteryMap = {};
  for (const att of firstAttempts) {
    const tax = taxMap[att.question_id];
    if (!tax) continue;
    const domain = tax.domain_name || 'Unknown';
    const skill = tax.skill_name || 'Unknown';
    const topicKey = `${domain}::${skill}`;

    const entry = {
      is_correct: att.is_correct,
      difficulty: tax.difficulty,
      score_band: tax.score_band,
      created_at: att.created_at,
    };

    if (!domainMasteryMap[domain]) domainMasteryMap[domain] = { domain_code: tax.domain_code, domain_name: domain, attempts: [] };
    domainMasteryMap[domain].attempts.push(entry);

    if (!topicMasteryMap[topicKey]) topicMasteryMap[topicKey] = { domain_code: tax.domain_code, domain_name: domain, skill_name: skill, attempts: [] };
    topicMasteryMap[topicKey].attempts.push(entry);
  }

  const domainMastery = Object.values(domainMasteryMap).map(d => ({
    domain_code: d.domain_code,
    domain_name: d.domain_name,
    mastery: computeMastery(d.attempts),
    attempted: d.attempts.length,
    correct: d.attempts.filter(a => a.is_correct).length,
    isEnglish: !MATH_CODES.has(d.domain_code),
  })).sort((a, b) => a.domain_name.localeCompare(b.domain_name));

  const topicMastery = Object.values(topicMasteryMap).map(t => ({
    domain_code: t.domain_code,
    domain_name: t.domain_name,
    skill_name: t.skill_name,
    mastery: computeMastery(t.attempts),
    attempted: t.attempts.length,
    correct: t.attempts.filter(a => a.is_correct).length,
  })).sort((a, b) => a.skill_name.localeCompare(b.skill_name));

  // ── Upcoming SAT registrations ──
  const now = Date.now();
  const upcomingRegistrations = (registrations || []).map(r => {
    const testTime = new Date(r.test_date).getTime();
    const daysUntil = Math.ceil((testTime - now) / 86400000);
    return {
      student_id: r.student_id,
      student_name: displayName(profileMap[r.student_id]),
      test_date: r.test_date,
      days_until: daysUntil,
    };
  });

  return NextResponse.json({
    studentCount: studentIds.length,
    recentSessions,
    recentTests,
    activityByStudent,
    rosterMastery: {
      domains: domainMastery,
      topics: topicMastery,
    },
    upcomingRegistrations,
  });
}

function displayName(profile) {
  if (!profile) return 'Student';
  if (profile.first_name || profile.last_name) {
    return [profile.first_name, profile.last_name].filter(Boolean).join(' ');
  }
  if (!profile.email) return 'Student';
  const local = profile.email.split('@')[0];
  return local.replace(/[._-]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
