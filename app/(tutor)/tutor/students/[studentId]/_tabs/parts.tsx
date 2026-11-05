// Small pieces shared by the student page's tabs.

import Link from 'next/link';
import { formatDate, isPastDueDate } from '@/lib/formatters';
import type { SubjectCode } from '@/lib/types';
import type { StudentAssignment } from '../load';
import s from '../StudentDetail.module.css';

// Readable names for assignments_v2.assignment_type (the pill is
// uppercased by CSS).
export const ASSIGNMENT_TYPE_LABEL: Record<string, string> = {
  questions: 'Questions',
  practice_test: 'Practice test',
  lesson: 'Lesson',
  lesson_pack: 'Lesson pack',
};

export function assignmentTitle(a: StudentAssignment): string {
  return a.title
    ?? (a.assignment_type === 'lesson' ? a.lesson?.title : null)
    ?? (a.assignment_type === 'practice_test' ? a.practice_test?.name : null)
    ?? 'Assignment';
}

export function AssignmentRow({ a, reportSessionId }: { a: StudentAssignment; reportSessionId: string | null }) {
  const n = Array.isArray(a.question_ids) ? (a.question_ids as unknown[]).length : null;
  const href = reportSessionId ? `/tutor/sessions/${reportSessionId}` : `/tutor/assignments/${a.id}`;
  const overdue = a.due_date != null && !a.completed_at && isPastDueDate(a.due_date);
  return (
    <li>
      <Link href={href} className={a.completed_at ? `${s.assignmentRow} ${s.assignmentRowDone}` : s.assignmentRow}>
        <span className={s.assignmentType}>{ASSIGNMENT_TYPE_LABEL[a.assignment_type] ?? 'Assignment'}</span>
        {a.test_type === 'act' && <span className={s.actPill}>ACT</span>}
        <span className={s.assignmentTitle}>
          {assignmentTitle(a)}
          {n != null && <span className={s.assignmentCount}> · {n} question{n === 1 ? '' : 's'}</span>}
        </span>
        <span className={s.assignmentDates}>
          {a.created_at && <span className={s.assignedDate}>Assigned {formatDate(a.created_at)}</span>}
          {a.due_date && (
            <span className={overdue ? s.dueOverdue : s.due}>
              {overdue ? 'Overdue · was due' : 'Due'} {formatDate(a.due_date)}
            </span>
          )}
        </span>
        {a.completed_at && reportSessionId && <span className={s.reportPill}>View report →</span>}
        {a.completed_at && !reportSessionId && <span className={s.completedTag}>Completed</span>}
      </Link>
    </li>
  );
}

export function ProfileRow({ label, value, sub, tone }: {
  label: string; value: number | string; sub?: string; tone?: 'good' | 'ok' | 'bad';
}) {
  const valueCls = [
    s.snapshotRowValueMain,
    tone === 'good' ? s.snapshotRowGood : null,
    tone === 'ok' ? s.snapshotRowOk : null,
    tone === 'bad' ? s.snapshotRowBad : null,
  ].filter(Boolean).join(' ');
  return (
    <div className={s.snapshotRow}>
      <dt className={s.snapshotRowLabel}>{label}</dt>
      <dd className={s.snapshotRowValue}>
        <div className={valueCls}>{value}</div>
        {sub && <div className={s.snapshotRowSub}>{sub}</div>}
      </dd>
    </div>
  );
}

export function ScorePill({ label, value, subject }: { label: string; value: number | null; subject?: SubjectCode }) {
  if (value == null) return null;
  const cls = [s.scorePill, subject === 'RW' ? s.scorePillRw : null, subject === 'MATH' ? s.scorePillMath : null]
    .filter(Boolean).join(' ');
  return (
    <div className={cls}>
      <div className={s.scorePillValue}>{value}</div>
      <div className={s.scorePillLabel}>{label}</div>
    </div>
  );
}

export function CardHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={s.cardHeader}>
      <h2 className={s.cardTitle}>{title}</h2>
      {children && <div className={s.snapshotHeadActions}>{children}</div>}
    </div>
  );
}
