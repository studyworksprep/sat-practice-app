// Review tab — landing page for everything a student has
// completed. Three sections:
//
//   1. Practice sessions — recent practice_sessions (mode='practice'),
//      linking to the per-session Practice Session Report at
//      /practice/review/[sessionId].
//   2. Practice tests — completed practice_test_attempts_v2, linking
//      to the per-test results page.
//   3. Practice your weak questions — the legacy "review pool" UI
//      (wrong + marked questions) retained at the bottom so that
//      feature path still works. It'll migrate into per-domain
//      drill-downs later but stays here so nothing regresses today.
//
// All three load server-side so the client just renders.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { formatRelativeShort } from '@/lib/formatters';
import { createReviewSession } from './actions';
import {
  submitPracticeSession,
  abandonPracticeSession,
} from '@/lib/practice/session-actions';
import { ReviewLauncher } from './ReviewLauncher';
import { SessionLifecycleButtons } from './SessionLifecycleButtons';
import s from './Review.module.css';

export const dynamic = 'force-dynamic';

const RECENT_SESSIONS_CAP = 10;

export default async function StudentReviewPage({ searchParams }) {
  const sp = await searchParams;
  const completed = sp?.complete === '1';

  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // Parallel loads.
  const [
    { data: sessionRows },
    { data: testAttempts },
    { data: statusRows },
  ] = await Promise.all([
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, current_position, status')
      .eq('user_id', user.id)
      .eq('mode', 'practice')
      .neq('status', 'abandoned')
      .order('created_at', { ascending: false })
      .limit(RECENT_SESSIONS_CAP),
    supabase
      .from('practice_test_attempts_v2')
      .select(`
        id, status, finished_at, started_at,
        composite_score, rw_scaled, math_scaled,
        practice_test:practice_tests_v2(id, code, name)
      `)
      .eq('user_id', user.id)
      .order('started_at', { ascending: false })
      .limit(20),
    // Weak-questions pool counts — unchanged from the prior page.
    supabase
      .from('question_status')
      .select('question_id, last_is_correct, marked_for_review, last_attempt_at')
      .eq('user_id', user.id)
      .or('last_is_correct.eq.false,marked_for_review.eq.true')
      .order('last_attempt_at', { ascending: false })
      .limit(2000),
  ]);

  const sessions = (sessionRows ?? [])
    .filter((r) => Array.isArray(r.question_ids) && r.question_ids.length > 0)
    .map((r) => {
      const total = r.question_ids.length;
      return {
        id: r.id,
        createdAt: r.created_at,
        total,
        completed: r.status === 'completed',
        resumePosition: Math.min(Math.max(r.current_position ?? 0, 0), Math.max(total - 1, 0)),
      };
    });

  const tests = (testAttempts ?? [])
    .filter((t) => t.practice_test != null)
    .map((t) => ({
      id: t.id,
      status: t.status,
      startedAt: t.started_at,
      finishedAt: t.finished_at,
      composite: t.composite_score,
      rwScaled: t.rw_scaled,
      mathScaled: t.math_scaled,
      testName: t.practice_test.name,
      testCode: t.practice_test.code,
    }));

  const wrongCount   = (statusRows ?? []).filter((r) => r.last_is_correct === false).length;
  const markedCount  = (statusRows ?? []).filter((r) => r.marked_for_review === true).length;
  const reviewPool   = (statusRows ?? []).length;
  const lastReviewAt = (statusRows ?? [])[0]?.last_attempt_at ?? null;

  return (
    <main className={s.container}>
      <header className={s.header}>
        <h1 className={s.h1}>Review</h1>
        <p className={s.sub}>
          Revisit your past practice and tests, or drill into the
          questions you&apos;ve gotten wrong.
        </p>
      </header>

      {completed && (
        <div className={s.toast} role="status">
          Review session complete. Pick another set below to keep going.
        </div>
      )}

      {/* ---------- Practice sessions ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Practice sessions</div>
          {sessions.length > 0 && (
            <Link href="/practice/history" className={s.cardHeaderLink}>
              All sessions →
            </Link>
          )}
        </div>
        {sessions.length === 0 ? (
          <p className={s.empty}>
            No practice sessions yet.{' '}
            <Link href="/practice/start" className={s.inlineLink}>
              Start one →
            </Link>
          </p>
        ) : (
          <ul className={s.list}>
            {sessions.map((r) => (
              <li key={r.id} className={s.row}>
                <div className={s.rowLeft}>
                  <div className={s.rowTitle}>
                    {r.total} question{r.total === 1 ? '' : 's'}
                    {!r.completed && <span className={s.partialTag}> · In progress</span>}
                  </div>
                  <div className={s.rowMeta}>{formatRelativeShort(r.createdAt) ?? '—'}</div>
                </div>
                {r.completed ? (
                  <Link href={`/practice/review/${r.id}`} className={s.reviewBtn}>
                    Review →
                  </Link>
                ) : (
                  <SessionLifecycleButtons
                    sessionId={r.id}
                    resumeHref={`/practice/s/${r.id}/${r.resumePosition}`}
                    submitAction={submitPracticeSession}
                    abandonAction={abandonPracticeSession}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Practice tests ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Practice tests</div>
        </div>
        {tests.length === 0 ? (
          <p className={s.empty}>
            No practice tests yet.{' '}
            <Link href="/practice/start" className={s.inlineLink}>
              Start one →
            </Link>
          </p>
        ) : (
          <ul className={s.list}>
            {tests.map((t) => (
              <li key={t.id} className={s.row}>
                <div className={s.rowLeft}>
                  <div className={s.rowTitle}>
                    {t.testName}
                    {t.status !== 'completed' && (
                      <span className={s.partialTag}>
                        {' · '}{t.status === 'in_progress' ? 'In progress' : 'Abandoned'}
                      </span>
                    )}
                  </div>
                  <div className={s.rowMeta}>
                    <span className={s.rowCode}>{t.testCode}</span>
                    {' · '}
                    {formatRelativeShort(t.finishedAt ?? t.startedAt) ?? '—'}
                  </div>
                </div>
                <div className={s.testRowRight}>
                  {t.status === 'completed' && t.composite != null && (
                    <div className={s.scoreCluster}>
                      <div className={s.scoreBadge}>
                        <div className={s.scoreBadgeNum}>{t.composite}</div>
                        <div className={s.scoreBadgeLabel}>Total</div>
                      </div>
                      {t.rwScaled != null && (
                        <div className={s.scoreBadge}>
                          <div className={`${s.scoreBadgeNum} ${s.scoreRw}`}>{t.rwScaled}</div>
                          <div className={s.scoreBadgeLabel}>RW</div>
                        </div>
                      )}
                      {t.mathScaled != null && (
                        <div className={s.scoreBadge}>
                          <div className={`${s.scoreBadgeNum} ${s.scoreMath}`}>{t.mathScaled}</div>
                          <div className={s.scoreBadgeLabel}>Math</div>
                        </div>
                      )}
                    </div>
                  )}
                  {t.status === 'completed' ? (
                    <Link
                      href={`/practice/test/attempt/${t.id}/results`}
                      className={s.reviewBtn}
                    >
                      Review →
                    </Link>
                  ) : t.status === 'in_progress' ? (
                    <Link
                      href={`/practice/test/attempt/${t.id}`}
                      className={s.resumeBtn}
                    >
                      Resume →
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ---------- Weak-questions pool (retained legacy feature) ---------- */}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.sectionLabel}>Practice your weak questions</div>
        </div>
        {reviewPool === 0 ? (
          <p className={s.empty}>
            Nothing to review yet. Practice some questions first,
            and anything you get wrong (or flag for review) will show
            up here.
          </p>
        ) : (
          <>
            <div className={s.poolStats}>
              <div className={s.poolStat}>
                <div className={s.poolStatValue}>{wrongCount}</div>
                <div className={s.poolStatLabel}>Wrong answers</div>
              </div>
              <div className={s.poolStat}>
                <div className={s.poolStatValue}>{markedCount}</div>
                <div className={s.poolStatLabel}>Marked for review</div>
              </div>
              <div className={s.poolStat}>
                <div className={s.poolStatValue}>{reviewPool}</div>
                <div className={s.poolStatLabel}>Total reviewable</div>
              </div>
              <div className={s.poolStat}>
                <div className={s.poolStatValue}>
                  {formatRelativeShort(lastReviewAt) ?? '—'}
                </div>
                <div className={s.poolStatLabel}>Last activity</div>
              </div>
            </div>
            <ReviewLauncher
              counts={{ wrong: wrongCount, marked: markedCount, total: reviewPool }}
              createReviewSessionAction={createReviewSession}
            />
          </>
        )}
      </section>
    </main>
  );
}
