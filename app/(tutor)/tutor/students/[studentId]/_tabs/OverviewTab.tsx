// Overview tab: skills (SAT, and ACT when there is ACT work), open
// work, the latest session note, Foundations and official tests at a
// glance. Everything here links through to its full tab.

import Link from 'next/link';
import { formatCalendarDate, formatDate } from '@/lib/formatters';
import { SkillBreakdownCard } from '@/lib/practice/SkillBreakdownCard';
import { FoundationsCard } from '../FoundationsCard';
import type { StudentDetail } from '../load';
import { AssignmentRow, CardHead } from './parts';
import s from '../StudentDetail.module.css';

const OPEN_WORK_LIMIT = 5;

export function OverviewTab({ d, tabHref }: { d: StudentDetail; tabHref: (tab: string) => string }) {
  const { student, aggregate, aggregateAct } = d;
  const satHasData = aggregate.performance.math.domains.length > 0 || aggregate.performance.rw.domains.length > 0;
  const actHasData = Boolean(aggregateAct && aggregateAct.totalAttempts > 0 && aggregateAct.performance.sections.length > 0);
  const open = d.assignments.filter((a) => !a.completed_at);
  const today = new Date().toISOString().slice(0, 10);
  const nextRegistration = d.registrations.find((r) => r.test_date >= today) ?? null;
  const latestOfficial = d.officialScores[0] ?? null;

  return (
    <div className={s.contentGrid}>
      <div className={s.colMain}>
        <section className={s.card}>
          <CardHead title="Skills · last 90 days">
            <Link href={`/tutor/students/${student.id}/stats`} className={s.cardHeaderLink}>All statistics →</Link>
          </CardHead>
          {!satHasData && !actHasData ? (
            <p className={s.empty}>No practice in the last 90 days.</p>
          ) : (
            <div className={s.overviewSkills}>
              {satHasData && (
                <div className={s.perfGrid}>
                  <SkillBreakdownCard title="Math" tone="math" domains={aggregate.performance.math.domains} />
                  <SkillBreakdownCard title="Reading & Writing" tone="rw" domains={aggregate.performance.rw.domains} />
                </div>
              )}
              {actHasData && aggregateAct && (
                <div className={s.perfGrid}>
                  <SkillBreakdownCard
                    title="ACT"
                    tone="math"
                    domains={aggregateAct.performance.sections.map((sec) => ({
                      name: sec.label,
                      correct: sec.correct,
                      total: sec.total,
                      skills: sec.categories.map((c) => ({ name: c.name, correct: c.correct, total: c.total })),
                    }))}
                  />
                </div>
              )}
            </div>
          )}
        </section>

        <section className={s.card}>
          <CardHead title="Open work">
            <Link href={tabHref('assignments')} className={s.cardHeaderLink}>All assignments →</Link>
          </CardHead>
          {open.length === 0 ? (
            <p className={s.empty}>
              Nothing open.{' '}
              <Link href={`/tutor/assignments/new?student=${student.id}`} className={s.cardHeaderLink}>Assign work →</Link>
            </p>
          ) : (
            <ul className={s.assignmentList}>
              {open.slice(0, OPEN_WORK_LIMIT).map((a) => (
                <AssignmentRow key={a.id} a={a} reportSessionId={d.reportSessionByAssignment.get(a.id) ?? null} />
              ))}
            </ul>
          )}
          {open.length > OPEN_WORK_LIMIT && (
            <p className={s.cardFoot}>{open.length - OPEN_WORK_LIMIT} more open.</p>
          )}
        </section>
      </div>

      <aside className={s.colSide}>
        <section className={s.card}>
          <CardHead title="Last session note">
            <Link href={`/tutor/session/${student.id}`} className={s.cardHeaderLink}>Session →</Link>
          </CardHead>
          {d.latestNote ? (
            <>
              <p className={s.noteDate}>{formatDate(d.latestNote.session_at)}</p>
              <p className={s.noteBody}>{d.latestNote.body}</p>
            </>
          ) : (
            <p className={s.empty}>No session notes yet. Notes you take in a session show up here.</p>
          )}
        </section>

        {d.foundations.enabled && (
          <FoundationsCard
            studentId={student.id}
            groups={d.foundations.groups}
            covered={d.foundations.covered}
            total={d.foundations.total}
          />
        )}

        <section className={s.card}>
          <CardHead title="Official tests">
            <Link href={tabHref('tests')} className={s.cardHeaderLink}>Tests &amp; scores →</Link>
          </CardHead>
          {!nextRegistration && !latestOfficial ? (
            <p className={s.empty}>No registrations or official scores yet.</p>
          ) : (
            <dl className={s.glanceList}>
              {nextRegistration && (
                <div><dt>Registered</dt><dd>{formatCalendarDate(nextRegistration.test_date)}</dd></div>
              )}
              {latestOfficial && (
                <div>
                  <dt>Latest official</dt>
                  <dd>{latestOfficial.composite_score} <span className={s.muted}>· {formatCalendarDate(latestOfficial.test_date)}</span></dd>
                </div>
              )}
            </dl>
          )}
        </section>
      </aside>
    </div>
  );
}
