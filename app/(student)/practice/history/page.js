// Practice history — list of the student's past practice sessions
// with a Review button per row.
//
// URL: /practice/history?test=sat|act
//
// One row per practice_sessions row (mode='practice' or 'review'
// — a Weak Questions Drill is just a practice session assembled by
// a pre-determined scheme, so it lists here like any other;
// tutor-training sessions don't belong here).
// Each row shows the session date, its size, the student's
// correct-count at the time, and a Review button linking to
// /practice/review/[sessionId].
//
// Completion state is inferred from attempts: a session is
// "completed" when every question in question_ids has at least
// one attempt by this user. Partial sessions still render with a
// progress indicator and a Resume button in place of Review.
//
// Test-type slice. SAT-first tabs per docs/architecture-plan.md §3.4,
// matching /practice/start and /practice/tests: the page accepts a
// `?test=sat|act` query param and forks the two reads below. Only the
// data source forks — buildRow and the whole render tree are
// test-type agnostic, and /practice/review/[sessionId] already
// branches to the ACT report builder on session.test_type.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import {
  submitPracticeSession,
  abandonPracticeSession,
} from '@/lib/practice/session-actions';
import { PencilIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { SessionLifecycleButtons } from '../../review/SessionLifecycleButtons';
import s from './page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

export default async function PracticeHistoryPage({ searchParams }) {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // ?test=sat|act slice — SAT-first. Anything malformed lands on SAT,
  // same as the launcher and the practice-tests hub. No redirect on a
  // bad value: tab navigation is the canonical way to switch.
  const sp = (await searchParams) ?? {};
  const testParam = typeof sp.test === 'string' ? sp.test.toLowerCase() : '';
  const testType = testParam === 'act' ? 'act' : 'sat';
  const isAct = testType === 'act';

  // 1) All self-guided sessions for this user — practice plus
  //    review drills, which are practice sessions built from the
  //    weak-questions scheme. RLS scopes to
  //    user_id = auth.uid(); the extra .eq('user_id', ...) is
  //    belt-and-suspenders / makes the query intent explicit.
  //
  //    ACT full-form practice tests also live in practice_sessions
  //    (they're virtual constructs over act_questions — §3.4), but
  //    they already have their own surface on the ACT tests hub and
  //    their report lives at /practice/test/act/attempt/*/results.
  //    They're dropped below so this list stays "self-guided drills
  //    only", matching the SAT side where practice tests live in an
  //    entirely separate table.
  //
  //    That drop happens in memory rather than as a filter_criteria
  //    predicate: `kind` is absent (not null-valued) on drill rows, so
  //    a `neq` predicate would discard them too, and the or-group that
  //    handles both cases isn't a shape used anywhere else here. The
  //    ACT read over-fetches to compensate so a page that does contain
  //    practice-test rows still fills to PAGE_SIZE.
  const { data: rawSessions } = await supabase
    .from('practice_sessions')
    .select('id, created_at, question_ids, current_position, mode, filter_criteria, status')
    .eq('user_id', user.id)
    .in('mode', ['practice', 'review'])
    .eq('test_type', testType)
    .neq('status', 'abandoned')
    .order('created_at', { ascending: false })
    .limit(isAct ? PAGE_SIZE * 2 : PAGE_SIZE);

  const sessions = (rawSessions ?? [])
    .filter((row) => row.filter_criteria?.kind !== 'practice_test')
    .slice(0, PAGE_SIZE);

  // 2) Pull all attempts that could match any of these sessions'
  //    question ids. The per-row completion / accuracy is computed
  //    in memory from that set. Filtering by created_at >= oldest
  //    session keeps the window bounded.
  //
  //    ACT attempts live in their own table (act_attempts) keyed to
  //    act_questions — reading `attempts` for an ACT session would
  //    match nothing and every row would render 0/N attempted.
  const attemptsTable = isAct ? 'act_attempts' : 'attempts';
  const oldestCreatedAt = sessions.length
    ? sessions[sessions.length - 1].created_at
    : new Date().toISOString();
  const allQuestionIds = Array.from(
    new Set(
      sessions.flatMap((row) =>
        Array.isArray(row.question_ids) ? row.question_ids : [],
      ),
    ),
  );

  let attempts = [];
  if (allQuestionIds.length > 0) {
    const { data } = await supabase
      .from(attemptsTable)
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
  const rows = sessions.map((row) => buildRow(row, attempts));

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

  const startHref = isAct ? '/practice/start?test=act' : '/practice/start';

  return (
    <>
      <TestTypeTabs current={testType} />
      <main className={s.container}>
        <header className={s.header}>
          <div className={s.eyebrow}>Practice</div>
          <h1 className={s.h1}>{isAct ? 'ACT practice history' : 'Practice history'}</h1>
          <p className={s.sub}>
            Every self-guided {isAct ? 'ACT ' : ''}session you&apos;ve run, newest
            first. Click Review to see the full report, or Resume to pick up
            a partial one.
            {isAct && ' Full-length ACT tests live on the Practice tests tab.'}
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

        <div className={s.sessionsHead}>
          <div className={s.sessionsLabel}>
            <IconTile icon={PencilIcon} palette="gold" size="sm" />
            Sessions
          </div>
          {rows.length > 0 && (
            <span className={s.sessionsCount}>
              {rows.length} session{rows.length === 1 ? '' : 's'}
            </span>
          )}
        </div>

        {rows.length === 0 ? (
          <div className={s.card}>
            <p className={s.empty}>
              No {isAct ? 'ACT ' : ''}practice sessions yet.{' '}
              <Link href={startHref} className={s.link}>
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
          <Link href={startHref} className={s.footerLinkPrimary}>
            Start a new session →
          </Link>
        </div>
      </main>
    </>
  );
}

// ──────────────────────────────────────────────────────────────
// Tabs. SAT first, ACT second — §3.4 ("SAT-first tabs, no
// preferred_test_type column"). Same shape as the launcher's and
// the practice-tests hub's tabs: plain server-rendered links, so
// switching tabs is just a navigation with no client state.
// ──────────────────────────────────────────────────────────────

function TestTypeTabs({ current }) {
  return (
    <nav className={s.tabs} aria-label="Test type">
      <Link
        href="/practice/history"
        className={`${s.tab} ${current === 'sat' ? s.tabActive : ''}`}
        aria-current={current === 'sat' ? 'page' : undefined}
      >
        SAT
      </Link>
      <Link
        href="/practice/history?test=act"
        className={`${s.tab} ${current === 'act' ? s.tabActive : ''}`}
        aria-current={current === 'act' ? 'page' : undefined}
      >
        ACT
      </Link>
    </nav>
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
