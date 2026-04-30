// Tutor training history — list of the tutor/manager/admin's own
// past training sessions. Mirrors the student /practice/history
// page one mode over: mode='training' (instead of 'practice') and
// tutor-tree URL prefix on the resume/review links.
//
// URL: /tutor/training/practice/history
//
// Shares the student page's CSS module to keep the two surfaces
// visually identical. If they diverge, the right move is to lift
// the body into a shared component — but for now the divergence
// is just a mode filter and a URL prefix, so the cost of a small
// duplicate page is lower than the cost of a premature abstraction.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import {
  submitPracticeSession,
  abandonPracticeSession,
} from '@/lib/practice/session-actions';
import { PencilIcon } from '@/lib/ui/icons';
import { IconTile } from '@/lib/ui/IconTile';
import { SessionLifecycleButtons } from '../../../../../(student)/review/SessionLifecycleButtons';
import s from '../../../../../(student)/practice/history/page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const URL_PREFIX = '/tutor/training/practice';

export default async function TutorTrainingHistoryPage() {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/practice/history');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  const { data: sessions } = await supabase
    .from('practice_sessions')
    .select('id, created_at, question_ids, current_position, mode, filter_criteria, status')
    .eq('user_id', user.id)
    .eq('mode', 'training')
    .neq('status', 'abandoned')
    .order('created_at', { ascending: false })
    .limit(PAGE_SIZE);

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

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const sevenDaysAgoMs = nowMs - 7 * 24 * 60 * 60 * 1000;
  const rows = (sessions ?? []).map((row) => buildRow(row, attempts));

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
        <div className={s.eyebrow}>Train · Practice</div>
        <h1 className={s.h1}>Practice history</h1>
        <p className={s.sub}>
          Every self-guided training session you&apos;ve run, newest
          first. Click Review to see the full report, or Resume to
          pick up a partial one.
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
            No training sessions yet.{' '}
            <Link href={URL_PREFIX} className={s.link}>
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
                      href={`${URL_PREFIX}/review/${r.id}`}
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
                      resumeHref={`${URL_PREFIX}/s/${r.id}/${r.resumePosition}`}
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
        <Link href={URL_PREFIX} className={s.footerLinkPrimary}>
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

  const firstByQid = new Map();
  for (const a of allAttempts) {
    if (!qidSet.has(a.question_id)) continue;
    if (a.created_at < session.created_at) continue;
    if (!firstByQid.has(a.question_id)) firstByQid.set(a.question_id, a);
  }

  const attempted = firstByQid.size;
  let correct = 0;
  for (const a of firstByQid.values()) if (a.is_correct) correct += 1;

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
