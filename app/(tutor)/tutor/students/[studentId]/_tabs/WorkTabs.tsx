// Assignments and Practice tabs: the running record of assigned work,
// and the student's self-guided practice sessions.

import Link from 'next/link';
import { formatRelativeShort } from '@/lib/formatters';
import type { StudentDetail } from '../load';
import { AssignmentRow, CardHead } from './parts';
import s from '../StudentDetail.module.css';

export function AssignmentsTab({ d }: { d: StudentDetail }) {
  const id = d.student.id;
  const open = d.assignments.filter((a) => !a.completed_at);
  const done = d.assignments.filter((a) => a.completed_at);
  const actions = (
    <>
      <Link
        href={`/tutor/assignments/new?student=${id}&from_student=${id}`}
        className={s.cardHeaderLink}
        title="Open the assignment form with this student's weakest recent skills already in the picker, weighted by how often they were missed"
      >
        Assign from weaknesses →
      </Link>
      <Link href={`/tutor/assignments/new?student=${id}`} className={s.cardHeaderLink}>+ New assignment</Link>
    </>
  );
  if (d.assignments.length === 0) {
    return (
      <section className={s.card}>
        <CardHead title="Assignments">{actions}</CardHead>
        <p className={s.empty}>This student has no assignments.</p>
      </section>
    );
  }
  return (
    <>
      <section className={s.card}>
        <CardHead title={`Open · ${open.length}`}>{actions}</CardHead>
        {open.length === 0 ? (
          <p className={s.empty}>Nothing open — every assignment is finished.</p>
        ) : (
          <ul className={s.assignmentList}>
            {open.map((a) => <AssignmentRow key={a.id} a={a} reportSessionId={d.reportSessionByAssignment.get(a.id) ?? null} />)}
          </ul>
        )}
      </section>
      {done.length > 0 && (
        <section className={s.card}>
          <CardHead title={`Finished · ${done.length}`} />
          <ul className={s.assignmentList}>
            {done.map((a) => <AssignmentRow key={a.id} a={a} reportSessionId={d.reportSessionByAssignment.get(a.id) ?? null} />)}
          </ul>
        </section>
      )}
    </>
  );
}

export function PracticeTab({ d }: { d: StudentDetail }) {
  const id = d.student.id;
  return (
    <section className={s.card}>
      <CardHead title="Recent practice sessions">
        <Link href={`/tutor/students/${id}/stats`} className={s.cardHeaderLink}>All statistics →</Link>
      </CardHead>
      <p className={s.cardSub}>
        Self-guided sets and drills. Work done for an assignment shows under Assignments.
      </p>
      {d.sessions.length === 0 ? (
        <p className={s.empty}>No practice sessions yet.</p>
      ) : (
        <ul className={s.sessionList}>
          {d.sessions.map((row) => (
            <li key={row.id}>
              <Link href={row.completed ? `/tutor/sessions/${row.id}` : `/tutor/students/${id}?tab=practice`} className={s.sessionRow}>
                <div className={s.sessionRowLeft}>
                  <div className={s.sessionRowDate}>
                    {formatRelativeShort(row.createdAt) ?? '—'}
                    {row.testType === 'act' && <span className={s.actPill}>ACT</span>}
                  </div>
                  <div className={s.sessionRowMeta}>
                    {row.total} question{row.total === 1 ? '' : 's'}
                    {!row.completed && <span className={s.sessionRowTag}> · In progress</span>}
                  </div>
                </div>
                {row.completed
                  ? <span className={s.reportPill}>View report →</span>
                  : <span className={s.sessionRowChevron} aria-hidden="true">→</span>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
