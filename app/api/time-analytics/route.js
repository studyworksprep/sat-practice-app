import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/time-analytics — per-question time analytics
export const GET = legacyApiRoute(async (request) => {
  const { user, supabase } = await requireUser();

  const { searchParams } = new URL(request.url);
  const questionId = searchParams.get('question_id');

  // If requesting time for a specific question
  if (questionId) {
    const { data: attempts } = await supabase
      .from('attempts')
      .select('time_spent_ms, is_correct, created_at')
      .eq('user_id', user.id)
      .eq('question_id', questionId)
      .order('created_at', { ascending: true });

    // Get global stats for this question (all users)
    const { data: globalAttempts } = await supabase
      .from('attempts')
      .select('time_spent_ms')
      .eq('question_id', questionId)
      .gt('time_spent_ms', 0);

    const globalTimes = (globalAttempts || []).map(a => a.time_spent_ms).filter(t => t > 0);
    const globalAvg = globalTimes.length > 0
      ? Math.round(globalTimes.reduce((a, b) => a + b, 0) / globalTimes.length)
      : null;
    const globalMedian = globalTimes.length > 0
      ? globalTimes.sort((a, b) => a - b)[Math.floor(globalTimes.length / 2)]
      : null;

    return NextResponse.json({
      question_id: questionId,
      attempts: (attempts || []).map(a => ({
        time_spent_ms: a.time_spent_ms,
        is_correct: a.is_correct,
        created_at: a.created_at,
      })),
      global_avg_ms: globalAvg,
      global_median_ms: globalMedian,
      global_count: globalTimes.length,
    });
  }

  // Otherwise: overall time analytics summary
  const { data: allAttempts, error } = await supabase
    .from('attempts')
    .select('question_id, time_spent_ms, is_correct, created_at')
    .eq('user_id', user.id)
    .gt('time_spent_ms', 0)
    .order('created_at', { ascending: true })
    .limit(5000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const qids = [...new Set((allAttempts || []).map(a => a.question_id))];
  const taxMap = {};
  if (qids.length > 0) {
    const { data: taxRows } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_name, difficulty')
      .in('question_id', qids);
    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
  }

  // First attempt per question
  const firstAttemptMap = new Map();
  for (const a of (allAttempts || [])) {
    if (!firstAttemptMap.has(a.question_id)) {
      firstAttemptMap.set(a.question_id, a);
    }
  }

  // Time by difficulty
  const byDifficulty = { 1: { total: 0, count: 0 }, 2: { total: 0, count: 0 }, 3: { total: 0, count: 0 } };
  // Time by domain
  const byDomain = {};
  // Time by correctness
  const correctTimes = [];
  const incorrectTimes = [];

  for (const [qid, att] of firstAttemptMap) {
    const tax = taxMap[qid];
    const d = tax?.difficulty;
    if (d >= 1 && d <= 3) {
      byDifficulty[d].total += att.time_spent_ms;
      byDifficulty[d].count++;
    }
    const domain = tax?.domain_name || 'Unknown';
    if (!byDomain[domain]) byDomain[domain] = { total: 0, count: 0 };
    byDomain[domain].total += att.time_spent_ms;
    byDomain[domain].count++;

    if (att.is_correct) correctTimes.push(att.time_spent_ms);
    else incorrectTimes.push(att.time_spent_ms);
  }

  const avg = (arr) => arr.length > 0 ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

  return NextResponse.json({
    byDifficulty: {
      1: byDifficulty[1].count > 0 ? Math.round(byDifficulty[1].total / byDifficulty[1].count) : null,
      2: byDifficulty[2].count > 0 ? Math.round(byDifficulty[2].total / byDifficulty[2].count) : null,
      3: byDifficulty[3].count > 0 ? Math.round(byDifficulty[3].total / byDifficulty[3].count) : null,
    },
    byDomain: Object.fromEntries(
      Object.entries(byDomain).map(([k, v]) => [k, v.count > 0 ? Math.round(v.total / v.count) : null])
    ),
    avgCorrectMs: avg(correctTimes),
    avgIncorrectMs: avg(incorrectTimes),
    totalQuestions: firstAttemptMap.size,
  });
});
