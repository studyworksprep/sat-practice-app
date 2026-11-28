// Lesson-assignment reporting sections, shared by the assignment
// roster page (struggled-blocks rollup) and the per-student report
// page (per-check table). Server-renderable: plain markup over rows
// prebuilt by lib/lesson/progress-report.mjs, styled with the same
// module the rest of the assignment detail uses.

import Link from 'next/link';
import { LessonCheckReview } from '@/lib/ui/LessonCheckReview';
import type { buildCheckReview } from '@/lib/lesson/check-review.mjs';
import { formatDate } from '@/lib/formatters';
import s from './AssignmentDetail.module.css';

export interface LessonRollupRow {
  blockId: string;
  stepNumber: number;
  blockType: string;
  label: string;
  attemptedCount: number;
  trackedCount: number;
  firstTryCount: number;
  struggledCount: number;
  avgAttempts: number | null;
}

function rollupTone(row: LessonRollupRow): string {
  if (row.trackedCount === 0) return s.qStatusPending;
  const ratio = row.firstTryCount / row.trackedCount;
  if (ratio >= 0.8) return s.qStatusCorrect;
  if (ratio >= 0.5) return s.qStatusOk;
  return s.qStatusWrong;
}

// Roster-level rollup: one row per check block, cohort-wide first-try
// and struggle counts. "Struggled" = 3+ tries or a wrong final answer.
export function LessonChecksRollupSection({
  rollup,
  studentCount,
}: {
  rollup: LessonRollupRow[];
  studentCount: number;
}) {
  if (rollup.length === 0) return null;
  return (
    <section className={s.card}>
      <div className={s.cardHeader}>
        <div>
          <div className={s.h2}>Lesson checks</div>
          <div className={s.cardHint}>
            First-try accuracy per check, and how many students struggled
            (3+ tries or still wrong).
          </div>
        </div>
        <span className={s.cardTag}>{rollup.length} checks</span>
      </div>
      <ul className={s.questionList}>
        {rollup.map((row) => {
          const statusText =
            row.attemptedCount === 0
              ? `0 of ${studentCount} attempted`
              : row.trackedCount === 0 ? 'First try unavailable'
              : `${row.firstTryCount} of ${row.trackedCount} first try${
                  row.struggledCount > 0
                    ? ` · ${row.struggledCount} struggled`
                    : ''
                }`;
          return (
            <li key={row.blockId} className={s.qRow}>
              <span className={s.qIndex}>{row.stepNumber}</span>
              <div className={s.qInfo}>
                <div className={s.qCode}>{row.label}</div>
                <div className={s.qMeta}>
                  <span>
                    {row.blockType === 'desmos_interactive'
                      ? 'Desmos activity'
                      : 'Knowledge check'}
                  </span>
                  {row.avgAttempts != null && (
                    <>
                      <span className={s.muted}> · </span>
                      <span>
                        avg {row.avgAttempts}{' '}
                        {row.avgAttempts === 1 ? 'try' : 'tries'}
                      </span>
                    </>
                  )}
                </div>
              </div>
              <span className={`${s.qStatus} ${rollupTone(row)}`}>
                {statusText}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

// Full per-student lesson report page body: header, progress stats,
// and the shared expandable question review.
export function LessonStudentReport({
  title,
  studentName,
  studentHref,
  backHref,
  review,
  totalBlocks,
  completedBlocksCount,
  completedAt,
  staleProgress = null,
  headerExtra = null,
}: {
  title: string;
  studentName: string | null;
  studentHref: string;
  backHref: string;
  review: ReturnType<typeof buildCheckReview>;
  totalBlocks: number;
  completedBlocksCount: number;
  completedAt: string | null;
  /** Progress recorded against blocks the lesson no longer has —
   *  excluded from every number above; surfaced so "0 / 22" on a
   *  student who did the work reads as a versioning gap, not idleness. */
  staleProgress?: { completed: number; answers: number } | null;
  /** Optional control beside the title: the Reviewed checkbox. */
  headerExtra?: React.ReactNode;
}) {
  const answered = review.rows.filter(r => r.attempted);
  const progressPct =
    totalBlocks > 0
      ? Math.round((completedBlocksCount / totalBlocks) * 100)
      : 0;

  return (
    <main className={s.container}>
      <Link href={backHref} className={s.breadcrumb}>
        ← Back to assignment
      </Link>

      <header className={headerExtra ? `${s.header} ${s.headerWithAction}` : s.header}>
        <div>
          <div className={s.eyebrow}>Lesson report</div>
          <h1 className={s.h1}>{title}</h1>
          {studentName && (
            <p className={s.description}>
              <Link href={studentHref} className={s.nameLink}>
                {studentName}
              </Link>
            </p>
          )}
        </div>
        {headerExtra}
      </header>

      {staleProgress && (
        <p className={s.cardHint} role="status">
          This lesson was updated after the student last worked on it.
          {' '}
          {staleProgress.completed} step{staleProgress.completed === 1 ? '' : 's'} and{' '}
          {staleProgress.answers} check answer{staleProgress.answers === 1 ? '' : 's'} recorded on the
          earlier version can&apos;t be matched to the current steps and are not counted below.
        </p>
      )}

      <div className={s.statsStrip}>
        <div className={s.statTile}>
          <div className={s.statLabel}>Progress</div>
          <div className={s.statValue}>{progressPct}%</div>
          <div className={s.statSub}>
            {completedBlocksCount} of {totalBlocks} steps
          </div>
        </div>
        <div className={s.statTile}>
          <div className={s.statLabel}>Checks answered</div>
          <div className={s.statValue}>
            {answered.length} / {review.rows.length}
          </div>
        </div>
        <div className={s.statTile}>
          <div className={s.statLabel}>Completed</div>
          <div className={s.statValue}>
            {completedAt ? formatDate(completedAt) : '—'}
          </div>
        </div>
      </div>

      <LessonCheckReview review={review} tutor />
    </main>
  );
}
