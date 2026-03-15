import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';
import { computeTestScores } from '../../../../../../lib/testScoreHelper';

const BAND_WEIGHT = { 1: 1.0, 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8, 6: 2.0, 7: 2.2 };

// GET /api/teacher/student/[studentId]/stats — extended analytics for teacher view
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

  if (profile?.role !== 'teacher' && profile?.role !== 'manager' && profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // For teachers, verify they can view this student
  if (profile.role === 'teacher' || profile.role === 'manager') {
    const { data: assignment } = await supabase
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('teacher_id', user.id)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!assignment) {
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
    .select('id, email, role, first_name, last_name')
    .eq('id', studentId)
    .maybeSingle();

  if (!studentProfile) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // ── All attempts with time data (oldest-first so first occurrence = first attempt) ──
  // Only include practice attempts (not practice_test or review)
  const { data: allAttempts, error } = await supabase
    .from('attempts')
    .select('id, question_id, is_correct, created_at, time_spent_ms')
    .eq('user_id', studentId)
    .eq('source', 'practice')
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

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

  // ── Enrich first attempts with taxonomy ──
  const enrichedAttempts = firstAttempts.map(a => {
    const tax = taxMap[a.question_id] || {};
    return {
      question_id: a.question_id,
      is_correct: a.is_correct,
      created_at: a.created_at,
      time_spent_ms: a.time_spent_ms || 0,
      difficulty: tax.difficulty ?? null,
      domain_name: tax.domain_name || null,
      domain_code: tax.domain_code || null,
      skill_name: tax.skill_name || null,
      score_band: tax.score_band ?? null,
    };
  });

  // ── Domain & topic stats (from first attempts only) ──
  const domainMap = {};
  const topicMap = {};
  for (const att of firstAttempts) {
    const tax = taxMap[att.question_id];
    const domain = tax?.domain_name || 'Unknown';
    const skill = tax?.skill_name || 'Unknown';

    if (!domainMap[domain]) domainMap[domain] = { domain_code: tax?.domain_code || '', domain_name: domain, attempted: 0, correct: 0 };
    domainMap[domain].attempted++;
    if (att.is_correct) domainMap[domain].correct++;

    const key = `${domain}::${skill}`;
    if (!topicMap[key]) topicMap[key] = { domain_code: tax?.domain_code || '', domain_name: domain, skill_name: skill, attempted: 0, correct: 0 };
    topicMap[key].attempted++;
    if (att.is_correct) topicMap[key].correct++;
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

  // ── Practice sessions (iterate newest-first for first-attempt logic) ──
  const attemptsCopy = [...(allAttempts || [])].reverse();
  const SESSION_GAP_MS = 2 * 60 * 60 * 1000;
  const sessions = [];
  let currentSession = null;
  for (const att of attemptsCopy) {
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
      existing.is_correct = att.is_correct;
    }
  }
  for (const s of sessions) {
    s.questions.reverse();
    delete s.lastTs;
  }
  const recentSessions = sessions.slice(0, 5);

  // ── Practice test scores ──
  const { data: completedAttempts } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
    .eq('user_id', studentId)
    .eq('status', 'completed')
    .order('finished_at', { ascending: false })
    .limit(20);

  const testScores = await computeTestScores(supabase, completedAttempts);

  const highestTestScore = testScores.length > 0
    ? Math.max(...testScores.map(t => t.composite).filter(Boolean))
    : null;

  return NextResponse.json({
    student: studentProfile,
    domainStats,
    topicStats,
    totalAttempted: firstAttempts.length,
    totalCorrect: firstAttempts.filter(a => a.is_correct).length,
    strongest,
    weakest,
    recentAccuracy,
    recentSessions,
    testScores,
    highestTestScore,
    enrichedAttempts,
  });
}
