// The student's "Test dates & scores" tab on /performance: the SAT
// dates they're registered for, which one they're studying for, and the
// official SAT/PSAT scores they've received. The data comes from the page
// (a Server Component); every change goes through ./actions, whose
// revalidatePath re-renders the page in the same round trip.
//
// State set after an action's `await` is wrapped in its own
// startTransition: React commits a bare update after `await` right away,
// so a "now studying for May 1" notice would show before the refreshed
// page does.
//
// Rows a tutor added are shown but can't be removed here. Rows the
// student added are marked `mine` by the page (created_by = student).

'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { parseLocalOrIso } from '@/lib/formatters';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { Button } from '@/lib/ui/Button';
import { SECTION_RANGE, type OfficialTestType } from '@/lib/practice/official-tests';
import {
  addOfficialScoreAction,
  addTestDateAction,
  removeOfficialScoreAction,
  removeTestDateAction,
  studyForDateAction,
} from './actions';
import s from './TestsPanel.module.css';

export interface PanelRegistration {
  id: string;
  test_date: string;
  mine: boolean;
}

export interface PanelScore {
  id: string;
  test_date: string;
  test_type: OfficialTestType;
  rw_score: number;
  math_score: number;
  composite_score: number;
  mine: boolean;
}

export interface TestsPanelProps {
  /** yyyy-mm-dd, from the server so both sides agree. */
  today: string;
  /** The upcoming date the student studies for (plan, else profile). */
  studyingFor: string | null;
  hasPlan: boolean;
  hasTutor: boolean;
  /** Every registration, soonest first. */
  registrations: PanelRegistration[];
  /** Every score, newest first. */
  scores: PanelScore[];
  /** Recent past test dates with no score yet. */
  awaitingScores: string[];
}

const PLAN_MOVE_BODY =
  'The rest of your plan will be re-paced to the new date. Work you have already done stays.';

function longDate(iso: string): string {
  return parseLocalOrIso(iso).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function daysToGo(today: string, date: string): string {
  const n = daysBetween(today, date);
  if (n <= 0) return 'Today';
  return n === 1 ? '1 day to go' : `${n} days to go`;
}

export function TestsPanel(props: TestsPanelProps) {
  const [scoreDate, setScoreDate] = useState('');
  return (
    <div className={s.grid}>
      <TestDatesCard {...props} />
      <ScoresCard {...props} scoreDate={scoreDate} setScoreDate={setScoreDate} />
    </div>
  );
}

// ── Test dates ────────────────────────────────────────────────────

function TestDatesCard({ today, studyingFor, hasPlan, registrations }: TestsPanelProps) {
  const upcoming = registrations.filter((r) => r.test_date >= today);
  const [date, setDate] = useState('');
  const [studying, setStudying] = useState(!studyingFor);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();

  // Ask before re-pacing a plan to a date other than its current one.
  async function confirmPlanMove(target: string): Promise<boolean> {
    if (!hasPlan || target === studyingFor) return true;
    return confirm({
      title: `Move your plan to ${longDate(target)}?`,
      body: PLAN_MOVE_BODY,
      confirmLabel: 'Move my plan',
    });
  }

  async function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (studying && !(await confirmPlanMove(date))) return;
    const fd = new FormData();
    fd.set('test_date', date);
    if (studying) fd.set('studying_for', 'on');
    startTransition(async () => {
      const res = await addTestDateAction(null, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      startTransition(() => {
        if (res.data.planMoved) setNotice(`Your plan now builds toward ${longDate(date)}.`);
        setDate('');
        setStudying(false);
      });
    });
  }

  function onStudyFor(target: string) {
    setError(null);
    setNotice(null);
    void (async () => {
      if (!(await confirmPlanMove(target))) return;
      const fd = new FormData();
      fd.set('test_date', target);
      startTransition(async () => {
        const res = await studyForDateAction(null, fd);
        if (!res.ok) {
          setError(res.error);
          return;
        }
        startTransition(() => setNotice(
          res.data.planMoved
            ? `Your plan now builds toward ${longDate(target)}.`
            : `You're studying for ${longDate(target)}.`,
        ));
      });
    })();
  }

  function onRemove(reg: PanelRegistration) {
    setError(null);
    setNotice(null);
    void (async () => {
      const ok = await confirm({
        title: `Remove ${longDate(reg.test_date)}?`,
        body: reg.test_date === studyingFor
          ? "You're studying for this date. Your countdown and plan stay on it until you pick another."
          : undefined,
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
      const fd = new FormData();
      fd.set('id', reg.id);
      startTransition(async () => {
        const res = await removeTestDateAction(null, fd);
        if (!res.ok) setError(res.error);
      });
    })();
  }

  return (
    <section className={s.card} aria-labelledby="test-dates-title">
      <div className={s.cardHead}>
        <h2 id="test-dates-title" className={s.h2}>Test dates</h2>
        <p className={s.hint}>
          The SAT dates you&apos;re registered for. The one you study for sets your
          countdown{hasPlan ? ' and paces your plan' : ''}.
        </p>
      </div>

      <div className={s.focus}>
        {studyingFor ? (
          <>
            <span className={s.focusLabel}>Studying for</span>
            <strong className={s.focusDate}>{longDate(studyingFor)}</strong>
            <span className={s.focusSub}>{daysToGo(today, studyingFor)}</span>
          </>
        ) : (
          <span className={s.focusEmpty}>You haven&apos;t picked a test to study for yet.</span>
        )}
      </div>

      {upcoming.length === 0 ? (
        <p className={s.empty}>No upcoming test dates. Add the ones you&apos;re registered for.</p>
      ) : (
        <ul className={s.list}>
          {upcoming.map((r) => {
            const current = r.test_date === studyingFor;
            return (
              <li key={r.id} className={s.row}>
                <div className={s.rowMain}>
                  <span className={s.rowDate}>{longDate(r.test_date)}</span>
                  <span className={s.rowMeta}>
                    {current && <span className={s.pill}>Studying for</span>}
                    {!r.mine && <span className={s.source}>Added by your tutor</span>}
                  </span>
                </div>
                <div className={s.rowActions}>
                  {!current && r.test_date > today && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      disabled={pending}
                      onClick={() => onStudyFor(r.test_date)}
                    >
                      Study for this
                    </Button>
                  )}
                  {r.mine && (
                    <button
                      type="button"
                      className={s.remove}
                      disabled={pending}
                      onClick={() => onRemove(r)}
                      aria-label={`Remove ${longDate(r.test_date)}`}
                    >
                      ✕
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <form className={s.form} onSubmit={onAdd}>
        <div className={s.formRow}>
          <label className={s.field}>
            <span className={s.label}>Add a test date</span>
            <input
              className={s.input}
              type="date"
              required
              min={today}
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <Button type="submit" variant="primary" size="sm" disabled={pending || !date}>
            {pending ? 'Saving…' : 'Add date'}
          </Button>
        </div>
        <label className={s.check}>
          <input
            type="checkbox"
            checked={studying}
            onChange={(e) => setStudying(e.target.checked)}
          />
          <span>
            I&apos;m studying for this test
            {hasPlan && studying && <span className={s.checkHint}> · your plan will be re-paced to it</span>}
          </span>
        </label>
      </form>

      {error && <p role="alert" className={s.error}>{error}</p>}
      {notice && <p role="status" className={s.notice}>{notice}</p>}
      {confirmDialog}
    </section>
  );
}

// ── Official scores ───────────────────────────────────────────────

function ScoresCard({
  today,
  hasTutor,
  scores,
  awaitingScores,
  scoreDate,
  setScoreDate,
}: TestsPanelProps & { scoreDate: string; setScoreDate: (d: string) => void }) {
  const [testType, setTestType] = useState<OfficialTestType>('SAT');
  const [rw, setRw] = useState('');
  const [math, setMath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const range = SECTION_RANGE[testType];
  const total = rw && math ? Number(rw) + Number(math) : null;

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set('test_type', testType);
    fd.set('test_date', scoreDate);
    fd.set('rw_score', rw);
    fd.set('math_score', math);
    startTransition(async () => {
      const res = await addOfficialScoreAction(null, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      startTransition(() => {
        setScoreDate('');
        setRw('');
        setMath('');
      });
    });
  }

  function onRemove(score: PanelScore) {
    setError(null);
    void (async () => {
      const ok = await confirm({
        title: `Remove your ${score.test_type} score from ${longDate(score.test_date)}?`,
        confirmLabel: 'Remove',
        tone: 'danger',
      });
      if (!ok) return;
      const fd = new FormData();
      fd.set('id', score.id);
      startTransition(async () => {
        const res = await removeOfficialScoreAction(null, fd);
        if (!res.ok) setError(res.error);
      });
    })();
  }

  return (
    <section className={s.card} aria-labelledby="scores-title">
      <div className={s.cardHead}>
        <h2 id="scores-title" className={s.h2}>Official scores</h2>
        <p className={s.hint}>
          From your College Board score reports.
          {hasTutor ? ' Your tutor sees the scores you add here.' : ''}
        </p>
      </div>

      {awaitingScores.length > 0 && (
        <ul className={s.awaiting}>
          {awaitingScores.map((d) => (
            <li key={d} className={s.awaitingRow}>
              <span>Got your scores from {longDate(d)}?</span>
              <button type="button" className={s.linkBtn} onClick={() => setScoreDate(d)}>
                Add them
              </button>
            </li>
          ))}
        </ul>
      )}

      {scores.length === 0 ? (
        <p className={s.empty}>No official scores yet.</p>
      ) : (
        <ul className={s.list}>
          {scores.map((sc) => (
            <li key={sc.id} className={s.row}>
              <div className={s.rowMain}>
                <span className={s.rowDate}>
                  {longDate(sc.test_date)}
                  <span className={s.typeTag}>{sc.test_type}</span>
                </span>
                {!sc.mine && <span className={s.source}>Added by your tutor</span>}
              </div>
              <div className={s.scores}>
                <span className={s.total}>{sc.composite_score}</span>
                <span className={s.section}>R&amp;W {sc.rw_score}</span>
                <span className={s.section}>Math {sc.math_score}</span>
              </div>
              <div className={s.rowActions}>
                {sc.mine && (
                  <button
                    type="button"
                    className={s.remove}
                    disabled={pending}
                    onClick={() => onRemove(sc)}
                    aria-label={`Remove ${sc.test_type} score from ${longDate(sc.test_date)}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <form className={s.form} onSubmit={onAdd} aria-label="Add a score">
        <div className={s.formLabel}>Add a score</div>
        <div className={s.scoreGrid}>
          <label className={s.field}>
            <span className={s.label}>Test</span>
            <select
              className={s.input}
              value={testType}
              onChange={(e) => setTestType(e.target.value === 'PSAT' ? 'PSAT' : 'SAT')}
            >
              <option value="SAT">SAT</option>
              <option value="PSAT">PSAT</option>
            </select>
          </label>
          <label className={s.field}>
            <span className={s.label}>Test date</span>
            <input
              className={s.input}
              type="date"
              required
              max={today}
              value={scoreDate}
              onChange={(e) => setScoreDate(e.target.value)}
            />
          </label>
          <label className={s.field}>
            <span className={s.label}>Reading &amp; Writing</span>
            <input
              className={s.input}
              type="number"
              inputMode="numeric"
              required
              min={range.min}
              max={range.max}
              step={10}
              placeholder={`${range.min}–${range.max}`}
              value={rw}
              onChange={(e) => setRw(e.target.value)}
            />
          </label>
          <label className={s.field}>
            <span className={s.label}>Math</span>
            <input
              className={s.input}
              type="number"
              inputMode="numeric"
              required
              min={range.min}
              max={range.max}
              step={10}
              placeholder={`${range.min}–${range.max}`}
              value={math}
              onChange={(e) => setMath(e.target.value)}
            />
          </label>
        </div>
        <div className={s.formFoot}>
          <span className={s.totalPreview}>
            {total != null && Number.isFinite(total) ? <>Total <strong>{total}</strong></> : null}
          </span>
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            {pending ? 'Saving…' : 'Add score'}
          </Button>
        </div>
      </form>

      {error && <p role="alert" className={s.error}>{error}</p>}
      {confirmDialog}
    </section>
  );
}
