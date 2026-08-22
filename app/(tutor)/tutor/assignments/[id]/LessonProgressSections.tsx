// Lesson-assignment reporting sections, shared by the assignment
// roster page (struggled-blocks rollup) and the per-student report
// page (per-check table). Server-renderable: plain markup over rows
// prebuilt by lib/lesson/progress-report.mjs, styled with the same
// module the rest of the assignment detail uses.

import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import s from './AssignmentDetail.module.css';

export interface LessonRollupRow {
  blockId: string;
  stepNumber: number;
  blockType: string;
  label: string;
  attemptedCount: number;
  firstTryCount: number;
  struggledCount: number;
  avgAttempts: number | null;
}

export interface LessonCheckRow {
  blockId: string;
  stepNumber: number;
  blockType: string;
  label: string;
  attempted: boolean;
  attempts: number;
  firstTryCorrect: boolean | null;
  finalCorrect: boolean | null;
  struggled: boolean;
}

function rollupTone(row: LessonRollupRow): string {
  if (row.attemptedCount === 0) return s.qStatusPending;
  const ratio = row.firstTryCount / row.attemptedCount;
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
              : `${row.firstTryCount} of ${row.attemptedCount} first try${
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
// and the per-check table (first try / tries / final per block).
export function LessonStudentReport({
  title,
  studentName,
  studentHref,
  backHref,
  rows,
  totalBlocks,
  completedBlocksCount,
  completedAt,
}: {
  title: string;
  studentName: string | null;
  studentHref: string;
  backHref: string;
  rows: LessonCheckRow[];
  totalBlocks: number;
  completedBlocksCount: number;
  completedAt: string | null;
}) {
  const answered = rows.filter((r) => r.attempted);
  const firstTryCorrect = answered.filter((r) => r.firstTryCorrect).length;
  const struggledSteps = rows.filter((r) => r.struggled);
  const progressPct =
    totalBlocks > 0
      ? Math.round((completedBlocksCount / totalBlocks) * 100)
      : 0;

  return (
    <main className={s.container}>
      <Link href={backHref} className={s.breadcrumb}>
        ← Back to assignment
      </Link>

      <header className={s.header}>
        <div className={s.eyebrow}>Lesson report</div>
        <h1 className={s.h1}>{title}</h1>
        {studentName && (
          <p className={s.description}>
            <Link href={studentHref} className={s.nameLink}>
              {studentName}
            </Link>
          </p>
        )}
      </header>

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
            {answered.length} / {rows.length}
          </div>
        </div>
        <div
          className={`${s.statTile} ${
            answered.length > 0 && firstTryCorrect / answered.length >= 0.8
              ? s.statTile_good
              : ''
          }`}
        >
          <div className={s.statLabel}>First try</div>
          <div className={s.statValue}>
            {answered.length > 0
              ? `${Math.round((firstTryCorrect / answered.length) * 100)}%`
              : '—'}
          </div>
          <div className={s.statSub}>
            {answered.length > 0
              ? `${firstTryCorrect} of ${answered.length} checks`
              : 'No checks answered yet'}
          </div>
        </div>
        <div className={s.statTile}>
          <div className={s.statLabel}>Completed</div>
          <div className={s.statValue}>
            {completedAt ? formatDate(completedAt) : '—'}
          </div>
          {struggledSteps.length > 0 && (
            <div className={s.statSub}>
              Struggled:{' '}
              {struggledSteps.map((r) => `Step ${r.stepNumber}`).join(', ')}
            </div>
          )}
        </div>
      </div>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Checks</div>
            <div className={s.cardHint}>
              Every check in lesson order — whether the first try landed,
              how many tries it took, and where things ended up.
            </div>
          </div>
        </div>
        <div className={s.tableWrap}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.thNum}>Step</th>
                <th className={s.th}>Check</th>
                <th className={s.thNum}>First try</th>
                <th className={s.thNum}>Tries</th>
                <th className={s.thNum}>Final</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.blockId} className={s.row}>
                  <td className={s.tdNum}>{row.stepNumber}</td>
                  <td className={s.td}>
                    {row.label}
                    {row.blockType === 'desmos_interactive' && (
                      <span className={s.muted}> · Desmos</span>
                    )}
                  </td>
                  {row.attempted ? (
                    <>
                      <td className={s.tdNum}>
                        <span
                          className={`${s.accBadge} ${
                            row.firstTryCorrect ? s.accGood : s.accBad
                          }`}
                        >
                          {row.firstTryCorrect ? '✓' : '✗'}
                        </span>
                      </td>
                      <td className={s.tdNum}>{row.attempts}</td>
                      <td className={s.tdNum}>
                        <span
                          className={`${s.accBadge} ${
                            row.finalCorrect ? s.accGood : s.accBad
                          }`}
                        >
                          {row.finalCorrect ? '✓' : '✗'}
                        </span>
                      </td>
                    </>
                  ) : (
                    <td className={s.td} colSpan={3}>
                      <span className={s.muted}>Not answered</span>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
