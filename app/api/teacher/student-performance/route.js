import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';

// GET /api/teacher/student-performance
// Returns aggregate student performance stats scoped to the teacher's roster.
// Same shape as the admin student-performance endpoint but filtered to assigned students.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle();

  if (!profile || !['admin', 'manager', 'teacher'].includes(profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // ── Get student IDs for this teacher's roster ──
  const svc = createServiceClient();
  let studentIds = [];

  if (profile.role === 'admin') {
    const { data } = await svc.from('profiles').select('id').eq('role', 'student').eq('is_active', true).limit(5000);
    studentIds = (data || []).map(p => p.id);
  } else {
    // Teachers and managers: get directly assigned students + class enrollments
    const [{ data: directAssigns }, { data: classes }] = await Promise.all([
      svc.from('teacher_student_assignments').select('student_id').eq('teacher_id', user.id),
      svc.from('classes').select('id').eq('teacher_id', user.id),
    ]);

    const idSet = new Set((directAssigns || []).map(a => a.student_id));
    const classIds = (classes || []).map(c => c.id);
    if (classIds.length) {
      const { data: enrollments } = await svc.from('class_enrollments').select('student_id').in('class_id', classIds);
      for (const e of (enrollments || [])) idSet.add(e.student_id);
    }
    studentIds = [...idSet];
  }

  if (!studentIds.length) {
    return NextResponse.json({
      overallAccuracy: { current: null, previous: null, totalAttempts: 0, domains: [] },
      hardestQuestions: [],
      easiestQuestions: [],
      scoreDistribution: { buckets: [], totalTests: 0, avgComposite: null, avgRW: null, avgMath: null },
      skillHeatmap: [],
      studentCount: 0,
    });
  }

  // ── 1) Overall Accuracy (first-attempt, last 30 days) ──
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d60 = new Date(); d60.setDate(d60.getDate() - 60);

  // Batch fetch attempts per student to avoid row limits
  let recentAttempts = [];
  let prevAttempts = [];
  const BATCH = 20;
  for (let i = 0; i < studentIds.length; i += BATCH) {
    const batch = studentIds.slice(i, i + BATCH);
    const [{ data: recent }, { data: prev }] = await Promise.all([
      svc.from('attempts').select('user_id, question_id, is_correct, created_at')
        .in('user_id', batch).gte('created_at', d30.toISOString())
        .order('created_at', { ascending: true }).limit(10000),
      svc.from('attempts').select('user_id, question_id, is_correct, created_at')
        .in('user_id', batch).gte('created_at', d60.toISOString()).lt('created_at', d30.toISOString())
        .order('created_at', { ascending: true }).limit(10000),
    ]);
    if (recent) recentAttempts.push(...recent);
    if (prev) prevAttempts.push(...prev);
  }

  // Deduplicate to first attempt per user+question
  const dedupeFirst = (attempts) => {
    const seen = new Set();
    const result = [];
    for (const a of attempts) {
      const key = `${a.user_id}:${a.question_id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(a);
    }
    return result;
  };

  const firstAttempts = dedupeFirst(recentAttempts);
  const prevFirstAttempts = dedupeFirst(prevAttempts);

  const totalFirst = firstAttempts.length;
  const correctFirst = firstAttempts.filter(a => a.is_correct).length;
  const overallAccuracy = totalFirst > 0 ? Math.round((correctFirst / totalFirst) * 100) : null;

  const prevTotal = prevFirstAttempts.length;
  const prevCorrect = prevFirstAttempts.filter(a => a.is_correct).length;
  const prevAccuracy = prevTotal > 0 ? Math.round((prevCorrect / prevTotal) * 100) : null;

  // Accuracy by domain
  const questionIds = [...new Set(firstAttempts.map(a => a.question_id))];
  const taxMap = {};
  for (let i = 0; i < questionIds.length; i += 500) {
    const chunk = questionIds.slice(i, i + 500);
    const { data: taxRows } = await svc.from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_code, skill_name')
      .in('question_id', chunk);
    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
  }

  const domainAccuracy = {};
  const skillMap = {};
  for (const a of firstAttempts) {
    const tax = taxMap[a.question_id];
    if (!tax) continue;

    // Domain accuracy
    if (!domainAccuracy[tax.domain_code]) {
      domainAccuracy[tax.domain_code] = { domain_code: tax.domain_code, domain_name: tax.domain_name, total: 0, correct: 0 };
    }
    domainAccuracy[tax.domain_code].total++;
    if (a.is_correct) domainAccuracy[tax.domain_code].correct++;

    // Skill heatmap
    if (tax.skill_code) {
      if (!skillMap[tax.skill_code]) {
        skillMap[tax.skill_code] = { skill_code: tax.skill_code, skill_name: tax.skill_name, domain_code: tax.domain_code, domain_name: tax.domain_name, total: 0, correct: 0 };
      }
      skillMap[tax.skill_code].total++;
      if (a.is_correct) skillMap[tax.skill_code].correct++;
    }
  }

  const domains = Object.values(domainAccuracy).map(d => ({
    ...d, accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : null,
  }));

  const skills = Object.values(skillMap)
    .filter(s => s.total >= 3)
    .map(s => ({ ...s, accuracy: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);

  // ── 2) Score Distribution ──
  const { data: testScores } = await svc
    .from('practice_test_attempts')
    .select('composite_score, rw_scaled, math_scaled')
    .in('user_id', studentIds)
    .eq('status', 'completed')
    .not('composite_score', 'is', null);

  const buckets = [];
  for (let lo = 400; lo <= 1500; lo += 100) {
    buckets.push({ range: `${lo}-${lo + 99}`, lo, hi: lo + 99, count: 0 });
  }
  let avgComposite = null, avgRW = null, avgMath = null;
  const scores = testScores || [];
  if (scores.length) {
    let sumC = 0, sumR = 0, sumM = 0, nR = 0, nM = 0;
    for (const s of scores) {
      sumC += s.composite_score;
      if (s.rw_scaled) { sumR += s.rw_scaled; nR++; }
      if (s.math_scaled) { sumM += s.math_scaled; nM++; }
      for (const b of buckets) {
        if (s.composite_score >= b.lo && s.composite_score <= b.hi) { b.count++; break; }
      }
    }
    avgComposite = Math.round(sumC / scores.length);
    avgRW = nR > 0 ? Math.round(sumR / nR) : null;
    avgMath = nM > 0 ? Math.round(sumM / nM) : null;
  }

  // ── 3) Hardest/Easiest Questions (from roster's own attempts only) ──
  const hardestEasiest = computeHardestEasiestFromAttempts(firstAttempts, taxMap);

  return NextResponse.json({
    overallAccuracy: { current: overallAccuracy, previous: prevAccuracy, totalAttempts: totalFirst, domains },
    hardestQuestions: hardestEasiest.hardest,
    easiestQuestions: hardestEasiest.easiest,
    scoreDistribution: {
      buckets: buckets.filter(b => b.count > 0 || (b.lo >= 600 && b.lo <= 1400)),
      totalTests: scores.length,
      avgComposite, avgRW, avgMath,
    },
    skillHeatmap: skills,
    studentCount: studentIds.length,
  });
}

function computeHardestEasiestFromAttempts(firstAttempts, taxMap) {
  if (!firstAttempts.length) return { hardest: [], easiest: [] };

  // Aggregate per question from the roster's first attempts
  const byQuestion = {};
  for (const a of firstAttempts) {
    if (!byQuestion[a.question_id]) byQuestion[a.question_id] = { total: 0, correct: 0 };
    byQuestion[a.question_id].total++;
    if (a.is_correct) byQuestion[a.question_id].correct++;
  }

  // Filter to questions with enough attempts, compute accuracy
  const scored = Object.entries(byQuestion)
    .filter(([, q]) => q.total >= 3)
    .map(([qid, q]) => ({
      question_id: qid,
      attempt_count: q.total,
      correct_count: q.correct,
      accuracy: Math.round((q.correct / q.total) * 100),
    }));

  scored.sort((a, b) => a.accuracy - b.accuracy);
  const hardest = scored.slice(0, 10);
  const easiest = scored.slice(-10).reverse();

  const enrichQ = (q) => {
    const tax = taxMap[q.question_id] || {};
    return {
      question_id: q.question_id,
      question_uuid: q.question_id,
      attempt_count: q.attempt_count,
      correct_count: q.correct_count,
      accuracy: q.accuracy,
      domain_name: tax.domain_name || null,
      skill_name: tax.skill_name || null,
      difficulty: tax.difficulty ?? null,
    };
  };

  return { hardest: hardest.map(enrichQ), easiest: easiest.map(enrichQ) };
}
