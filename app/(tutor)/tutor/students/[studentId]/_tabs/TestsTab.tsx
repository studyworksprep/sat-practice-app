// Tests & scores tab: the score summary (target / starting / final /
// impact / reach), the official-score progress chart, recent practice
// tests, and the official records (registrations, scores, Bluebook
// upload).

import Link from 'next/link';
import { formatRelativeShort } from '@/lib/formatters';
import { DeletePracticeTestButton } from '../DeletePracticeTestButton';
import { OfficialScoresCard } from '../OfficialScoresCard';
import { ScoreProgressChart } from '../ScoreProgressChart';
import { TestRegistrationsCard } from '../TestRegistrationsCard';
import { UploadBluebookCard } from '../UploadBluebookCard';
import type { StudentDetail } from '../load';
import { CardHead, ProfileRow, ScorePill } from './parts';
import s from '../StudentDetail.module.css';

export function TestsTab({ d }: { d: StudentDetail }) {
  const { student, scoreSummary } = d;
  return (
    <div className={s.contentGrid}>
      <div className={s.colMain}>
        <section className={s.card}>
          <CardHead title="Score summary" />
          <dl className={s.snapshotList}>
            <ProfileRow label="Target" value={student.targetScore ?? '—'} />
            <ProfileRow label="Starting score" value={scoreSummary.startingScore ?? '—'} />
            <ProfileRow label="Latest score" value={scoreSummary.finalScore ?? '—'} />
            <ProfileRow
              label="Impact"
              value={scoreSummary.impact == null ? '—' : scoreSummary.impact > 0 ? `+${scoreSummary.impact}` : String(scoreSummary.impact)}
              tone={scoreSummary.impact == null || scoreSummary.impact === 0 ? undefined : scoreSummary.impact > 0 ? 'good' : 'bad'}
            />
            {student.targetScore != null && (
              <ProfileRow
                label="Target reach"
                value={scoreSummary.targetReachPct == null ? '—' : `${scoreSummary.targetReachPct}%`}
                tone={reachTone(scoreSummary.targetReachPct)}
              />
            )}
          </dl>
          <p className={s.cardFoot}>Official scores first, then full SAT practice tests. Edit the target under Settings.</p>
        </section>

        <section className={s.card}>
          <CardHead title="Recent practice tests" />
          {d.testRows.length === 0 ? (
            <p className={s.empty}>No practice tests yet.</p>
          ) : (
            <ul className={s.testList}>
              {d.testRows.map((t) => (
                <li key={t.id} className={s.testRowWrap}>
                  <Link
                    href={t.status === 'completed' ? `/tutor/students/${student.id}/tests/${t.id}/results` : `/tutor/students/${student.id}?tab=tests`}
                    className={s.testRow}
                  >
                    <div className={s.testRowLeft}>
                      <div className={s.testRowName}>
                        {t.testName}
                        {t.sectionsOnly && (
                          <span className={s.sectionsOnlyPill}>{t.sectionsOnly === 'RW' ? 'R&W only' : 'Math only'}</span>
                        )}
                      </div>
                      <div className={s.testRowMeta}>
                        <span className={s.mono}>{t.testCode}</span>
                        {t.testCode && ' · '}
                        {formatRelativeShort(t.timestamp) ?? '—'}
                        {t.status !== 'completed' && (
                          <span className={s.testRowTag}>{' · '}{t.status === 'in_progress' ? 'In progress' : 'Abandoned'}</span>
                        )}
                      </div>
                    </div>
                    <div className={s.testRowScores}>
                      {t.status !== 'completed' ? (
                        <span className={s.muted}>—</span>
                      ) : t.kind === 'act' ? (
                        <>
                          <ScorePill label="Composite" value={t.composite} />
                          {t.sections.map(([label, value]) => <ScorePill key={label} label={label} value={value} />)}
                          {t.composite == null && t.sections.every(([, v]) => v == null) && (
                            <span className={s.muted}>Scaled pending</span>
                          )}
                        </>
                      ) : t.composite != null ? (
                        <>
                          <ScorePill label="Total" value={t.composite} />
                          <ScorePill label="RW" value={t.rwScaled} subject="RW" />
                          <ScorePill label="Math" value={t.mathScaled} subject="MATH" />
                        </>
                      ) : t.sectionsOnly === 'RW' && t.rwScaled != null ? (
                        <ScorePill label="RW only" value={t.rwScaled} subject="RW" />
                      ) : t.sectionsOnly === 'MATH' && t.mathScaled != null ? (
                        <ScorePill label="Math only" value={t.mathScaled} subject="MATH" />
                      ) : (
                        <span className={s.muted}>—</span>
                      )}
                    </div>
                  </Link>
                  {t.kind === 'sat' && (
                    <DeletePracticeTestButton studentId={student.id} attemptId={t.id} testName={t.testName} />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className={s.colSide}>
        {d.officialScores.length > 0 && (
          <section className={s.card}>
            <div className={s.cardHeader}>
              <h2 className={s.cardTitle}>Progress</h2>
              {student.targetScore != null && (
                <span className={s.cardHeaderHint}>Target <strong>{student.targetScore}</strong></span>
              )}
            </div>
            <ScoreProgressChart scores={d.officialScores} targetScore={student.targetScore} />
          </section>
        )}
        <TestRegistrationsCard studentId={student.id} registrations={d.registrations} />
        <OfficialScoresCard studentId={student.id} scores={d.officialScores} />
        <UploadBluebookCard studentId={student.id} tests={d.publishedTests} />
      </aside>
    </div>
  );
}

function reachTone(pct: number | null): 'good' | 'ok' | 'bad' | undefined {
  if (pct == null) return undefined;
  if (pct >= 100) return 'good';
  if (pct >= 90) return 'ok';
  return 'bad';
}
