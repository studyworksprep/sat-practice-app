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
import { domainSection } from '@/lib/ui/question-layout';
import { updateTargetScore } from './actions';
import { DashboardInteractive } from './DashboardInteractive';

export const dynamic = 'force-dynamic';

const PERFORMANCE_LOOKBACK_DAYS = 90;
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
  const sevenDaysAgo  = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const lookbackStart = new Date(nowMs - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  // Parallel reads. Most are tiny counts; the performance window
  // and the assignment-rows join are the heavier ones. The three
  // "recently finished" feeds (sessions, tests, assignments) each
  // pull ~10 rows; they're merged + truncated to
  // RECENT_FINISHED_CAP in memory below.
  const [
    { data: fullProfile },
    { count: totalAttempts },
    { count: correctAttempts },
    { count: weekAttempts },
    { data: perfRows },
    { data: recentSessions },
    { data: recentTestAttempts },
    { data: assignmentRows },
    { data: activeSession },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, last_name, target_sat_score, high_school, graduation_year, sat_test_date')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice'),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice')
      .eq('is_correct', true),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('source', 'practice')
      .gte('created_at', sevenDaysAgo),
    // Per-domain accuracy. attempts.question_id has no FK to
    // questions_v2 so PostgREST can't embed-join; we fetch the
    // attempts window first and look up questions_v2 by id below.
    supabase
      .from('attempts')
      .select('is_correct, question_id')
      .eq('user_id', user.id)
      .eq('source', 'practice')
      .gte('created_at', lookbackStart)
      .limit(5000),
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
  ]);

  const accuracy = totalAttempts && totalAttempts > 0
    ? Math.round(((correctAttempts ?? 0) / totalAttempts) * 100)
    : null;

  const stats = {
    firstName: fullProfile?.first_name ?? null,
    targetScore: fullProfile?.target_sat_score ?? null,
    satTestDate: fullProfile?.sat_test_date ?? null,
    totalAttempts: totalAttempts ?? 0,
    correctAttempts: correctAttempts ?? 0,
    weekAttempts: weekAttempts ?? 0,
    accuracy,
  };

  // Performance: bucket attempts by domain_name, splitting into
  // Math vs Reading & Writing via domainSection(domain_code).
  // Two-step: collect distinct question_ids from the attempts
  // window, fetch their domain metadata from questions_v2, then
  // aggregate in memory. (Can't embed-join because attempts has
  // no declared FK to questions_v2.)
  const questionIds = Array.from(
    new Set((perfRows ?? []).map((r) => r.question_id).filter(Boolean)),
  );
  let questionMeta = new Map();
  if (questionIds.length > 0) {
    const { data: qRows } = await supabase
      .from('questions_v2')
      .select('id, domain_code, domain_name')
      .in('id', questionIds);
    questionMeta = new Map((qRows ?? []).map((q) => [q.id, q]));
  }
  const performance = aggregatePerformance(perfRows ?? [], questionMeta);

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

  // One more query: for recently-completed assignments, look up
  // the latest practice_sessions row whose filter_criteria
  // points at that assignment id. That session's review page
  // becomes the "View report" target; if none exists (e.g. the
  // assignment was completed on the legacy path), we fall back
  // to the assignment detail page. We also need attempts to
  // compute per-session and per-assignment accuracy for the
  // finished cards.
  const recentAssignmentIds = completedAssignments
    .sort(
      (a, b) =>
        Date.parse(b.student_completed_at ?? 0) -
        Date.parse(a.student_completed_at ?? 0),
    )
    .slice(0, RECENT_FINISHED_PER_TYPE)
    .map((a) => a.id);

  const allQidForAccuracy = Array.from(
    new Set([
      ...(recentSessions ?? []).flatMap((s) =>
        Array.isArray(s.question_ids) ? s.question_ids : [],
      ),
      ...completedAssignments.flatMap((a) =>
        Array.isArray(a.question_ids) ? a.question_ids : [],
      ),
    ]),
  );

  const [{ data: assignmentSessionRows }, { data: recentAttempts }] =
    await Promise.all([
      recentAssignmentIds.length > 0
        ? supabase
            .from('practice_sessions')
            .select('id, created_at, filter_criteria')
            .eq('user_id', user.id)
            .in('filter_criteria->>assignment_id', recentAssignmentIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] }),
      allQidForAccuracy.length > 0
        ? supabase
            .from('attempts')
            .select('question_id, is_correct, created_at')
            .eq('user_id', user.id)
            .in('question_id', allQidForAccuracy)
        : Promise.resolve({ data: [] }),
    ]);

  // Latest session per assignment id — for the click-through link.
  const latestSessionByAssignment = new Map();
  for (const row of assignmentSessionRows ?? []) {
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

// ──────────────────────────────────────────────────────────────
// Aggregation helpers.
// ──────────────────────────────────────────────────────────────

function aggregatePerformance(rows, questionMeta) {
  const byDomain = new Map();
  for (const r of rows) {
    const q = questionMeta.get(r.question_id);
    if (!q || !q.domain_name) continue;
    const key = q.domain_name;
    let entry = byDomain.get(key);
    if (!entry) {
      entry = {
        name: q.domain_name,
        code: q.domain_code,
        section: domainSection(q.domain_code),
        correct: 0,
        total: 0,
      };
      byDomain.set(key, entry);
    }
    entry.total += 1;
    if (r.is_correct) entry.correct += 1;
  }

  const all = Array.from(byDomain.values()).sort((a, b) => b.total - a.total);
  const math = all.filter((d) => d.section === 'math');
  const rw   = all.filter((d) => d.section === 'rw');

  return {
    math: {
      domains: math,
      ...sectionTotals(math),
    },
    rw: {
      domains: rw,
      ...sectionTotals(rw),
    },
  };
}

function sectionTotals(domains) {
  let correct = 0;
  let total = 0;
  for (const d of domains) {
    correct += d.correct;
    total += d.total;
  }
  return {
    correct,
    total,
    pct: total > 0 ? Math.round((correct / total) * 100) : null,
  };
}
