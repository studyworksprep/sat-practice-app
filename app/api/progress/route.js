import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';
import { computeTestScores } from '../../../lib/testScoreHelper';

// GET /api/progress — goal progress + streak data
export async function GET() {
  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  // Fetch profile (target score), attempts (for streaks), and test scores in parallel
  const [profileResult, attemptsResult, testResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('target_sat_score, first_name, last_name')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(5000),
    supabase
      .from('practice_test_attempts')
      .select('id, practice_test_id, status, finished_at, composite_score, rw_scaled, math_scaled')
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(20),
  ]);

  const profile = profileResult.data;
  const targetScore = profile?.target_sat_score || null;

  // ── Streak calculation ──
  const attempts = attemptsResult.data || [];
  const practiceDays = new Set();
  for (const a of attempts) {
    const d = new Date(a.created_at);
    practiceDays.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }

  // Sort days descending
  const sortedDays = [...practiceDays].sort().reverse();

  // Calculate current streak
  let currentStreak = 0;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  // Check if practiced today or yesterday (streak can include today)
  let checkDate = new Date(today);
  // If no practice today, allow yesterday to start the streak
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

  // Longest streak
  let longestStreak = 0;
  let tempStreak = 0;
  for (let i = 0; i < sortedDays.length; i++) {
    if (i === 0) {
      tempStreak = 1;
    } else {
      const prev = new Date(sortedDays[i - 1]);
      const curr = new Date(sortedDays[i]);
      const diffDays = (prev - curr) / (24 * 60 * 60 * 1000);
      if (Math.round(diffDays) === 1) {
        tempStreak++;
      } else {
        tempStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, tempStreak);
  }

  const practicedToday = practiceDays.has(todayStr);
  const totalPracticeDays = practiceDays.size;

  // ── Test scores for goal tracking ──
  let highestScore = null;
  let latestScore = null;
  let testScoreHistory = [];

  const completedAttempts = testResult.data || [];
  if (completedAttempts.length) {
    testScoreHistory = (await computeTestScores(supabase, completedAttempts))
      .filter(s => s.composite != null);

    if (testScoreHistory.length > 0) {
      highestScore = Math.max(...testScoreHistory.map(s => s.composite));
      latestScore = testScoreHistory[0]?.composite || null;
    }
  }

  // ── Goal progress ──
  const pointsToGoal = targetScore && highestScore ? Math.max(0, targetScore - highestScore) : null;
  const goalProgress = targetScore && highestScore
    ? Math.min(100, Math.round((highestScore / targetScore) * 100))
    : null;

  return NextResponse.json({
    targetScore,
    highestScore,
    latestScore,
    goalProgress,
    pointsToGoal,
    currentStreak,
    longestStreak,
    practicedToday,
    totalPracticeDays,
    testScoreHistory,
  });
}
