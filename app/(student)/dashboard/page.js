import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { dashboardTasks, dashboardTutorNames } from '@/lib/plan/dashboard-tasks';
import { buildTodayView, taskTitle } from '@/lib/plan/today';
import { loadPlanTaskResumes } from '@/lib/plan/student-task';
import { loadDashboardAggregate } from '@/lib/practice/load-dashboard-aggregate';
import { loadDashboardAggregateAct } from '@/lib/practice/load-dashboard-aggregate-act';
import { loadDashboardRecentAccuracy } from '@/lib/practice/load-dashboard-recent-accuracy';
import { accuracyKey, dashboardAccuracyMetric } from '@/lib/practice/dashboard-summary';
import { DashboardView } from './DashboardView';
import { actTestAssignmentTitle, defaultActFormName } from '@/lib/practice/act-form-names';

export const dynamic = 'force-dynamic';

const RECENT_FINISHED_CAP = 6;
const RECENT_FINISHED_PER_TYPE = 10;

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

  // Aggregate RPCs run fresh under the caller's RLS. Recent-card accuracy
  // is loaded as compact counts once the displayed item IDs are known.
  const ASSIGNMENT_LINKED_SESSIONS_CAP = 100;
  const TREND_WEEKS = 13;

  const [
    aggregate,
    aggregateAct,
    { data: fullProfile },
    { data: recentSessions },
    { data: recentActSessions },
    { data: recentTestAttempts },
    { data: assignmentRows },
    { data: activeSession },
    { data: assignmentLinkedSessions },
    { data: tutorLinks },
    { data: activePlanRow },
    { data: trendRows },
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
      .select('id, created_at, last_activity_at, plan_task_id, question_ids, mode, status, filter_criteria')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'completed')
      .eq('test_type', 'sat')
      .order('last_activity_at', { ascending: false })
      .limit(RECENT_FINISHED_PER_TYPE),
    // Sibling ACT read. Same shape, same cap — the entries merge into
    // the single "Recently finished" list and sort by finish time
    // alongside the SAT ones. ACT full-form practice tests also live
    // in practice_sessions but report on the ACT results page;
    // buildSessionEntries drops them in memory.
    supabase
      .from('practice_sessions')
      .select('id, created_at, last_activity_at, plan_task_id, question_ids, mode, status, filter_criteria')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'completed')
      .eq('test_type', 'act')
      .order('last_activity_at', { ascending: false })
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
    // Assignments (pending + recently-completed — split in memory),
    // SAT and ACT (Phase 4B).
    supabase
      .from('assignment_students_v2')
      .select(`
        completed_at,
        assignment:assignments_v2 (
          id, teacher_id, assignment_type, title, due_date, created_at, archived_at, deleted_at,
          question_ids, act_source_test,
          lesson:lessons (title),
          practice_test:practice_tests_v2 (name)
        )
      `)
      .eq('student_id', user.id),
    // Independent sessions have their own resume row. Linked sessions resume from their task.
    supabase
      .from('practice_sessions')
      .select('id, mode, test_type, current_position, question_ids, last_activity_at, filter_criteria')
      .eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('status', 'in_progress')
      .is('plan_task_id', null)
      .is('filter_criteria->>assignment_id', null)
      .is('filter_criteria->>plan_task_id', null)
      .or('filter_criteria->>kind.is.null,filter_criteria->>kind.neq.practice_test')
      .gt('expires_at', nowIso)
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    // This user's assignment-linked practice sessions, recent first;
    // the latest per assignment_id is the "View report" click-through.
    supabase
      .from('practice_sessions')
      .select('id, created_at, current_position, status, expires_at, filter_criteria')
      .eq('user_id', user.id)
      .not('filter_criteria->>assignment_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(ASSIGNMENT_LINKED_SESSIONS_CAP),
    supabase.from('teacher_student_assignments').select('teacher_id').eq('student_id', user.id),
    // The active study plan drives the Tasks box, the header line, and
    // the countdown's first-choice date. SAT first if a student somehow
    // has both.
    supabase
      .from('study_plans')
      .select('id, test_type, goal_score, test_date, phases, created_by, created_at, config')
      .eq('student_id', user.id)
      .eq('status', 'active')
      .order('test_type', { ascending: false }) // 'sat' > 'act'
      .limit(1)
      .maybeSingle(),
    // This trend does not depend on the plan or recent-card reads.
    supabase.rpc('get_roster_weekly_trend', {
      p_roster: [user.id], p_num_weeks: TREND_WEEKS,
    }),
  ]);

  const allAssignments = (assignmentRows ?? [])
    .map((r) => ({ ...r.assignment, student_completed_at: r.completed_at }))
    .filter((a) => a && a.id && !a.deleted_at && !a.archived_at);
  const completedAssignments = allAssignments.filter((a) => a.student_completed_at);
  const accuracySessionIds = [...(recentSessions ?? []), ...(recentActSessions ?? [])]
    .filter(s => Array.isArray(s.question_ids) && s.question_ids.length > 0
      && !s.filter_criteria?.assignment_id && s.filter_criteria?.kind !== 'practice_test')
    .map(s => s.id);
  const accuracyAssignmentIds = completedAssignments.slice(0, RECENT_FINISHED_PER_TYPE)
    .filter(a => ['questions', 'lesson_pack'].includes(a.assignment_type) && Array.isArray(a.question_ids))
    .map(a => a.id);
  const tutorIds = [...new Set([...(tutorLinks ?? []).map(t => t.teacher_id), ...allAssignments.map(a => a.teacher_id)].filter(Boolean))];
  const [recentAccuracy, { data: taskRows }, resumes, { data: tutorCards }] = await Promise.all([
    loadDashboardRecentAccuracy(supabase, user.id, accuracySessionIds, accuracyAssignmentIds),
    activePlanRow ? supabase
      .from('plan_tasks')
      .select('id, week_index, scheduled_date, task_type, payload, status, completed_at, source')
      .eq('plan_id', activePlanRow.id)
      .order('scheduled_date', { ascending: true, nullsFirst: true })
      .order('created_at', { ascending: true }) : Promise.resolve({ data: [] }),
    activePlanRow ? loadPlanTaskResumes(supabase, user.id, nowIso) : new Map(),
    tutorIds.length ? supabase.from('profile_cards').select('id, first_name, last_name, tutor_name').in('id', tutorIds) : { data: [] },
  ]);

  // ---------- Tasks box: the plan's daily view ----------
  let view = null;
  let tasks = [];
  let wasAutoRepaced = false;
  if (activePlanRow) {
    tasks = (taskRows ?? []).map((t) => ({
      id: t.id,
      weekIndex: t.week_index,
      scheduledDate: t.scheduled_date,
      taskType: t.task_type,
      payload: t.payload ?? {},
      status: t.status ?? 'pending',
      completedAt: t.completed_at,
      source: t.source ?? 'generated',
      resumeHref: resumes.get(t.id),
    }));
    view = buildTodayView(tasks, today, activePlanRow.test_date, activePlanRow.config?.plan_start ?? null);

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

  // ---------- Header + Up next ----------
  const targetScore = activePlanRow?.goal_score ?? fullProfile?.target_sat_score ?? null;

  const eyebrow = headerEyebrow(view, activePlanRow, targetScore);
  const tutorNames = dashboardTutorNames(tutorCards ?? []);
  const tutors = (tutorLinks ?? []).map(link => tutorNames.get(link.teacher_id)?.display).filter(Boolean).sort();
  const assignmentResumes = new Map();
  for (const session of assignmentLinkedSessions ?? []) {
    const criteria = session.filter_criteria;
    if (session.status === 'in_progress' && Date.parse(session.expires_at) > nowMs && criteria?.assignment_id
      && criteria.kind !== 'practice_test' && !assignmentResumes.has(criteria.assignment_id)) {
      assignmentResumes.set(criteria.assignment_id, `/practice/s/${session.id}/${session.current_position}`);
    }
  }
  const agenda = dashboardTasks(tasks, allAssignments.map(a => ({
    ...a, title: assignmentTitle(a), resumeHref: assignmentResumes.get(a.id),
  })), tutorNames, today);
  const titlesByTask = new Map(tasks.map(t => [t.id, taskTitle(t)]));
  const sessionTotal = Array.isArray(activeSession?.question_ids) ? activeSession.question_ids.length : 0;
  const resume = activeSession && sessionTotal ? {
    id: activeSession.id,
    title: `${activeSession.test_type.toUpperCase()} ${activeSession.mode === 'review' ? 'review' : 'practice'}`,
    position: activeSession.current_position,
    total: sessionTotal,
  } : null;

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
    ...buildSessionEntries(recentSessions, recentAccuracy, {
      kind: 'session', titlesByTask,
      titlePrefix: 'Practice',
    }),
    ...buildSessionEntries(recentActSessions, recentAccuracy, {
      kind: 'act_session', titlesByTask,
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
      metric = dashboardAccuracyMetric(recentAccuracy.get(accuracyKey('assignment', a.id)), a.question_ids.length);
    }
    finishedEntries.push({
      kind: 'assignment',
      id: a.id,
      title: assignmentTitle(a),
      subtitle: tutorNames.get(a.teacher_id)?.byline ? `Assigned by ${tutorNames.get(a.teacher_id).byline}` : null,
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
      header={{
        firstName: fullProfile?.first_name ?? null,
        tutors,
      }}
      resume={resume}
      nextUp={view || agenda.hero ? {
        task: agenda.hero, today, hasPlan: Boolean(view), week: view?.week ?? null,
        planFinished: view?.planFinished ?? false, planContext: eyebrow,
      } : null}
      tasks={{agenda, today, error: taskError, wasAutoRepaced, hasPlan: Boolean(view)}}
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
// matching compact accuracy summary (SAT / ACT) and
// the badge kind, so both sides share one accuracy computation.
function buildSessionEntries(sessions, accuracy, { kind, titlePrefix, titlesByTask }) {
  const entries = [];
  for (const sess of sessions ?? []) {
    if (!Array.isArray(sess.question_ids) || sess.question_ids.length === 0) continue;
    // Assignment-linked sessions surface as assignment entries.
    if (sess.filter_criteria?.assignment_id) continue;
    // ACT full-form practice tests report on the ACT results page and
    // already list on the ACT tests hub.
    if (sess.filter_criteria?.kind === 'practice_test') continue;
    const counts = accuracy.get(accuracyKey(kind, sess.id));
    const total = sess.question_ids.length;
    const accuracyPct =
      counts?.attempted > 0 ? Math.round(counts.correct / counts.attempted * 100) : null;
    entries.push({
      kind,
      id: sess.id,
      title: titlesByTask.get(sess.plan_task_id) ?? `${titlePrefix} · ${total} question${total === 1 ? '' : 's'}`,
      finishedAt: sess.last_activity_at ?? sess.created_at,
      metric: dashboardAccuracyMetric(counts, total),
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
  if (a.assignment_type === 'practice_test' && a.act_source_test) {
    return actTestAssignmentTitle(a.act_source_test, a.title);
  }
  return a.title
    ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
    ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
    ?? (a.assignment_type === 'practice_test' && a.act_source_test
      ? defaultActFormName(a.act_source_test)
      : null)
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

// "Week 16 of 20 · Focus · Target 1400" — the header eyebrow. Without a
// plan only the target remains (or nothing).
function headerEyebrow(view, plan, targetScore) {
  const bits = [];
  if (view?.week) {
    const { index, total } = view.week;
    const phases = Array.isArray(plan?.phases) ? plan.phases : [];
    const phase = phases.find((p) => index >= p.start_week && index <= p.end_week) ?? null;
    bits.push(`Week ${index + 1} of ${total}`);
    if (phase && PHASE_LABEL[phase.type]) bits.push(PHASE_LABEL[phase.type]);
  }
  if (targetScore) bits.push(`Target ${targetScore}`);
  return bits.length > 0 ? bits.join(' · ') : null;
}
