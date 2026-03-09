import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/smart-review — intelligently prioritized review queue
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Get all question statuses with taxonomy
  const { data: statusRows, error } = await supabase
    .from('question_status')
    .select(`
      question_id,
      is_done,
      marked_for_review,
      attempts_count,
      correct_attempts_count,
      last_is_correct,
      last_attempt_at,
      question_taxonomy:question_taxonomy!inner(domain_code, domain_name, skill_code, skill_name, difficulty, score_band)
    `)
    .eq('user_id', user.id)
    .eq('is_done', true)
    .order('last_attempt_at', { ascending: false })
    .limit(2000);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;

  // Score each question for review priority
  const scored = (statusRows || []).map(row => {
    const tax = row.question_taxonomy || {};
    const daysSince = row.last_attempt_at
      ? (now - new Date(row.last_attempt_at).getTime()) / DAY_MS
      : 30;

    const accuracy = row.attempts_count > 0
      ? row.correct_attempts_count / row.attempts_count
      : 0;

    // Priority factors:
    // 1. Incorrect on last attempt (high priority)
    const incorrectBonus = row.last_is_correct ? 0 : 40;
    // 2. Low accuracy overall
    const accuracyPenalty = (1 - accuracy) * 30;
    // 3. Time decay — questions not seen recently need review
    const timeDecay = Math.min(daysSince / 7, 4) * 10;
    // 4. Higher difficulty = higher priority
    const difficultyBonus = ((tax.difficulty || 1) - 1) * 5;
    // 5. Marked for review = bonus
    const markedBonus = row.marked_for_review ? 15 : 0;

    const priority = incorrectBonus + accuracyPenalty + timeDecay + difficultyBonus + markedBonus;

    return {
      question_id: row.question_id,
      domain_code: tax.domain_code,
      domain_name: tax.domain_name,
      skill_code: tax.skill_code,
      skill_name: tax.skill_name,
      difficulty: tax.difficulty,
      score_band: tax.score_band,
      attempts_count: row.attempts_count,
      correct_attempts_count: row.correct_attempts_count,
      last_is_correct: row.last_is_correct,
      marked_for_review: row.marked_for_review,
      days_since_attempt: Math.round(daysSince),
      accuracy: row.attempts_count > 0
        ? Math.round((row.correct_attempts_count / row.attempts_count) * 100)
        : 0,
      priority: Math.round(priority),
    };
  });

  scored.sort((a, b) => b.priority - a.priority);

  return NextResponse.json({ items: scored.slice(0, 50) });
}
