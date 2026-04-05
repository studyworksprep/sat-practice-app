import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/admin/student-performance
// Returns aggregate student performance data for the admin dashboard.
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

  // ── 1) Overall Accuracy (first-attempt, last 30 days) ──────────
  const d30 = new Date(); d30.setDate(d30.getDate() - 30);
  const d60 = new Date(); d60.setDate(d60.getDate() - 60);

  // Get first attempts per user+question in last 30d.
  // We approximate "first attempt" by looking at attempts where the user's
  // question_status.attempts_count was 1 at the time — but since we can't
  // know that retroactively, we use the attempts table directly and group.
  // For efficiency, we pull recent attempts and deduplicate to first per user+question.
  const { data: recentAttempts } = await supabase
    .from('attempts')
    .select('user_id, question_id, is_correct, created_at')
    .gte('created_at', d30.toISOString())
    .order('created_at', { ascending: true })
    .limit(10000);

  // Deduplicate to first attempt per user+question
  const seen = new Set();
  const firstAttempts = [];
  for (const a of recentAttempts || []) {
    const key = `${a.user_id}:${a.question_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    firstAttempts.push(a);
  }

  const totalFirst = firstAttempts.length;
  const correctFirst = firstAttempts.filter(a => a.is_correct).length;
  const overallAccuracy = totalFirst > 0 ? Math.round((correctFirst / totalFirst) * 100) : null;

  // Previous 30-day window for trend
  const { data: prevAttempts } = await supabase
    .from('attempts')
    .select('user_id, question_id, is_correct, created_at')
    .gte('created_at', d60.toISOString())
    .lt('created_at', d30.toISOString())
    .order('created_at', { ascending: true })
    .limit(10000);

  const seenPrev = new Set();
  let prevTotal = 0, prevCorrect = 0;
  for (const a of prevAttempts || []) {
    const key = `${a.user_id}:${a.question_id}`;
    if (seenPrev.has(key)) continue;
    seenPrev.add(key);
    prevTotal++;
    if (a.is_correct) prevCorrect++;
  }
  const prevAccuracy = prevTotal > 0 ? Math.round((prevCorrect / prevTotal) * 100) : null;

  // Accuracy by domain — need taxonomy join
  const questionIds = [...new Set(firstAttempts.map(a => a.question_id))];
  const domainAccuracy = {};

  if (questionIds.length > 0) {
    // Batch fetch taxonomy in chunks
    const taxMap = {};
    for (let i = 0; i < questionIds.length; i += 500) {
      const chunk = questionIds.slice(i, i + 500);
      const { data: taxRows } = await supabase
        .from('question_taxonomy')
        .select('question_id, domain_code, domain_name')
        .in('question_id', chunk);
      for (const t of taxRows || []) {
        taxMap[t.question_id] = t;
      }
    }

    for (const a of firstAttempts) {
      const tax = taxMap[a.question_id];
      if (!tax) continue;
      const code = tax.domain_code;
      if (!domainAccuracy[code]) {
        domainAccuracy[code] = { domain_code: code, domain_name: tax.domain_name, total: 0, correct: 0 };
      }
      domainAccuracy[code].total++;
      if (a.is_correct) domainAccuracy[code].correct++;
    }
  }

  const domains = Object.values(domainAccuracy).map(d => ({
    ...d,
    accuracy: d.total > 0 ? Math.round((d.correct / d.total) * 100) : null,
  }));

  // ── 2) Hardest & Easiest Questions ─────────────────────────────
  // Use attempt_count/correct_count on question_versions (min 5 attempts)
  const { data: qvRows } = await supabase
    .from('question_versions')
    .select('id, question_id, attempt_count, correct_count, questions!inner(question_id)')
    .eq('is_current', true)
    .gte('attempt_count', 5)
    .order('attempt_count', { ascending: false })
    .limit(2000);

  const scored = (qvRows || []).map(qv => ({
    ...qv,
    display_question_id: qv.questions?.question_id || null,
    accuracy: Math.round((qv.correct_count / qv.attempt_count) * 100),
  }));

  scored.sort((a, b) => a.accuracy - b.accuracy);
  const hardest = scored.slice(0, 10);
  const easiest = scored.slice(-10).reverse();

  // Enrich with taxonomy
  const enrichIds = [...new Set([...hardest, ...easiest].map(q => q.question_id))];
  const enrichTax = {};
  if (enrichIds.length > 0) {
    const { data: taxRows } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_name, difficulty')
      .in('question_id', enrichIds);
    for (const t of taxRows || []) enrichTax[t.question_id] = t;
  }

  const enrichQ = (q) => {
    const tax = enrichTax[q.question_id] || {};
    return {
      question_id: q.display_question_id || q.question_id,
      question_uuid: q.question_id,
      attempt_count: q.attempt_count,
      correct_count: q.correct_count,
      accuracy: q.accuracy,
      domain_name: tax.domain_name || null,
      skill_name: tax.skill_name || null,
      difficulty: tax.difficulty ?? null,
    };
  };

  // ── 3) Score Distribution (practice tests) ─────────────────────
  const { data: testScores } = await supabase
    .from('practice_test_attempts')
    .select('composite_score, rw_scaled, math_scaled')
    .eq('status', 'completed')
    .not('composite_score', 'is', null);

  // Build histogram buckets: 400-1600 in 100-point increments
  const buckets = [];
  for (let lo = 400; lo <= 1500; lo += 100) {
    buckets.push({ range: `${lo}-${lo + 99}`, lo, hi: lo + 99, count: 0 });
  }
  let avgComposite = null, avgRW = null, avgMath = null;
  const scores = testScores || [];
  if (scores.length > 0) {
    let sumC = 0, sumR = 0, sumM = 0, nR = 0, nM = 0;
    for (const s of scores) {
      const c = s.composite_score;
      sumC += c;
      if (s.rw_scaled) { sumR += s.rw_scaled; nR++; }
      if (s.math_scaled) { sumM += s.math_scaled; nM++; }
      for (const b of buckets) {
        if (c >= b.lo && c <= b.hi) { b.count++; break; }
      }
    }
    avgComposite = Math.round(sumC / scores.length);
    avgRW = nR > 0 ? Math.round(sumR / nR) : null;
    avgMath = nM > 0 ? Math.round(sumM / nM) : null;
  }

  // ── 4) Domain/Skill Heatmap ────────────────────────────────────
  // Aggregate accuracy per skill across all students (first attempts, last 30d)
  const skillMap = {};
  if (questionIds.length > 0) {
    const skillTaxMap = {};
    for (let i = 0; i < questionIds.length; i += 500) {
      const chunk = questionIds.slice(i, i + 500);
      const { data: taxRows } = await supabase
        .from('question_taxonomy')
        .select('question_id, domain_code, domain_name, skill_code, skill_name')
        .in('question_id', chunk);
      for (const t of taxRows || []) skillTaxMap[t.question_id] = t;
    }

    for (const a of firstAttempts) {
      const tax = skillTaxMap[a.question_id];
      if (!tax || !tax.skill_code) continue;
      const key = tax.skill_code;
      if (!skillMap[key]) {
        skillMap[key] = {
          skill_code: tax.skill_code,
          skill_name: tax.skill_name,
          domain_code: tax.domain_code,
          domain_name: tax.domain_name,
          total: 0,
          correct: 0,
        };
      }
      skillMap[key].total++;
      if (a.is_correct) skillMap[key].correct++;
    }
  }

  const skills = Object.values(skillMap)
    .filter(s => s.total >= 3)
    .map(s => ({ ...s, accuracy: Math.round((s.correct / s.total) * 100) }))
    .sort((a, b) => a.accuracy - b.accuracy);

  return NextResponse.json({
    overallAccuracy: {
      current: overallAccuracy,
      previous: prevAccuracy,
      totalAttempts: totalFirst,
      domains,
    },
    hardestQuestions: hardest.map(enrichQ),
    easiestQuestions: easiest.map(enrichQ),
    scoreDistribution: {
      buckets: buckets.filter(b => b.count > 0 || (b.lo >= 600 && b.lo <= 1400)),
      totalTests: scores.length,
      avgComposite,
      avgRW,
      avgMath,
    },
    skillHeatmap: skills,
  });
}
