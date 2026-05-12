// Student dashboard. Server Component-first per
// docs/architecture-plan.md §3.4. Layout shape:
//
//   1. Banner — greeting, target / days-to-test chips, Resume +
//      Start practice CTAs
//   2. Stats row — four tiles computed from the attempts table
//   3. Recently finished — unified list of the most recent
//      completed practice sessions, practice-test attempts, and
//      assignments, with per-item links to each's report. This is
//      the "what did I just do?" surface that a tutor and student
//      pull up at the start of their session.
//   4. Performance grid — per-domain accuracy bars split into
//      Math and Reading & Writing columns
//   5. Pending assignments — tutor-assigned work still open
//   6. Target-score editor (small form)
//
// Every block reads from the server in this single page; the
// client island just renders. No useEffect + fetch.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { loadDashboardAggregate } from '@/lib/practice/load-dashboard-aggregate';
import { updateTargetScore } from './actions';
import { DashboardInteractive } from './DashboardInteractive';

export const dynamic = 'force-dynamic';

const RECENT_FINISHED_CAP = 6;
const RECENT_FINISHED_PER_TYPE = 10;

export default async function StudentDashboardPage() {
  const { user, profile, supabase } = await requireUser();

  // Same role gate the layout already runs — keep it here too so
  // direct page hits are guarded if the layout ever stops gating.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Snapshot "now" once so downstream logic stays pure w.r.t.
  // time (React 19 / compiler). All time-derived values below
  // derive from this single reference.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // Heavy aggregate (totals + per-domain) lives behind a 60s cache
  // keyed by user id; submitAnswer revalidates the tag so a fresh
  // answer flushes it on the next visit. Everything else is per-
  // request (recent activity, assignments, active session) — the
  // expensive bits were the count-on-attempts scans + 5,000-row
  // pull, both folded into get_student_dashboard_stats now.
  // Wider caps for the two reads that used to live in a second wave
  // (after computing keys from assignmentRows + recentSessions). The
  // old shape was a true waterfall; broadening these by user_id only
  // lets them run in parallel with the rest, and the in-memory filter
  // below picks out the exact rows the build needs.
  const RECENT_ATTEMPTS_CAP = 2000;
  const ASSIGNMENT_LINKED_SESSIONS_CAP = 100;

  const [
    aggregate,
    { data: fullProfile },
    { data: recentSessions },
    { data: recentTestAttempts },
    { data: assignmentRows },
    { data: activeSession },
    { data: nextRegistrationRow },
    { data: assignmentLinkedSessions },
    { data: recentAttempts },
  ] = await Promise.all([
    loadDashboardAggregate(user.id),
    supabase
      .from('profiles')
      .select('first_name, last_name, target_sat_score, high_school, graduation_year, sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    // Recent completed practice sessions (in-progress / abandoned
    // belong in Practice hub's list, not here).
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, mode, status, filter_criteria')
      .eq('user_id', user.id)
      .eq('mode', 'practice')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(RECENT_FINISHED_PER_TYPE),
    // Recent completed practice-test attempts.
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, finished_at, composite_score, rw_scaled, math_scaled,
        practice_test:practice_tests_v2(name, code)
      `)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(RECENT_FINISHED_PER_TYPE),
    // Assignments (pending + recently-completed — we split them
    // in memory). Same shape the previous dashboard used, with
    // completed_at + question_ids pulled through so we can
    // surface both views.
    supabase
      .from('assignment_students_v2')
      .select(`
        completed_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, archived_at, deleted_at,
          question_ids,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', user.id),
    // Active session for the Resume CTA in the banner.
    supabase
      .from('practice_sessions')
      .select('id, current_position, question_ids, last_activity_at')
      .eq('user_id', user.id)
      .eq('mode', 'practice')
      .eq('status', 'in_progress')
      .gt('expires_at', nowIso)
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Soonest upcoming SAT registration. Used as the countdown
    // anchor when the student hasn't set a personal target date
    // on their profile — a tutor-added registration row is the
    // canonical "real" test date once one exists.
    supabase
      .from('sat_test_registrations')
      .select('test_date')
      .eq('student_id', user.id)
      .gte('test_date', new Date().toISOString().slice(0, 10))
      .order('test_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // All of this user's assignment-linked practice sessions, recent
    // first. We pick the latest one per assignment_id in memory below
    // for the "View report" click-through; filtering by a specific
    // assignment-id list would force this into a second wave.
    supabase
      .from('practice_sessions')
      .select('id, created_at, filter_criteria')
      .eq('user_id', user.id)
      .not('filter_criteria->>assignment_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(ASSIGNMENT_LINKED_SESSIONS_CAP),
    // Most-recent attempts for this user. Used to compute first-
    // attempt accuracy on each card in "Recently finished". Bounded
    // by row-count (most recent first) rather than the qid IN-list
    // the prior version used so it can run in parallel with the
    // session / assignment fetches.
    supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(RECENT_ATTEMPTS_CAP),
  ]);

  // Weekly accuracy trend for the "Your weekly progress" card.
  // Reuses the same RPC the tutor performance page calls — passing
  // a single-element roster (just this user). RLS still applies
  // inside the RPC, so the only data this can return is the
  // caller's own. 13 weeks tracks the standard 90-day window.
  const TREND_WEEKS = 13;
  const { data: trendRows } = await supabase.rpc('get_roster_weekly_trend', {
    p_roster: [user.id],
    p_num_weeks: TREND_WEEKS,
  });
  const weeklyTrend = (trendRows ?? []).map((r) => ({
    startIso: r.start_iso,
    endIso: r.end_iso,
    attempts: Number(r.attempts ?? 0),
    correct: Number(r.correct ?? 0),
    accuracy: r.accuracy == null ? null : Number(r.accuracy),
  }));

  const accuracy = aggregate.totalAttempts > 0
    ? Math.round((aggregate.correctAttempts / aggregate.totalAttempts) * 100)
    : null;

  const stats = {
    firstName: fullProfile?.first_name ?? null,
    targetScore: fullProfile?.target_sat_score ?? null,
    // Profile sat_test_date is the student's personal target;
    // a tutor-added registration row supersedes it when present
    // because it represents a real registered exam, not a goal.
    satTestDate:
      (typeof nextRegistrationRow?.test_date === 'string' ? nextRegistrationRow.test_date : null)
      ?? fullProfile?.sat_test_date
      ?? null,
    totalAttempts: aggregate.totalAttempts,
    correctAttempts: aggregate.correctAttempts,
    weekAttempts: aggregate.weekAttempts,
    accuracy,
  };

  const performance = aggregate.performance;

  // Resume info for the banner.
  const resumeInfo = activeSession && Array.isArray(activeSession.question_ids) && activeSession.question_ids.length > 0
    ? {
        sessionId: activeSession.id,
        position:  activeSession.current_position,
        total:     activeSession.question_ids.length,
        lastActivityAt: activeSession.last_activity_at,
      }
    : null;

  // Split assignments into pending (actionable) and completed
  // (feed into the unified "Recently finished" strip below).
  const allAssignments = (assignmentRows ?? [])
    .map((r) => ({ ...r.assignment, student_completed_at: r.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at);

  const pendingAssignments = allAssignments
    .filter((a) => !a.student_completed_at)
    .sort((a, b) => {
      const aDue = a.due_date ? Date.parse(a.due_date) : Number.POSITIVE_INFINITY;
      const bDue = b.due_date ? Date.parse(b.due_date) : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    })
    .slice(0, 5)
    .map((a) => ({
      id: a.id,
      assignment_type: a.assignment_type,
      title: a.title
        ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
        ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
        ?? 'Assignment',
      due_date: a.due_date,
      n_questions: Array.isArray(a.question_ids) ? a.question_ids.length : null,
    }));

  const completedAssignments = allAssignments.filter(
    (a) => a.student_completed_at,
  );

  // Latest session per assignment id — for the click-through link.
  // assignmentLinkedSessions is already ordered created_at desc, so
  // the first row seen for each assignment_id is the latest.
  const latestSessionByAssignment = new Map();
  for (const row of assignmentLinkedSessions ?? []) {
    const aid = row.filter_criteria?.assignment_id;
    if (!aid) continue;
    if (!latestSessionByAssignment.has(aid)) {
      latestSessionByAssignment.set(aid, row.id);
    }
  }

  // Build the unified "Recently finished" list. Each entry is a
  // { kind, id, title, finishedAt, metric, href } shape; the card
  // in DashboardInteractive is type-agnostic except for the badge.
  const finishedEntries = [];

  // Practice sessions — compute first-attempt accuracy per session.
  for (const sess of recentSessions ?? []) {
    if (!Array.isArray(sess.question_ids) || sess.question_ids.length === 0) continue;
    // Skip assignment-linked sessions here — those surface as
    // assignment-type entries below so we don't double-count.
    if (sess.filter_criteria?.assignment_id) continue;
    const qidSet = new Set(sess.question_ids);
    const firstByQid = new Map();
    for (const a of recentAttempts ?? []) {
      if (!qidSet.has(a.question_id)) continue;
      if (a.created_at < sess.created_at) continue;
      if (!firstByQid.has(a.question_id)) firstByQid.set(a.question_id, a);
    }
    let correct = 0;
    for (const a of firstByQid.values()) if (a.is_correct) correct += 1;
    const total = sess.question_ids.length;
    const attempted = firstByQid.size;
    const accuracyPct =
      attempted > 0 ? Math.round((correct / attempted) * 100) : null;
    finishedEntries.push({
      kind: 'session',
      id: sess.id,
      title: `Practice · ${total} question${total === 1 ? '' : 's'}`,
      finishedAt: sess.created_at,
      metric:
        accuracyPct == null
          ? `${total} questions`
          : `${correct} of ${attempted} · ${accuracyPct}%`,
      tone: accuracyTone(accuracyPct),
      href: `/practice/review/${sess.id}`,
    });
  }

  // Practice tests.
  for (const t of recentTestAttempts ?? []) {
    finishedEntries.push({
      kind: 'test',
      id: t.id,
      title: t.practice_test?.name ?? 'Practice test',
      subtitle: t.practice_test?.code ?? null,
      finishedAt: t.finished_at,
      metric:
        Number.isFinite(t.composite_score)
          ? `${t.composite_score} composite${
              Number.isFinite(t.rw_scaled) && Number.isFinite(t.math_scaled)
                ? ` · RW ${t.rw_scaled} · Math ${t.math_scaled}`
                : ''
            }`
          : 'Completed',
      tone: 'neutral',
      href: `/practice/test/attempt/${t.id}/results`,
    });
  }

  // Completed assignments.
  for (const a of completedAssignments.slice(0, RECENT_FINISHED_PER_TYPE)) {
    const sessionId = latestSessionByAssignment.get(a.id) ?? null;
    let metric = 'Completed';
    if (a.assignment_type === 'questions' && Array.isArray(a.question_ids)) {
      const qidSet = new Set(a.question_ids);
      const firstByQid = new Map();
      for (const at of recentAttempts ?? []) {
        if (!qidSet.has(at.question_id)) continue;
        if (!firstByQid.has(at.question_id)) firstByQid.set(at.question_id, at);
      }
      let correct = 0;
      for (const at of firstByQid.values()) if (at.is_correct) correct += 1;
      const attempted = firstByQid.size;
      const accuracyPct =
        attempted > 0 ? Math.round((correct / attempted) * 100) : null;
      metric =
        accuracyPct == null
          ? `${a.question_ids.length} questions`
          : `${correct} of ${attempted} · ${accuracyPct}%`;
    }
    finishedEntries.push({
      kind: 'assignment',
      id: a.id,
      title:
        a.title
        ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
        ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
        ?? 'Assignment',
      finishedAt: a.student_completed_at,
      metric,
      tone: 'neutral',
      href: sessionId ? `/practice/review/${sessionId}` : `/assignments/${a.id}`,
    });
  }

  // Merge, sort by finishedAt desc, cap.
  const recentlyFinished = finishedEntries
    .filter((e) => e.finishedAt)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    .slice(0, RECENT_FINISHED_CAP);

  return (
    <DashboardInteractive
      stats={stats}
      performance={performance}
      weeklyTrend={weeklyTrend}
      recentlyFinished={recentlyFinished}
      assignments={pendingAssignments}
      resumeInfo={resumeInfo}
      todayMs={nowMs}
      updateTargetScoreAction={updateTargetScore}
    />
  );
}

function accuracyTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'warn';
}
