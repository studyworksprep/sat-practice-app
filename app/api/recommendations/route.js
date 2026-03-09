import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

const BAND_WEIGHT = { 1: 1.0, 2: 1.2, 3: 1.4, 4: 1.6, 5: 1.8, 6: 2.0, 7: 2.2 };

// GET /api/recommendations — topic-level practice recommendations
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Get all first attempts (oldest first) for accuracy calculation
  const { data: allAttempts, error } = await supabase
    .from('attempts')
    .select('question_id, is_correct, created_at, time_spent_ms')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Get taxonomy
  const allQids = [...new Set((allAttempts || []).map(a => a.question_id))];
  const taxMap = {};
  if (allQids.length > 0) {
    const { data: taxRows } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
      .in('question_id', allQids);
    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
  }

  // Get total available questions per topic
  const { data: allTax } = await supabase
    .from('question_taxonomy')
    .select('domain_code, domain_name, skill_code, skill_name, difficulty, score_band');

  const topicTotalCounts = {};
  for (const t of (allTax || [])) {
    const key = `${t.domain_name}::${t.skill_name}`;
    topicTotalCounts[key] = (topicTotalCounts[key] || 0) + 1;
  }

  // First attempt per question
  const firstAttemptMap = new Map();
  for (const a of (allAttempts || [])) {
    if (!firstAttemptMap.has(a.question_id)) {
      firstAttemptMap.set(a.question_id, a);
    }
  }

  // Build topic stats
  const topicStats = {};
  for (const [qid, att] of firstAttemptMap) {
    const tax = taxMap[qid];
    if (!tax) continue;
    const key = `${tax.domain_name}::${tax.skill_name}`;
    if (!topicStats[key]) {
      topicStats[key] = {
        domain_code: tax.domain_code,
        domain_name: tax.domain_name,
        skill_code: tax.skill_code,
        skill_name: tax.skill_name,
        attempted: 0,
        correct: 0,
        totalAvailable: topicTotalCounts[key] || 0,
        totalTime: 0,
        recentAttempts: [],
        avgDifficulty: 0,
        avgScoreBand: 0,
        diffSum: 0,
        bandSum: 0,
      };
    }
    const s = topicStats[key];
    s.attempted++;
    if (att.is_correct) s.correct++;
    if (att.time_spent_ms > 0) s.totalTime += att.time_spent_ms;
    s.diffSum += (tax.difficulty || 1);
    s.bandSum += (tax.score_band || 4);
    s.recentAttempts.push({
      is_correct: att.is_correct,
      created_at: att.created_at,
    });
  }

  // Calculate recommendations
  const recommendations = Object.values(topicStats)
    .filter(s => s.attempted >= 2)
    .map(s => {
      const accuracy = s.attempted > 0 ? s.correct / s.attempted : 1;
      const accuracyPct = Math.round(accuracy * 100);
      const avgDiff = s.diffSum / s.attempted;
      const avgBand = s.bandSum / s.attempted;
      const avgTimeMs = s.totalTime > 0 ? Math.round(s.totalTime / s.attempted) : null;
      const remaining = Math.max(0, s.totalAvailable - s.attempted);
      const coveragePct = s.totalAvailable > 0 ? Math.round((s.attempted / s.totalAvailable) * 100) : 100;

      // Recent trend (last 5 attempts)
      const recent = s.recentAttempts.slice(-5);
      const recentAccuracy = recent.length > 0
        ? Math.round((recent.filter(r => r.is_correct).length / recent.length) * 100)
        : null;

      // Priority score: higher = more important to practice
      // Low accuracy: +40 weight
      // Declining trend: +20
      // High score band (more impactful on SAT): +15
      // Low coverage: +10
      const trendDelta = recentAccuracy != null ? accuracyPct - recentAccuracy : 0;
      const priority =
        (100 - accuracyPct) * 0.4 +
        (trendDelta > 0 ? trendDelta * 0.2 : 0) +
        (avgBand / 7) * 15 +
        (remaining > 0 ? (1 - coveragePct / 100) * 10 : 0);

      // Recommendation reason
      let reason = '';
      if (accuracyPct < 50) reason = 'Low accuracy — needs focused practice';
      else if (accuracyPct < 70 && recentAccuracy != null && recentAccuracy < accuracyPct)
        reason = 'Accuracy declining — review fundamentals';
      else if (accuracyPct < 70) reason = 'Below target — keep practicing';
      else if (coveragePct < 50) reason = 'Many unseen questions available';
      else if (avgTimeMs && avgTimeMs > 120000) reason = 'Taking too long — practice for speed';
      else reason = 'Maintain with periodic review';

      return {
        domain_code: s.domain_code,
        domain_name: s.domain_name,
        skill_code: s.skill_code,
        skill_name: s.skill_name,
        attempted: s.attempted,
        correct: s.correct,
        accuracyPct,
        recentAccuracy,
        totalAvailable: s.totalAvailable,
        remaining,
        coveragePct,
        avgTimeMs,
        avgDifficulty: Math.round(avgDiff * 10) / 10,
        priority: Math.round(priority),
        reason,
      };
    })
    .sort((a, b) => b.priority - a.priority);

  // Split into categories
  const needsWork = recommendations.filter(r => r.accuracyPct < 70).slice(0, 8);
  const improving = recommendations.filter(r => r.accuracyPct >= 70 && r.accuracyPct < 85).slice(0, 5);
  const mastered = recommendations.filter(r => r.accuracyPct >= 85).slice(0, 5);

  return NextResponse.json({
    recommendations: recommendations.slice(0, 15),
    needsWork,
    improving,
    mastered,
  });
}
