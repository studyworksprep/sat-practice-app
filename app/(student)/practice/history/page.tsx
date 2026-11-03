// Practice history — the student's self-guided practice sessions.
//
// URL: /practice/history?test=sat|act&status=open|done&topic=…&show=N
//
// One row per practice_sessions row (mode='practice' or 'review' — a
// Weak Questions Drill is just a practice session assembled by a
// pre-determined scheme, so it lists here like any other;
// tutor-training sessions don't belong here). ACT full-form practice
// tests also live in practice_sessions (virtual constructs over
// act_questions — §3.4) but have their own hub and report, so they're
// excluded, matching the SAT side where tests live in their own table.
//
// Layout: PageHeader, status + topic filters, a "Still open" block
// (Resume / Submit / Abandon), then finished sessions grouped by day
// in the report time zone — the newest day open, older days folded.
// Open sessions past the first few fold too, so a pile of abandoned-
// in-spirit sets can't push the finished ones off the page.
// "Load earlier sessions" widens the window (`show`) rather than
// paging, so what's on screen stays put.
//
// Test-type slice: `?test=` (else the sidebar switch's stored choice,
// lib/practice/test-type-server.ts) forks the reads; the rows and
// render are test-type agnostic, and /practice/review/[sessionId]
// already branches to the ACT report on session.test_type.

import { redirect } from 'next/navigation';
import Link from 'next/link';
import { requireUser } from '@/lib/api/auth';
import { paginate } from '@/lib/api/paginate';
import { PageHeader } from '@/lib/ui/PageHeader';
import {
  submitPracticeSession,
  abandonPracticeSession,
} from '@/lib/practice/session-actions';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import { resolveTestType } from '@/lib/practice/test-type-server';
import {
  buildHistoryRow,
  formatRowTime,
  groupRowsByDay,
  labelSession,
} from '@/lib/practice/history-rows';
import type { HistoryAttempt, HistoryRow, HistorySession } from '@/lib/practice/history-rows';
import { SessionLifecycleButtons } from '../../review/SessionLifecycleButtons';
import { TopicSelect } from './TopicSelect';
import s from './page.module.css';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;
const MAX_SHOWN = 500;
/** Open sessions shown before the rest fold away. */
const OPEN_VISIBLE = 3;

type Status = 'all' | 'open' | 'done';

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function PracticeHistoryPage({ searchParams }: PageProps) {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  const sp = await searchParams;
  const testParam = first(sp.test);
  const testType = await resolveTestType(testParam);
  const isAct = testType === 'act';
  const statusParam = first(sp.status);
  const status: Status = statusParam === 'open' || statusParam === 'done' ? statusParam : 'all';
  const topic = first(sp.topic) ?? '';
  const shown = Math.min(
    MAX_SHOWN,
    Math.max(PAGE_SIZE, Math.ceil((Number(first(sp.show)) || PAGE_SIZE) / PAGE_SIZE) * PAGE_SIZE),
  );

  // eslint-disable-next-line react-hooks/purity -- one snapshot per request
  const nowMs = Date.now();
  const weekAgo = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();

  // Every list query shares this scope. RLS limits rows to
  // user_id = auth.uid(); the explicit .eq() states the intent. `kind`
  // is absent (not null-valued) on drill rows, so the practice-test
  // exclusion has to accept a missing kind as well as a different one.
  const scoped = <Q extends { eq: (c: string, v: string) => Q; in: (c: string, v: string[]) => Q; or: (f: string) => Q }>(q: Q) =>
    q.eq('user_id', user.id)
      .in('mode', ['practice', 'review'])
      .eq('test_type', testType)
      .or('filter_criteria->>kind.is.null,filter_criteria->>kind.neq.practice_test');

  const listQuery = scoped(
    supabase
      .from('practice_sessions')
      .select('id, created_at, question_ids, current_position, status, filter_criteria', { count: 'exact' }),
  );
  const filteredList =
    status === 'open' ? listQuery.eq('status', 'in_progress')
    : status === 'done' ? listQuery.eq('status', 'completed')
    : listQuery.neq('status', 'abandoned');

  const [page, { count: openCount }, { count: weekCount }, { data: taxonomyRows }] = await Promise.all([
    paginate(filteredList, { page: 1, pageSize: shown, order: { column: 'created_at', ascending: false } }),
    scoped(supabase.from('practice_sessions').select('id', { count: 'exact', head: true }))
      .eq('status', 'in_progress'),
    scoped(supabase.from('practice_sessions').select('id', { count: 'exact', head: true }))
      .neq('status', 'abandoned')
      .gte('created_at', weekAgo),
    isAct
      ? Promise.resolve({ data: [] as Array<{ skill_name: string | null; domain_name: string | null }> })
      : supabase.from('published_question_taxonomy').select('skill_name, domain_name'),
  ]);
  const sessions = page.items as HistorySession[];

  // Attempts that could match any listed session, oldest first so the
  // first per question is the session's initial answer. ACT attempts
  // live in act_attempts, keyed to act_questions.
  const oldestCreatedAt = sessions.length ? sessions[sessions.length - 1].created_at : new Date(nowMs).toISOString();
  const allQuestionIds = [...new Set(sessions.flatMap((row) =>
    Array.isArray(row.question_ids) ? (row.question_ids as string[]) : []))];
  const assignmentIds = [...new Set(sessions.flatMap((row) => {
    const fc = row.filter_criteria as { assignment_id?: unknown } | null;
    return typeof fc?.assignment_id === 'string' ? [fc.assignment_id] : [];
  }))];

  const [{ data: attemptRows }, { data: assignmentRows }] = await Promise.all([
    allQuestionIds.length === 0
      ? Promise.resolve({ data: [] as HistoryAttempt[] })
      : (isAct
          ? supabase.from('act_attempts').select('question_id, is_correct, created_at')
          : supabase.from('attempts').select('question_id, is_correct, created_at'))
          .eq('user_id', user.id)
          .in('question_id', allQuestionIds)
          .gte('created_at', oldestCreatedAt)
          .order('created_at', { ascending: true }),
    assignmentIds.length === 0
      ? Promise.resolve({ data: [] as Array<{ id: string; title: string | null }> })
      : supabase.from('assignments_v2').select('id, title').in('id', assignmentIds),
  ]);

  const labelCtx = {
    domainOfSkill: new Map(
      (taxonomyRows ?? [])
        .filter((r) => r.skill_name && r.domain_name)
        .map((r) => [r.skill_name as string, r.domain_name as string]),
    ),
    assignmentTitles: new Map(
      (assignmentRows ?? []).filter((a) => a.title).map((a) => [a.id, a.title as string]),
    ),
    actSectionLabel: sectionLabel,
  };
  const attempts = (attemptRows ?? []) as HistoryAttempt[];
  const allRows = sessions.map((row) =>
    buildHistoryRow(row, attempts, labelSession(row.filter_criteria, labelCtx)));

  const topics = [...new Set(allRows.map((r) => r.label.group))].sort((a, b) => a.localeCompare(b));
  const rows = topic ? allRows.filter((r) => r.label.group === topic) : allRows;
  const openRows = rows.filter((r) => !r.completed);
  const doneRows = rows.filter((r) => r.completed);
  const now = new Date(nowMs);
  const dayGroups = groupRowsByDay(doneRows, now);

  // Header line, over the loaded window.
  const doneAttempted = allRows.filter((r) => r.completed).reduce((n, r) => n + r.attempted, 0);
  const doneCorrect = allRows.filter((r) => r.completed).reduce((n, r) => n + r.correct, 0);
  const doneAccuracy = doneAttempted > 0 ? Math.round((doneCorrect / doneAttempted) * 100) : null;
  const week = weekCount ?? 0;
  const description = [
    `${week} session${week === 1 ? '' : 's'} this week`,
    doneAccuracy == null ? null : `${doneAccuracy}% correct across finished sessions`,
  ].filter(Boolean).join(' · ');

  // Links keep the other filters.
  const keep: Record<string, string> = {};
  if (testParam === 'sat' || testParam === 'act') keep.test = testParam;
  const href = (over: { status?: Status; topic?: string; show?: number }) => {
    const qs = new URLSearchParams(keep);
    const st = over.status ?? status;
    const tp = over.topic ?? topic;
    if (st !== 'all') qs.set('status', st);
    if (tp) qs.set('topic', tp);
    if (over.show) qs.set('show', String(over.show));
    const q = qs.toString();
    return q ? `/practice/history?${q}` : '/practice/history';
  };
  const startHref = isAct ? '/practice/start?test=act' : '/practice/start';
  const statusTabs: Array<{ id: Status; label: string }> = [
    { id: 'all', label: 'All' },
    { id: 'open', label: `In progress${openCount ? ` · ${openCount}` : ''}` },
    { id: 'done', label: 'Finished' },
  ];

  return (
    <main className={s.container}>
      <PageHeader
        eyebrow={`Practice · ${testType.toUpperCase()}`}
        title="Practice history"
        description={
          <>
            {description}
            {isAct && <> · Full-length ACT tests live on <Link href="/practice/tests?test=act">Practice tests</Link>.</>}
          </>
        }
        actions={<Link href={startHref} className={s.primaryBtn}>New practice set</Link>}
      />

      {(allRows.length > 0 || status !== 'all' || topic) && (
        <div className={s.filters}>
          <nav className={s.segmented} aria-label="Filter by status">
            {statusTabs.map((t) => (
              <Link
                key={t.id}
                href={href({ status: t.id })}
                className={t.id === status ? `${s.segment} ${s.segmentOn}` : s.segment}
                aria-current={t.id === status ? 'page' : undefined}
              >
                {t.label}
              </Link>
            ))}
          </nav>
          {topics.length > 1 || topic ? (
            <TopicSelect
              topics={topic && !topics.includes(topic) ? [...topics, topic] : topics}
              value={topic}
              keep={{ ...keep, ...(status !== 'all' ? { status } : {}) }}
            />
          ) : null}
        </div>
      )}

      {rows.length === 0 ? (
        <div className={s.emptyCard}>
          {allRows.length === 0 && status === 'all' ? (
            <>
              No {isAct ? 'ACT ' : ''}practice sessions yet.{' '}
              <Link href={startHref}>Build your first set →</Link>
            </>
          ) : (
            <>
              Nothing matches these filters.{' '}
              <Link href={href({ status: 'all', topic: '' })}>Show everything</Link>
            </>
          )}
        </div>
      ) : (
        <>
          {openRows.length > 0 && (
            <section className={s.block} aria-labelledby="history-open">
              <h2 id="history-open" className={s.blockTitle}>Still open</h2>
              <OpenList rows={openRows.slice(0, OPEN_VISIBLE)} now={now} />
              {openRows.length > OPEN_VISIBLE && (
                <details className={s.openFold}>
                  <summary className={s.dayHead}>
                    <span className={s.dayToggle}>
                      Show {openRows.length - OPEN_VISIBLE} more open session{openRows.length - OPEN_VISIBLE === 1 ? '' : 's'}
                    </span>
                  </summary>
                  <OpenList rows={openRows.slice(OPEN_VISIBLE)} now={now} />
                </details>
              )}
            </section>
          )}

          {dayGroups.map((g, i) => {
            const summary = (
              <>
                <span className={s.dayHeading}>{g.heading}</span>
                <span className={s.dayMeta}>
                  {g.rows.length} finished · {g.correct} of {g.attempted} correct
                </span>
              </>
            );
            const list = (
              <ul className={s.list}>
                {g.rows.map((r) => (
                  <li key={r.id} className={s.row}>
                    <span className={s.rowTime}>{formatRowTime(r.createdAt)}</span>
                    <div className={s.rowMain}>
                      <div className={s.rowTitle}>{r.label.title}</div>
                      <div className={s.rowMeta}>{questionCount(r.total)}</div>
                    </div>
                    <span className={`${s.score} ${scoreTone(r.accuracyPct)}`}>
                      {r.correct} / {r.attempted}
                    </span>
                    <Link
                      href={`/practice/review/${r.id}`}
                      className={s.reviewLink}
                      aria-label={`Review ${r.label.title}, ${g.heading} ${formatRowTime(r.createdAt)}`}
                    >
                      Review →
                    </Link>
                  </li>
                ))}
              </ul>
            );
            // The newest day stays open; older days fold.
            return i === 0 ? (
              <section key={g.day} className={s.block} aria-label={g.heading}>
                <h2 className={s.dayHead}>{summary}</h2>
                {list}
              </section>
            ) : (
              <details key={g.day} className={`${s.block} ${s.dayFold}`}>
                <summary className={s.dayHead}>
                  {summary}
                  <span className={s.dayToggle}>
                    Show {g.rows.length} session{g.rows.length === 1 ? '' : 's'}
                  </span>
                </summary>
                {list}
              </details>
            );
          })}
        </>
      )}

      {page.hasMore && shown < MAX_SHOWN && (
        <Link href={href({ show: shown + PAGE_SIZE })} className={s.moreBtn} scroll={false}>
          Load earlier sessions
        </Link>
      )}
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function OpenList({ rows, now }: { rows: HistoryRow[]; now: Date }) {
  return (
    <ul className={s.list}>
      {rows.map((r) => (
        <li key={r.id} className={`${s.row} ${s.rowOpen}`}>
          <span className={s.openDot} aria-hidden="true" />
          <div className={s.rowMain}>
            <div className={s.rowTitle}>
              {r.label.title} · {questionCount(r.total)}
            </div>
            <div className={s.rowMeta}>
              Started {startedPhrase(r, now)} · {r.attempted} of {r.total} answered
            </div>
          </div>
          <SessionLifecycleButtons
            sessionId={r.id}
            resumeHref={`/practice/s/${r.id}/${r.resumePosition}`}
            submitAction={submitPracticeSession}
            abandonAction={abandonPracticeSession}
          />
        </li>
      ))}
    </ul>
  );
}

function questionCount(n: number): string {
  return `${n} question${n === 1 ? '' : 's'}`;
}

function startedPhrase(r: HistoryRow, now: Date): string {
  const heading = groupRowsByDay([r], now)[0]?.heading ?? '';
  const day = heading === 'Today' || heading === 'Yesterday' ? heading.toLowerCase() : `on ${heading}`;
  return `${day} ${formatRowTime(r.createdAt)}`;
}

function scoreTone(pct: number | null): string {
  if (pct == null) return '';
  if (pct >= 80) return s.scoreGood;
  if (pct >= 50) return s.scoreOk;
  return s.scoreBad;
}
