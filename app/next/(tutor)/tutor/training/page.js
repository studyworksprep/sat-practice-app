// Tutor → training dashboard. Mirrors the student dashboard one
// context over: same shape (banner + stats + recently finished +
// pending assignments + countdown), but framed as the teacher's
// own training data — separated from the rosters they teach.
//
// All practice + test attempts a teacher does write to the same
// tables a student writes to (attempts, practice_sessions,
// practice_test_attempts_v2). The training tree just renders
// them under the explicit "Train" context so a teacher's own
// stats never bleed into their /tutor/* presentation surface.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { fetchAll } from '@/lib/supabase/fetchAll';
import { buildWeakQueue } from '@/lib/practice/weak-queue';
import { StudyCountdown } from '@/lib/practice/StudyCountdown';
import s from './TrainingDashboard.module.css';

export const dynamic = 'force-dynamic';

const RECENT_FINISHED_CAP = 6;
const RECENT_FINISHED_PER_TYPE = 10;

export default async function TutorTrainingDashboardPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // Snapshot now once for purity.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const sevenDaysAgoIso = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nowIso = new Date(nowMs).toISOString();

  const [
    { data: fullProfile },
    { count: totalAttempts },
    { count: correctAttempts },
    { count: weekAttempts },
    weakQueue,
    { data: recentSessions },
    { data: recentTestAttempts },
    { data: assignmentRows },
    { data: activeSession },
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('first_name, sat_test_date, target_sat_score')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('is_correct', true),
    supabase
      .from('attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgoIso),
    buildWeakQueue(supabase, user.id),
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, mode, status, filter_criteria')
      .eq('user_id', user.id)
      .in('mode', ['training', 'practice', 'review'])
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(RECENT_FINISHED_PER_TYPE),
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
    supabase
      .from('practice_sessions')
      .select('id, current_position, question_ids, last_activity_at')
      .eq('user_id', user.id)
      .in('mode', ['training', 'practice'])
      .eq('status', 'in_progress')
      .gt('expires_at', nowIso)
      .order('last_activity_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const total = totalAttempts ?? 0;
  const correct = correctAttempts ?? 0;
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : null;

  // Pending vs completed assignments. Pending bubbles up; completed
  // entries feed the recently-finished strip below.
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
    .slice(0, 5);
  const completedAssignments = allAssignments.filter((a) => a.student_completed_at);

  // Single attempts read scoped to relevant question ids (for the
  // "recently finished" accuracy lines on session/assignment cards).
  const allQids = Array.from(
    new Set([
      ...(recentSessions ?? []).flatMap((sess) =>
        Array.isArray(sess.question_ids) ? sess.question_ids : [],
      ),
      ...completedAssignments.flatMap((a) =>
        Array.isArray(a.question_ids) ? a.question_ids : [],
      ),
    ]),
  );
  const recentAttemptsRaw = allQids.length > 0
    ? await fetchAll((from, to) =>
        supabase
          .from('attempts')
          .select('question_id, is_correct, created_at')
          .eq('user_id', user.id)
          .in('question_id', allQids)
          .range(from, to),
      )
    : [];

  // Latest assignment-linked session per assignment id — same
  // pattern as the student dashboard.
  const completedAssignmentIds = completedAssignments.slice(0, RECENT_FINISHED_PER_TYPE).map((a) => a.id);
  const { data: assignmentSessionRows } = completedAssignmentIds.length > 0
    ? await supabase
        .from('practice_sessions')
        .select('id, created_at, filter_criteria')
        .eq('user_id', user.id)
        .in('filter_criteria->>assignment_id', completedAssignmentIds)
        .order('created_at', { ascending: false })
    : { data: [] };
  const latestSessionByAssignment = new Map();
  for (const row of assignmentSessionRows ?? []) {
    const aid = row.filter_criteria?.assignment_id;
    if (!aid) continue;
    if (!latestSessionByAssignment.has(aid)) {
      latestSessionByAssignment.set(aid, row.id);
    }
  }

  // Build the unified Recently finished feed.
  const finished = [];
  for (const sess of recentSessions ?? []) {
    if (!Array.isArray(sess.question_ids) || sess.question_ids.length === 0) continue;
    if (sess.filter_criteria?.assignment_id) continue;
    const qidSet = new Set(sess.question_ids);
    const firstByQid = new Map();
    for (const a of recentAttemptsRaw ?? []) {
      if (!qidSet.has(a.question_id)) continue;
      if (a.created_at < sess.created_at) continue;
      if (!firstByQid.has(a.question_id)) firstByQid.set(a.question_id, a);
    }
    let attemptCorrect = 0;
    for (const a of firstByQid.values()) if (a.is_correct) attemptCorrect += 1;
    const totalQ = sess.question_ids.length;
    const attempted = firstByQid.size;
    const acc = attempted > 0 ? Math.round((attemptCorrect / attempted) * 100) : null;
    finished.push({
      kind: 'session',
      id: sess.id,
      title: `Practice · ${totalQ} question${totalQ === 1 ? '' : 's'}`,
      finishedAt: sess.created_at,
      metric:
        acc == null
          ? `${totalQ} questions`
          : `${attemptCorrect} of ${attempted} · ${acc}%`,
      tone: accTone(acc),
      href: `/tutor/training/practice/review/${sess.id}`,
    });
  }
  for (const t of recentTestAttempts ?? []) {
    finished.push({
      kind: 'test',
      id: t.id,
      title: t.practice_test?.name ?? 'Practice test',
      subtitle: t.practice_test?.code ?? null,
      finishedAt: t.finished_at,
      metric: Number.isFinite(t.composite_score)
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
  for (const a of completedAssignments.slice(0, RECENT_FINISHED_PER_TYPE)) {
    const sessionId = latestSessionByAssignment.get(a.id) ?? null;
    let metric = 'Completed';
    if (a.assignment_type === 'questions' && Array.isArray(a.question_ids)) {
      const qidSet = new Set(a.question_ids);
      const firstByQid = new Map();
      for (const at of recentAttemptsRaw ?? []) {
        if (!qidSet.has(at.question_id)) continue;
        if (!firstByQid.has(at.question_id)) firstByQid.set(at.question_id, at);
      }
      let assCorrect = 0;
      for (const at of firstByQid.values()) if (at.is_correct) assCorrect += 1;
      const attempted = firstByQid.size;
      const acc = attempted > 0 ? Math.round((assCorrect / attempted) * 100) : null;
      metric = acc == null
        ? `${a.question_ids.length} questions`
        : `${assCorrect} of ${attempted} · ${acc}%`;
    }
    finished.push({
      kind: 'assignment',
      id: a.id,
      title: a.title
        ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
        ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
        ?? 'Training assignment',
      finishedAt: a.student_completed_at,
      metric,
      tone: 'neutral',
      href: sessionId
        ? `/tutor/training/practice/review/${sessionId}`
        : `/tutor/training/assignments/${a.id}`,
    });
  }
  const recentlyFinished = finished
    .filter((e) => e.finishedAt)
    .sort((a, b) => Date.parse(b.finishedAt) - Date.parse(a.finishedAt))
    .slice(0, RECENT_FINISHED_CAP);

  const greeting = fullProfile?.first_name
    ? `Welcome back, ${fullProfile.first_name}.`
    : 'Welcome back.';
  const resumeInfo = activeSession && Array.isArray(activeSession.question_ids) && activeSession.question_ids.length > 0
    ? {
        sessionId: activeSession.id,
        position: activeSession.current_position,
        total: activeSession.question_ids.length,
      }
    : null;

  return (
    <main className={s.container}>
      <section className={s.banner}>
        <div className={s.bannerText}>
          <div className={s.bannerEyebrow}>Train</div>
          <div className={s.bannerGreeting}>{greeting}</div>
          <div className={s.bannerSub}>
            Your own SAT practice and review — kept separate from the
            rosters you teach. Drill weak spots, take a full-length test,
            or work through what your manager assigned.
          </div>
        </div>
        <div className={s.bannerActions}>
          {resumeInfo && (
            <Link
              href={`/tutor/training/practice/s/${resumeInfo.sessionId}/${resumeInfo.position}`}
              className={s.btnSecondary}
            >
              Resume session
            </Link>
          )}
          <Link href="/tutor/training/practice" className={s.btnPrimary}>
            Start training
          </Link>
        </div>
      </section>

      {fullProfile?.sat_test_date && (
        <StudyCountdown
          isoDate={fullProfile.sat_test_date}
          todayMs={nowMs}
          compact
        />
      )}

      <section className={s.statsRow}>
        <StatTile label="Questions attempted" value={total.toLocaleString()} />
        <StatTile
          label="Accuracy"
          value={accuracy == null ? '—' : `${accuracy}%`}
          tone={accTone(accuracy)}
        />
        <StatTile label="This week" value={(weekAttempts ?? 0).toLocaleString()} />
        <StatTile
          label="Weak queue"
          value={weakQueue.length}
          sub={
            weakQueue.length === 0
              ? 'Nothing to drill yet'
              : 'Questions ready in /tutor/training/review'
          }
          tone={weakQueue.length > 0 ? 'warn' : 'neutral'}
        />
      </section>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.sectionLabel}>Recently finished</div>
            <div className={s.cardSub}>
              The work you&apos;ve closed out most recently — click for
              its report.
            </div>
          </div>
        </div>
        {recentlyFinished.length === 0 ? (
          <p className={s.empty}>
            Nothing here yet.{' '}
            <Link href="/tutor/training/practice" className={s.inlineLink}>
              Start a practice session →
            </Link>
          </p>
        ) : (
          <ul className={s.finishedList}>
            {recentlyFinished.map((row) => (
              <li key={`${row.kind}-${row.id}`}>
                <Link href={row.href} className={s.finishedRow}>
                  <span className={`${s.typeBadge} ${s[`typeBadge_${row.kind}`]}`}>
                    {kindLabel(row.kind)}
                  </span>
                  <div className={s.finishedMain}>
                    <div className={s.finishedTitle}>
                      {row.title}
                      {row.subtitle && (
                        <span className={s.finishedSubtitle}>
                          {' '}· {row.subtitle}
                        </span>
                      )}
                    </div>
                    <div className={s.finishedMeta}>
                      <span className={`${s.finishedMetric} ${s[`metricTone_${row.tone}`]}`}>
                        {row.metric}
                      </span>
                      <span className={s.finishedDot}>·</span>
                      <span className={s.finishedDate}>
                        {formatRowDate(row.finishedAt)}
                      </span>
                    </div>
                  </div>
                  <span className={s.finishedChevron} aria-hidden="true">→</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.sectionLabel}>Pending from your manager</div>
            <div className={s.cardSub}>
              {pendingAssignments.length === 0
                ? "Nothing pending — work through your weak queue or take a practice test."
                : 'Work assigned to you, soonest first.'}
            </div>
          </div>
          <Link href="/tutor/training/assignments" className={s.cardHeaderLink}>
            View all →
          </Link>
        </div>
        {pendingAssignments.length > 0 && (
          <ul className={s.assignmentList}>
            {pendingAssignments.map((a) => {
              const title = a.title
                ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
                ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
                ?? 'Training assignment';
              return (
                <li key={a.id}>
                  <Link
                    href={`/tutor/training/assignments/${a.id}`}
                    className={s.assignmentRow}
                  >
                    <span className={s.assignmentTitle}>{title}</span>
                    {a.due_date && (
                      <span className={isOverdue(a.due_date, nowMs) ? s.dueOverdue : s.due}>
                        Due {formatRowDate(a.due_date)}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function StatTile({ label, value, sub, tone = 'neutral' }) {
  const cls = `${s.statCard} ${s[`statCard_${tone}`] ?? ''}`;
  return (
    <div className={cls}>
      <div className={s.statValue}>{value}</div>
      <div className={s.statLabel}>{label}</div>
      {sub && <div className={s.statSub}>{sub}</div>}
    </div>
  );
}

function kindLabel(kind) {
  if (kind === 'assignment') return 'Assignment';
  if (kind === 'test') return 'Practice test';
  if (kind === 'session') return 'Training';
  return kind;
}

function accTone(pct) {
  if (pct == null) return 'neutral';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'ok';
  return 'warn';
}

function isOverdue(iso, nowMs) {
  return Boolean(iso && Date.parse(iso) < nowMs);
}

function formatRowDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
