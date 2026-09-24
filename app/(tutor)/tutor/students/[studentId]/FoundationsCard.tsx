// Foundations card for the tutor's student-detail page
// (docs/foundations-and-question-patterns.md §3.2 tutor roster, §4 step 5).
//
// Lists the foundation lessons — the lesson steps of "Before Math" and
// "Before Reading & Writing" — with where this student stands on each,
// and the one-click "Mark covered" that records a lesson taught live so
// the plan skips it. Undo withdraws a mark; a lesson the student
// finished in the app themselves has nothing to mark. The page hides
// the card while no foundation syllabus exists.
//
// Optimistic-free on purpose: each click awaits the RPC and then
// router.refresh() re-reads the rows, so the status line always shows
// what the database holds (who covered it, when).

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { formatDate } from '@/lib/formatters';
import { markLessonCovered, unmarkLessonCovered } from './foundation-actions';
import s from './StudentDetail.module.css';

export type FoundationCardStatus = 'not_started' | 'in_progress' | 'completed' | 'covered';

export interface FoundationCardRow {
  lessonId: string;
  title: string;
  status: FoundationCardStatus;
  completedAt: string | null;
  coveredAt: string | null;
  /** Display name of the staff member who recorded the mark, when the
   *  viewer can see their profile; null otherwise. */
  coveredByName: string | null;
  coveredByMe: boolean;
}

export interface FoundationCardGroup {
  section: 'math' | 'reading_writing';
  /** "Before Math" / "Before Reading & Writing". */
  title: string;
  rows: FoundationCardRow[];
}

interface FoundationsCardProps {
  studentId: string;
  groups: FoundationCardGroup[];
  covered: number;
  total: number;
}

function statusLine(row: FoundationCardRow): { text: string; done: boolean } {
  switch (row.status) {
    case 'completed':
      return { text: `Completed in the app${row.completedAt ? ` · ${formatDate(row.completedAt)}` : ''}`, done: true };
    case 'covered': {
      const who = row.coveredByMe ? 'by you' : row.coveredByName ? `by ${row.coveredByName}` : null;
      const later =
        row.completedAt && row.coveredAt && row.completedAt > row.coveredAt
          ? ` · finished in the app ${formatDate(row.completedAt)}`
          : '';
      return {
        text: `Covered in session${row.coveredAt ? ` · ${formatDate(row.coveredAt)}` : ''}${who ? ` · ${who}` : ''}${later}`,
        done: true,
      };
    }
    case 'in_progress':
      return { text: 'Started in the app, not finished', done: false };
    default:
      return { text: 'Not yet', done: false };
  }
}

export function FoundationsCard({ studentId, groups, covered, total }: FoundationsCardProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function run(lessonId: string, action: 'mark' | 'unmark') {
    setError(null);
    setPendingId(lessonId);
    startTransition(async () => {
      const res =
        action === 'mark'
          ? await markLessonCovered({ studentId, lessonId })
          : await unmarkLessonCovered({ studentId, lessonId });
      setPendingId(null);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <section id="foundations" className={s.card}>
      <div className={s.cardHeader}>
        <div className={s.sectionLabel}>Foundations</div>
        <span className={s.cardHeaderHint}>
          {covered} of {total} covered
        </span>
      </div>
      <p className={s.foundationsIntro}>
        Taught before a section&rsquo;s first topic. Mark the ones you covered live so the plan
        skips them.
      </p>

      {groups.map((g) => (
        <div key={g.section} className={s.foundationsGroup}>
          <div className={s.foundationsGroupLabel}>{g.title}</div>
          <ul className={s.regList}>
            {g.rows.map((row) => {
              const line = statusLine(row);
              const busy = pending && pendingId === row.lessonId;
              return (
                <li key={row.lessonId} className={s.foundationRow}>
                  <div className={s.foundationMain}>
                    <div className={s.foundationTitle}>{row.title}</div>
                    <div className={`${s.foundationStatus} ${line.done ? s.foundationDone : ''}`}>
                      {line.text}
                    </div>
                  </div>
                  {row.status === 'covered' ? (
                    <button
                      type="button"
                      className={`${s.foundationBtn} ${s.foundationUndo}`}
                      disabled={pending}
                      onClick={() => run(row.lessonId, 'unmark')}
                      title="Withdraw the covered-in-session mark"
                    >
                      {busy ? '…' : 'Undo'}
                    </button>
                  ) : row.status === 'completed' ? null : (
                    <button
                      type="button"
                      className={s.foundationBtn}
                      disabled={pending}
                      onClick={() => run(row.lessonId, 'mark')}
                      title="Record that you covered this lesson in a live session"
                    >
                      {busy ? '…' : 'Mark covered'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}

      {error && (
        <p role="alert" className={`${s.error} ${s.toggleError}`}>
          {error}
        </p>
      )}
    </section>
  );
}
