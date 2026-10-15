// ACT practice-tests hub. Sibling to the SAT hub layout that lives
// directly in app/(student)/practice/tests/page.js — same shape
// (header / Resume callout / per-form card grid / history table) but
// the data model is the ACT virtual-construct model (§3.4): each card
// is a distinct source_test from act_questions, and Start creates an
// act_practice_test_attempts row carrying the form's section plan
// (Phase 3 multi-section test mode). Sections are timed one at a
// time from the attempt page, with the form's format (classic /
// enhanced, from act_forms) deciding the limits and the break.
//
// Rendered as a client island so the Start / Continue / Abandon
// buttons can use useTransition with the Server Actions directly.

'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { sectionLabel, type ActSection } from '@/lib/practice/act-taxonomy';
import {
  ACT_FORMAT_LABELS,
  ACT_FORM_KIND_LABELS,
  ACT_TIME_MULTIPLIERS,
  buildSectionPlan,
  minutesLabel,
  parseTimeMultiplier,
  type ActFormat,
  type ActFormKind,
  type ActTimeMultiplier,
} from '@/lib/practice/act-test-plan';
import {
  abandonActPracticeTest,
  startActPracticeTest,
} from '@/app/(student)/practice/tests/actions';
import s from './ActTestsHub.module.css';

export interface HubForm {
  sourceTest: string;
  format: ActFormat;
  kind: ActFormKind;
  total: number;
  sections: Array<{ section: ActSection; count: number }>;
}

export interface HubAttempt {
  id: string;
  source_test: string;
  finished_at: string | null;
  english_scaled: number | null;
  math_scaled: number | null;
  reading_scaled: number | null;
  science_scaled: number | null;
  composite_score: number | null;
  time_multiplier?: number | null;
}

export interface HubResumeInfo {
  attemptId: string;
  sourceTest: string;
  sectionIndex: number;
  sectionCount: number;
  sectionLabel: string | null;
  sectionStatus: string | null;
  startedAt: string | null;
}

const MULTIPLIER_LABELS: Record<ActTimeMultiplier, string> = {
  1: 'Standard time',
  1.5: '1.5× time',
  2: '2× time',
};

export function ActTestsHub({
  forms,
  attempts,
  resumeInfo,
  tabs,
  defaultMultiplier = 1,
}: {
  forms: HubForm[];
  attempts: HubAttempt[];
  resumeInfo: HubResumeInfo | null;
  /** Tabs nav rendered above the header so the test-type slice is
   *  the first thing visible. */
  tabs: React.ReactNode;
  /** Standing accommodation (profiles.time_accommodation); pre-selects
   *  the Timing control. */
  defaultMultiplier?: number;
}) {
  const completedTests = new Set(attempts.map((a) => a.source_test));
  const [multiplier, setMultiplier] = useState<ActTimeMultiplier>(parseTimeMultiplier(defaultMultiplier));

  return (
    <main className={s.container}>
      <header className={s.header}>
        <div className={s.eyebrow}>Practice tests</div>
        <h1 className={s.h1}>Practice tests</h1>
        <p className={s.sub}>
          Full-length ACT simulations under timed conditions. Pick a
          form below to start.
        </p>
      </header>

      {tabs}

      {resumeInfo && <ResumeCard info={resumeInfo} />}

      <section className={s.launcherCard}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Available tests</div>
            <div className={s.cardHint}>
              Each card is one ACT form, taken section by section at the
              official pace for its format. Released forms leave out the
              unscored questions, so a shorter section gets proportionally
              less time (40 English questions in 28 minutes is the same
              pace as 50 in 35). You start each section&apos;s clock
              yourself; it does not pause once it runs.
            </div>
          </div>
          <label className={s.timingRow}>
            <span className={s.timingLabel}>Timing</span>
            <select
              className={s.timingSelect}
              value={String(multiplier)}
              onChange={(e) => setMultiplier(parseTimeMultiplier(e.target.value))}
              aria-label="Extended-time accommodation"
            >
              {ACT_TIME_MULTIPLIERS.map((m) => (
                <option key={m} value={String(m)}>{MULTIPLIER_LABELS[m]}</option>
              ))}
            </select>
          </label>
        </div>

        {forms.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No ACT tests yet.</div>
            <div className={s.emptyBody}>
              ACT content is being added; check back soon.
            </div>
          </div>
        ) : (
          <ul className={s.cardGrid}>
            {forms.map((form) => (
              <TestFormCard
                key={form.sourceTest}
                form={form}
                multiplier={multiplier}
                completed={completedTests.has(form.sourceTest)}
                resuming={resumeInfo?.sourceTest === form.sourceTest}
              />
            ))}
          </ul>
        )}
      </section>

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.h2}>History</div>
          <div className={s.cardHint}>
            {attempts.length} completed test{attempts.length === 1 ? '' : 's'}
          </div>
        </div>
        {attempts.length === 0 ? (
          <div className={s.empty}>
            <div className={s.emptyTitle}>No tests completed yet.</div>
            <div className={s.emptyBody}>
              Start one above and it&apos;ll appear here with section scores.
            </div>
          </div>
        ) : (
          <ActHistoryTable attempts={attempts} />
        )}
      </section>
    </main>
  );
}

function ResumeCard({ info }: { info: HubResumeInfo }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);

  async function onAbandon() {
    const ok = await confirm({
      title: `Abandon ${info.sourceTest}?`,
      body: 'Sections you finished stay on your record, but this attempt will not get a score and cannot be resumed.',
      confirmLabel: 'Abandon test',
      tone: 'danger',
    });
    if (!ok) return;
    setError(null);
    const fd = new FormData();
    fd.set('attempt_id', info.attemptId);
    startTransition(async () => {
      const res = await abandonActPracticeTest(null, fd);
      if (res?.ok) router.refresh();
      else setError(res?.error ?? 'Could not abandon the test.');
    });
  }

  const where = info.sectionLabel
    ? `Section ${info.sectionIndex + 1} of ${info.sectionCount} · ${info.sectionLabel}${info.sectionStatus === 'in_progress' ? ' (clock running)' : ''}`
    : `${info.sectionCount} sections`;

  return (
    <div className={s.resumeCard} role="status">
      <div>
        <strong>You have a test in progress:</strong>{' '}
        {info.sourceTest}
        {' · '}
        {where}
        {error && <div className={s.testCardError} role="alert">{error}</div>}
      </div>
      <div className={s.resumeActions}>
        <Link
          href={`/practice/test/act/attempt/${info.attemptId}`}
          className={s.resumeLink}
        >
          Continue →
        </Link>
        <button type="button" className={s.abandonBtn} onClick={onAbandon} disabled={pending}>
          Abandon
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}

function TestFormCard({
  form,
  multiplier,
  completed,
  resuming,
}: {
  form: HubForm;
  multiplier: ActTimeMultiplier;
  completed: boolean;
  resuming: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onStart() {
    const fd = new FormData();
    fd.set('source_test', form.sourceTest);
    fd.set('time_multiplier', String(multiplier));
    setError(null);
    startTransition(async () => {
      // startActPracticeTest redirects on success (which throws
      // internally — Next's redirect — so we never see a return
      // value); on failure it returns an actionFail result.
      const res = await startActPracticeTest(null, fd);
      if (res && res.ok === false) {
        setError(res.error ?? 'Could not start this test. Please try again.');
      }
    });
  }

  // The same plan the server will build, for display: per-section
  // limits at the chosen multiplier, total time, and the break.
  const questionsBySection: Partial<Record<ActSection, string[]>> = {};
  for (const sec of form.sections) {
    questionsBySection[sec.section] = Array.from({ length: sec.count }, (_, i) => `${sec.section}-${i}`);
  }
  const plan = buildSectionPlan({ format: form.format, multiplier, questionsBySection });
  const totalMs = plan.reduce((acc, p) => acc + p.time_limit_ms, 0);
  const breakMs = plan.reduce((acc, p) => acc + p.break_after_ms, 0);

  return (
    <li className={s.testCard}>
      <div className={s.testCardBody}>
        <div className={s.testCardTitle}>
          {form.sourceTest}
          <span className={s.formatBadge}>{ACT_FORMAT_LABELS[form.format]}</span>
          {form.format === 'enhanced' && (
            <span className={s.formatBadge}>{ACT_FORM_KIND_LABELS[form.kind]}</span>
          )}
          {completed && <span className={s.testCardCompleted}>✓ Completed</span>}
        </div>
        <ul className={s.sectionLines}>
          {plan.map((p) => (
            <li key={p.section}>
              {sectionLabel(p.section)} · {p.question_count} question{p.question_count === 1 ? '' : 's'} · {minutesLabel(p.time_limit_ms)}
            </li>
          ))}
        </ul>
        <div className={s.testCardMeta}>
          {plan.length === 1 ? 'One section' : `${plan.length} sections`} · {minutesLabel(totalMs)}
          {breakMs > 0 ? ` + ${minutesLabel(breakMs)} break` : ''}
        </div>
      </div>
      <button
        type="button"
        className={s.testCardCta}
        onClick={onStart}
        disabled={pending}
      >
        {pending ? 'Opening…' : resuming ? 'Continue' : 'Start'}
      </button>
      {error && (
        <p role="alert" className={s.testCardError}>{error}</p>
      )}
    </li>
  );
}

function ActHistoryTable({ attempts }: { attempts: HubAttempt[] }) {
  return (
    <div className={s.tableWrap}>
      <table className={s.table}>
        <thead>
          <tr>
            <th className={s.th}>Form</th>
            <th className={s.th}>Finished</th>
            <th className={s.thNum}>English</th>
            <th className={s.thNum}>Math</th>
            <th className={s.thNum}>Reading</th>
            <th className={s.thNum}>Science</th>
            <th className={s.thNum}>Composite</th>
            <th className={s.th}></th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => (
            <tr key={a.id}>
              <td className={s.td}>
                {a.source_test}
                {a.time_multiplier != null && Number(a.time_multiplier) > 1
                  ? ` · ${Number(a.time_multiplier)}× time`
                  : ''}
              </td>
              <td className={s.td}>{formatDate(a.finished_at)}</td>
              <td className={s.tdNum}>{cellOrDash(a.english_scaled)}</td>
              <td className={s.tdNum}>{cellOrDash(a.math_scaled)}</td>
              <td className={s.tdNum}>{cellOrDash(a.reading_scaled)}</td>
              <td className={s.tdNum}>{cellOrDash(a.science_scaled)}</td>
              <td className={`${s.tdNum} ${s.tdComposite}`}>
                {cellOrDash(a.composite_score)}
              </td>
              <td className={s.tdAction}>
                <Link
                  href={`/practice/test/act/attempt/${a.id}/results`}
                  className={s.viewLink}
                >
                  View report →
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function cellOrDash(v: number | null | undefined): string {
  return typeof v === 'number' && Number.isFinite(v) ? String(v) : '—';
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
