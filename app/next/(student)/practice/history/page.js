// Practice history — list of the student's past practice sessions
// with a Review button per row.
//
// URL: /practice/history
//
// One row per practice_sessions row (mode='practice' only —
// review-mode and tutor-training sessions don't belong here).
// Each row shows the session date, its size, the student's
// correct-count at the time, and a Review button linking to
// /practice/review/[sessionId].
//
// Completion state is inferred from attempts: a session is
// "completed" when every question in question_ids has at least
// one attempt by this user. Partial sessions still render with a
// progress indicator and a Resume button in place of Review.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import {
  submitPracticeSession,
  abandonPracticeSession,
} from '@/lib/practice/session-actions';
import { SessionLifecycleButtons } from '../../review/SessionLifecycleButtons';
import s from './page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function PracticeHistoryPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // 1) All practice-mode sessions for this user. RLS scopes to
  //    user_id = auth.uid(); the extra .eq('user_id', ...) is
  //    belt-and-suspenders / makes the query intent explicit.
  const { data: sessions } = await supabase
    .from('practice_sessions')
    .select('id, created_at, question_ids, current_position, mode, filter_criteria, status')
    .eq('user_id', user.id)
    .eq('mode', 'practice')
    .neq('status', 'abandoned')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

  // 2) Pull all attempts that could match any of these sessions'
  //    question ids. The per-row completion / accuracy is computed
  //    in memory from that set. Filtering by created_at >= oldest
  //    session keeps the window bounded.
  const oldestCreatedAt = sessions?.length
    ? sessions[sessions.length - 1].created_at
    : new Date().toISOString();
  const allQuestionIds = Array.from(
    new Set(
      (sessions ?? []).flatMap((row) =>
        Array.isArray(row.question_ids) ? row.question_ids : [],
      ),
    ),
  );

  let attempts = [];
  if (allQuestionIds.length > 0) {
    const { data } = await supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', user.id)
      .in('question_id', allQuestionIds)
      .gte('created_at', oldestCreatedAt)
      .order('created_at', { ascending: true });
    attempts = data ?? [];
  }

  // 3) Build a per-session summary. For each session, count how
  //    many of its question_ids have a first attempt inside the
  //    session window (created_at >= session.created_at). We
  //    snapshot `now` once here so downstream components stay
  //    pure w.r.t. time (React 19 / compiler).
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const rows = (sessions ?? []).map((row) => buildRow(row, attempts));

  // Summary stats strip (aggregated over the fetched window).
  const completedRows = rows.filter((r) => r.completed);
  const totalAttempted = completedRows.reduce((sum, r) => sum + r.attempted, 0);
  const totalCorrect = completedRows.reduce((sum, r) => sum + r.correct, 0);
  const overallAccuracy =
    totalAttempted > 0
      ? Math.round((totalCorrect / totalAttempted) * 100)
      : null;
  const thisWeekCount = rows.filter(
    (r) => r.createdAt && Date.parse(r.createdAt) >= sevenDaysAgoMs,
  ).length;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Practice</div>
        <h1 className={s.h1}>Practice history</h1>
        <p className={s.sub}>
          Every self-guided session you&apos;ve run, newest first.
          Click Review to see the full report, or Resume to pick up
          a partial one.
        </p>
      </header>

      {rows.length > 0 && (
        <div className={s.statsStrip}>
          <div className={s.statTile}>
            <div className={s.statValue}>{rows.length}</div>
            <div className={s.statLabel}>Sessions shown</div>
          </div>
          <div className={s.statTile}>
            <div className={s.statValue}>
              {overallAccuracy == null ? '—' : `${overallAccuracy}%`}
            </div>
            <div className={s.statLabel}>Accuracy across completed</div>
          </div>
          <div className={s.statTile}>
            <div className={s.statValue}>{thisWeekCount}</div>
            <div className={s.statLabel}>This week</div>
          </div>
        </div>
      )}

      {rows.length === 0 ? (
        <div className={s.card}>
          <p className={s.empty}>
            No practice sessions yet.{' '}
            <Link href="/practice/start" className={s.link}>
              Start your first session →
            </Link>
          </p>
        </div>
      ) : (
        <ul className={s.list}>
          {rows.map((r) => (
            <li key={r.id} className={s.row}>
              <div className={s.rowLeft}>
                <div className={s.rowDate}>{formatRowDate(r.createdAt)}</div>
                <div className={s.rowMeta}>
                  {r.total} question{r.total === 1 ? '' : 's'}
                  {r.completed
                    ? ` · ${r.correct} correct · ${r.accuracyPct}%`
                    : ` · ${r.attempted}/${r.total} attempted`}
                </div>
              </div>
              <div className={s.rowRight}>
                {r.completed ? (
                  <>
                    <AccuracyBadge pct={r.accuracyPct} />
                    <Link
                      href={`/practice/review/${r.id}`}
                      className={s.reviewBtn}
                    >
                      Review →
                    </Link>
                  </>
                ) : (
                  <>
                    <span className={s.partialBadge}>In progress</span>
                    <SessionLifecycleButtons
                      sessionId={r.id}
                      resumeHref={`/practice/s/${r.id}/${r.resumePosition}`}
                      submitAction={submitPracticeSession}
                      abandonAction={abandonPracticeSession}
                    />
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className={s.footer}>
        <Link href="/practice/start" className={s.footerLinkPrimary}>
          Start a new session →
        </Link>
      </div>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function buildRow(session, allAttempts) {
  const questionIds = Array.isArray(session.question_ids)
    ? session.question_ids
    : [];
  const total = questionIds.length;
  const qidSet = new Set(questionIds);

  // Attempts that both belong to one of this session's questions
  // AND were created on or after the session. Earliest wins per
  // qid ("initial answer").
  const firstByQid = new Map();
  for (const a of allAttempts) {
    if (!qidSet.has(a.question_id)) continue;
    if (a.created_at < session.created_at) continue;
    if (!firstByQid.has(a.question_id)) firstByQid.set(a.question_id, a);
  }

  const attempted = firstByQid.size;
  let correct = 0;
  for (const a of firstByQid.values()) if (a.is_correct) correct += 1;

  // Completion is driven by the session.status column, which is
  // flipped to 'completed' by the Submit Set action (or the
  // runner redirect when a student walks off the end). We still
  // compute attempted + correct in memory so completed sessions
  // can show an accuracy pill, even ones that were submitted
  // with unanswered questions.
  const completed = session.status === 'completed';
  const accuracyPct = attempted > 0
    ? Math.round((correct / attempted) * 100)
    : null;

  return {
    id: session.id,
    createdAt: session.created_at,
    total,
    attempted,
    correct,
    completed,
    accuracyPct,
    // Resume lands them on the first unanswered position, or the
    // saved current_position, whichever is earlier. Clamped to the
    // session length so a wonky cursor can't 404 the runner.
    resumePosition: Math.min(
      Math.max(session.current_position ?? 0, 0),
      Math.max(total - 1, 0),
    ),
  };
}

function AccuracyBadge({ pct }) {
  if (pct == null) return null;
  const tone =
    pct >= 80 ? s.accGood :
    pct >= 50 ? s.accOk :
    s.accBad;
  return <span className={`${s.accBadge} ${tone}`}>{pct}%</span>;
}

function formatRowDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (sameDay) return `Today, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  if (isYesterday) return `Yesterday, ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}
