// Student dashboard — the landing page and command center. Server
// Component-first per docs/architecture-plan.md §3.4: every block reads
// from the server in this one page and hands shaped props to
// DashboardView (a Server Component too; the only client island on the
// page is the first-visit HelpNudge). No useEffect + fetch.
//
// Boxes (see DashboardView.tsx for the layout):
//   Banner   — greeting, plan week/phase line, target / accuracy /
//              days-to-test chips, Resume + Free-practice links.
//   Tasks    — today's plan tasks via the pure buildTodayView
//              (lib/plan/today.ts). Assignments arrive as mirrored plan
//              tasks (migration 20260919120000); without a plan the box
//              is the setup callout plus the raw open assignments.
//   Progress — three stat tiles + per-domain accuracy bars; the full
//              statistics live on /performance.
//   Recently finished — completed sessions, tests, and assignments.
//
// The test-date countdown reads the plan's date first, then a tutor-
// registered exam, then the profile's personal date — the same
// precedence the sidebar footer uses, so the two never disagree.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { hasAssignedTutor } from '@/lib/api/hasAssignedTutor';
import { buildTodayView } from '@/lib/plan/today';
import { loadDashboardAggregate } from '@/lib/practice/load-dashboard-aggregate';
import { loadDashboardAggregateAct } from '@/lib/practice/load-dashboard-aggregate-act';
import { DashboardView } from './DashboardView';

export const dynamic = 'force-dynamic';

const RECENT_FINISHED_CAP = 6;
const RECENT_FINISHED_PER_TYPE = 10;
// Open assignments listed in the Tasks box when there is no plan to
// mirror them into. Newest first; the header link exposes the inbox.
const PENDING_DISPLAY_CAP = 3;

export default async function StudentDashboardPage({ searchParams }) {
  const { user, profile, supabase } = await requireUser();

  // Same role gate the layout already runs — keep it here too so
  // direct page hits are guarded if the layout ever stops gating.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // A failed task Start / Mark-done lands back here with ?error=.
  const sp = await searchParams;
  const taskError = typeof sp?.error === 'string' && sp.error ? sp.error : null;

  // Snapshot "now" once so downstream logic stays pure w.r.t.
  // time (React 19 / compiler). All time-derived values below
  // derive from this single reference.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const today = new Date(nowMs).toISOString().slice(0, 10);
  const nowIso = new Date(nowMs).toISOString();

  // Heavy aggregate (totals + per-domain) lives behind a 60s cache
  // keyed by user id; submitAnswer revalidates the tag so a fresh
  // answer flushes it on the next visit. Everything else is per-
  // request. The two wide reads (recent attempts, assignment-linked
  // sessions) are bounded by row count rather than by an id list so
  // they can run in this single wave instead of a second one.
  const RECENT_ATTEMPTS_CAP = 2000;
  const ASSIGNMENT_LINKED_SESSIONS_CAP = 100;

  const [
    aggregate,
    aggregateAct,
    { data: fullProfile },
    { data: recentSessions },
    { data: recentActSessions },
    { data: recentTestAttempts },
    { data: assignmentRows },
    { data: activeSession },
    { data: nextRegistrationRow },
    { data: assignmentLinkedSessions },
    { data: recentAttempts },
    { data: recentActAttempts },
    hasTutor,
    { data: activePlanRow },
  ] = await Promise.all([
    loadDashboardAggregate(user.id),
    // Sibling ACT aggregator. Returns zeroed totals when the student
    // has no ACT attempts; the Progress box then skips the ACT group.
    loadDashboardAggregateAct(user.id),
    supabase
      .from('profiles')
      .select('first_name, target_sat_score, sat_test_date, created_at')
      .eq('id', user.id)
      .maybeSingle(),
    // Recent completed practice sessions (in-progress / abandoned
    // belong in Practice hub's list, not here).
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, mode, status, filter_criteria')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'completed')
      .eq('test_type', 'sat')
      .order('created_at', { ascending: false })
      .limit(RECENT_FINISHED_PER_TYPE),
    // Sibling ACT read. Same shape, same cap — the entries merge into
    // the single "Recently finished" list and sort by finish time
    // alongside the SAT ones. ACT full-form practice tests also live
    // in practice_sessions but report on the ACT results page;
    // buildSessionEntries drops them in memory.
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, mode, status, filter_criteria')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'completed')
      .eq('test_type', 'act')
      .order('created_at', { ascending: false })
      .limit(RECENT_FINISHED_PER_TYPE),
    // Recent completed practice-test attempts.
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, finished_at, composite_score, rw_scaled, math_scaled,
        sections_only,
        practice_test:practice_tests_v2(name, code)
      `)
      .eq('user_id', user.id)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(RECENT_FINISHED_PER_TYPE),
    // Assignments (pending + recently-completed — split in memory).
    // SAT-only; an ACT assignments inbox is a later phase.
    supabase
      .from('assignment_students_v2')
      .select(`
        completed_at,
        assignment:assignments_v2 (
          id, assignment_type, title, due_date, created_at, archived_at, deleted_at,
          question_ids,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', user.id)
      .eq('test_type', 'sat'),
    // Active session for the Resume link in the banner. SAT-only.
    supabase
      .from('practice_sessions')
      .select('id, current_position, question_ids, last_activity_at')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'in_progress')
      .eq('test_type', 'sat')
      .gt('expires_at', nowIso)
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // Soonest upcoming SAT registration — a tutor-added row is a real
    // registered exam, so it beats the profile's personal target date.
    supabase
      .from('sat_test_registrations')
      .select('test_date')
      .eq('student_id', user.id)
      .gte('test_date', today)
      .order('test_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
    // This user's assignment-linked practice sessions, recent first;
    // the latest per assignment_id is the "View report" click-through.
    supabase
      .from('practice_sessions')
      .select('id, created_at, filter_criteria')
      .eq('user_id', user.id)
      .eq('test_type', 'sat')
      .not('filter_criteria->>assignment_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(ASSIGNMENT_LINKED_SESSIONS_CAP),
    // Most-recent attempts, for first-attempt accuracy on each
    // "Recently finished" card.
    supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(RECENT_ATTEMPTS_CAP),
    // ACT attempts live in their own table keyed to act_questions.
    supabase
      .from('act_attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(RECENT_ATTEMPTS_CAP),
    // Self-studiers (no row in teacher_student_assignments) never see
    // assignment rows in the Tasks box.
    hasAssignedTutor(supabase, user.id),
    // The active study plan drives the Tasks box, the banner line, and
    // the countdown's first-choice date. SAT first if a student somehow
    // has both.
    supabase
      .from('study_plans')
      .select('id, test_type, goal_score, test_date, phases, created_by, created_at')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .order('test_type', { ascending: false }) // 'sat' > 'act'
      .limit(1)
      .maybeSingle(),
  ]);

  // ---------- Tasks box: the plan's daily view ----------
  let view = null;
  let wasAutoRepaced = false;
  if (activePlanRow) {
    const { data: taskRows } = await supabase
      .from('plan_tasks')
      .select('id, week_index, scheduled_date, task_type, payload, status, completed_at, source')
      .eq('plan_id', activePlanRow.id)
      .order('scheduled_date', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true });
    const tasks = (taskRows ?? []).map((t) => ({
      id: t.id,
      weekIndex: t.week_index,
      scheduledDate: t.scheduled_date,
      taskType: t.task_type,
      payload: t.payload ?? {},
      status: t.status ?? 'pending',
      completedAt: t.completed_at,
      source: t.source ?? 'generated',
    }));
    view = buildTodayView(tasks, today, activePlanRow.test_date);

    // §2.5: the weekly job auto-applies re-paced plans for self-serve
    // students, marked by created_by = null. Tell the student their
    // plan changed (for its first week) rather than silently reshuffle.
    const planAgeDays =
      (Date.parse(today) - Date.parse(String(activePlanRow.created_at).slice(0, 10))) / 86_400_000;
    wasAutoRepaced = activePlanRow.created_by == null && planAgeDays <= 7;
  }

  // Weekly accuracy trend for the Progress tiles' sparklines. Reuses
  // the RPC the tutor performance page calls, with a single-element
  // roster; RLS inside the RPC means only the caller's own data can
  // come back. 13 weeks tracks the standard 90-day window.
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

  // ---------- Banner ----------
  const testDateIso =
    activePlanRow?.test_date
    ?? (typeof nextRegistrationRow?.test_date === 'string' ? nextRegistrationRow.test_date : null)
    ?? fullProfile?.sat_test_date
    ?? null;
  const daysToTest = daysUntil(testDateIso, nowMs);
  const targetScore = activePlanRow?.goal_score ?? fullProfile?.target_sat_score ?? null;

  const subline = view
    ? planLine(view, activePlanRow)
    : statusLine({ weekAttempts: aggregate.weekAttempts, totalAttempts: aggregate.totalAttempts, accuracy }, daysToTest);

  const resume = activeSession && Array.isArray(activeSession.question_ids) && activeSession.question_ids.length > 0
    ? { sessionId: activeSession.id, position: activeSession.current_position }
    : null;

  // ---------- Assignments: pending (no-plan Tasks box) + completed (Recently finished) ----------
  const allAssignments = (assignmentRows ?? [])
    .map((r) => ({ ...r.assignment, student_completed_at: r.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at);

  const openAssignments = allAssignments
    .filter((a) => !a.student_completed_at)
    .sort((a, b) => {
      const ac = a.created_at ? Date.parse(a.created_at) : 0;
      const bc = b.created_at ? Date.parse(b.created_at) : 0;
      return bc - ac;
    });
  const pendingAssignments = openAssignments
    .slice(0, PENDING_DISPLAY_CAP)
    .map((a) => ({
      id: a.id,
      title: assignmentTitle(a),
      dueDate: a.due_date ?? null,
    }));

  const completedAssignments = allAssignments.filter((a) => a.student_completed_at);

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

  // ---------- Recently finished ----------
  const finishedEntries = [];

  finishedEntries.push(
    ...buildSessionEntries(recentSessions, recentAttempts, {
      kind: 'session',
      titlePrefix: 'Practice',
    }),
    ...buildSessionEntries(recentActSessions, recentActAttempts, {
      kind: 'act_session',
      titlePrefix: 'ACT practice',
    }),
  );

  // Practice tests. Single-section attempts (sections_only) carry a
  // null composite by design — surface the section's scaled score on
  // its own with an "R&W only" / "Math only" suffix.
  for (const t of recentTestAttempts ?? []) {
    const sectionsOnly = t.sections_only ?? null;
    let metric;
    if (sectionsOnly === 'RW' && Number.isFinite(t.rw_scaled)) {
      metric = `${t.rw_scaled} RW · R&W only`;
    } else if (sectionsOnly === 'MATH' && Number.isFinite(t.math_scaled)) {
      metric = `${t.math_scaled} Math · Math only`;
    } else if (Number.isFinite(t.composite_score)) {
      metric = `${t.composite_score} composite${
        Number.isFinite(t.rw_scaled) && Number.isFinite(t.math_scaled)
          ? ` · RW ${t.rw_scaled} · Math ${t.math_scaled}`
          : ''
      }`;
    } else {
      metric = 'Completed';
    }
    finishedEntries.push({
      kind: 'test',
      id: t.id,
      title: t.practice_test?.name ?? 'Practice test',
      subtitle: t.practice_test?.code ?? null,
      finishedAt: t.finished_at,
      metric,
      tone: 'neutral',
      href: `/practice/test/attempt/${t.id}/results`,
    });
  }

  for (const a of completedAssignments.slice(0, RECENT_FINISHED_PER_TYPE)) {
    const sessionId = latestSessionByAssignment.get(a.id) ?? null;
    let metric = 'Completed';
    if ((a.assignment_type === 'questions' || a.assignment_type === 'lesson_pack') && Array.isArray(a.question_ids)) {
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
      title: assignmentTitle(a),
      finishedAt: a.student_completed_at,
      metric,
      tone: 'neutral',
      href: sessionId ? `/practice/review/${sessionId}` : `/assignments/${a.id}`,
    });
  }

  const recentlyFinished = finishedEntries
    .filter((e) => e.finishedAt)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    .slice(0, RECENT_FINISHED_CAP);

  // ---------- Progress ----------
  const groups = [
    { title: 'Math', tone: 'math', domains: domainStats(aggregate.performance.math.domains) },
    { title: 'Reading & Writing', tone: 'rw', domains: domainStats(aggregate.performance.rw.domains) },
  ];
  if (aggregateAct.totalAttempts > 0) {
    groups.push({
      title: 'ACT',
      tone: 'act',
      domains: aggregateAct.performance.sections.map((sec) => ({
        name: sec.label,
        correct: sec.correct,
        total: sec.total,
      })),
    });
  }

  return (
    <DashboardView
      accountCreatedAt={fullProfile?.created_at ?? null}
      banner={{
        firstName: fullProfile?.first_name ?? null,
        subline,
        targetScore,
        accuracy,
        daysToTest,
        resume,
      }}
      tasks={{
        view,
        today,
        error: taskError,
        wasAutoRepaced,
        hasTutor,
        pendingAssignments,
        assignmentsTotal: openAssignments.length,
      }}
      progress={{
        totalAttempts: aggregate.totalAttempts,
        accuracy,
        weekAttempts: aggregate.weekAttempts,
        weeklyTrend,
        groups,
      }}
      recentlyFinished={recentlyFinished}
    />
  );
}

// ──────────────────────────────────────────────────────────────

// Shape a batch of completed practice sessions into "Recently
// finished" cards. Test-type agnostic: the caller supplies the
// matching attempts rows (SAT `attempts` / ACT `act_attempts`) and
// the badge kind, so both sides share one accuracy computation.
function buildSessionEntries(sessions, attempts, { kind, titlePrefix }) {
  const entries = [];
  for (const sess of sessions ?? []) {
    if (!Array.isArray(sess.question_ids) || sess.question_ids.length === 0) continue;
    // Assignment-linked sessions surface as assignment entries.
    if (sess.filter_criteria?.assignment_id) continue;
    // ACT full-form practice tests report on the ACT results page and
    // already list on the ACT tests hub.
    if (sess.filter_criteria?.kind === 'practice_test') continue;
    const qidSet = new Set(sess.question_ids);
    const firstByQid = new Map();
    for (const a of attempts ?? []) {
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
    entries.push({
      kind,
      id: sess.id,
      title: `${titlePrefix} · ${total} question${total === 1 ? '' : 's'}`,
      finishedAt: sess.created_at,
      metric:
        accuracyPct == null
          ? `${total} questions`
          : `${correct} of ${attempted} · ${accuracyPct}%`,
      tone: accuracyTone(accuracyPct),
      href: `/practice/review/${sess.id}`,
    });
  }
  return entries;
}

function accuracyTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'warn';
}

function assignmentTitle(a) {
  return a.title
    ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
    ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
    ?? 'Assignment';
}

// Domain-level rows for the Progress box (the per-skill segments stay
// on /performance).
function domainStats(domains) {
  return (domains ?? []).map((d) => ({ name: d.name, correct: d.correct, total: d.total }));
}

// "Week 3 of 12 · Focus · 2 of 5 tasks done this week" — the plan's
// current week (anchored like lib/plan/today.ts), the phase that week
// sits in, and this week's done/total.
const PHASE_LABEL = {
  coverage: 'Coverage',
  focus: 'Focus',
  rehearsal: 'Rehearsal',
  targets: 'Your targets',
};

function planLine(view, plan) {
  if (!view.week) return 'Your plan is live — the tasks below are what to do next.';
  const { index, total, done, count } = view.week;
  const phases = Array.isArray(plan?.phases) ? plan.phases : [];
  const phase = phases.find((p) => index >= p.start_week && index <= p.end_week) ?? null;
  const bits = [`Week ${index + 1} of ${total}`];
  if (phase && PHASE_LABEL[phase.type]) bits.push(PHASE_LABEL[phase.type]);
  if (count > 0) bits.push(`${done} of ${count} tasks done this week`);
  return bits.join(' · ');
}

function statusLine(stats, daysToTest) {
  const bits = [];
  if (stats.weekAttempts > 0) {
    bits.push(`${stats.weekAttempts} attempt${stats.weekAttempts === 1 ? '' : 's'} this week`);
  }
  if (stats.totalAttempts > 0 && stats.accuracy != null) {
    bits.push(`${stats.accuracy}% accuracy overall`);
  }
  if (bits.length === 0) {
    return 'Start your first practice session to see your stats here.';
  }
  if (daysToTest != null && daysToTest >= 0 && daysToTest <= 60) {
    bits.push(`${daysToTest} day${daysToTest === 1 ? '' : 's'} to test day`);
  }
  return bits.join(' · ');
}

// Whole days from today (UTC midnight) to an ISO date — the same
// arithmetic the sidebar footer strip uses.
function daysUntil(iso, nowMs) {
  if (!iso) return null;
  const target = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
  if (Number.isNaN(target)) return null;
  const now = new Date(nowMs);
  const todayMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.round((target - todayMidnight) / 86_400_000);
}
