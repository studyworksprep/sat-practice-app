// ACT practice-tests hub — the ?test=act slice of /practice/tests.
// Laid out like the SAT hub in app/(student)/practice/tests/page.js
// and drawn from the same stylesheets, so the sidebar's SAT/ACT switch
// changes the content but not the page:
//
//   PageHeader · stats strip (server-rendered, passed in) · resume bar
//   · "Launch a test" card (one row: Test, Sections, Timing, Start —
//   the SAT TestLauncher's row) · History table.
//
// The data model is the ACT virtual-construct model (§3.4): each form
// is a distinct source_test from act_questions, and Start creates an
// act_practice_test_attempts row carrying the chosen section plan
// (Phase 3 multi-section test mode). Sections are timed one at a time
// from the attempt page; the form's format (classic / enhanced, from
// act_forms) decides the limits and the break.
//
// Client island so Start / Abandon can call their Server Actions with
// useTransition.

'use client';

import { useMemo, useState, useTransition } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useConfirm } from '@/lib/ui/ConfirmDialog';
import { PageHeader } from '@/lib/ui/PageHeader';
import { HelpButton } from '@/app/(student)/help/HelpButton';
import { sectionLabel, type ActSection } from '@/lib/practice/act-taxonomy';
import {
  ACT_FORMAT_LABELS,
  ACT_TIME_MULTIPLIERS,
  buildSectionPlan,
  minutesLabel,
  parseTimeMultiplier,
  isUntimedPlan,
  type ActFormat,
  type ActFormKind,
  type ActTimeMultiplier,
  type PlanSection,
} from '@/lib/practice/act-test-plan';
import {
  abandonActPracticeTest,
  startActPracticeTest,
} from '@/app/(student)/practice/tests/actions';
import p from '@/app/(student)/practice/tests/PracticeTestsPage.module.css';
import l from './TestLauncher.module.css';
import s from './ActTestsHub.module.css';

export interface HubForm {
  sourceTest: string;
  /** Student-facing name (act_forms.display_name or the derived default). */
  name: string;
  format: ActFormat | null;
  reviewReason: string | null;
  kind: ActFormKind;
  total: number;
  sections: Array<{ section: ActSection; count: number }>;
}

export interface HubAttempt {
  id: string;
  source_test: string;
  /** Student-facing name of the form; falls back to source_test. */
  name?: string;
  finished_at: string | null;
  english_scaled: number | null;
  math_scaled: number | null;
  reading_scaled: number | null;
  science_scaled: number | null;
  composite_score: number | null;
  time_multiplier?: number | null;
  untimed?: boolean;
}

export interface HubResumeInfo {
  attemptId: string;
  sourceTest: string;
  name: string;
  sectionIndex: number;
  sectionCount: number;
  sectionLabel: string | null;
  sectionStatus: string | null;
  startedAt: string | null;
  plan: PlanSection[];
  timeMultiplier: ActTimeMultiplier;
}

type Timing = ActTimeMultiplier | 'untimed';

const TIMING_LABELS: Record<string, string> = {
  1: 'Standard time',
  1.5: '1.5× time',
  2: '2× time',
  untimed: 'Untimed',
};

export function ActTestsHub({
  forms,
  attempts,
  resumeInfo,
  stats,
  chart,
  defaultMultiplier = 1,
}: {
  forms: HubForm[];
  attempts: HubAttempt[];
  resumeInfo: HubResumeInfo | null;
  /** The stats strip, rendered on the server with the SAT hub's tiles. */
  stats?: ReactNode;
  /** Recent-composites chart (server-rendered); shown under the launcher. */
  chart?: ReactNode;
  /** Standing accommodation (profiles.time_accommodation); pre-selects Timing. */
  defaultMultiplier?: number;
}) {
  const completedTests = useMemo(() => new Set(attempts.map((a) => a.source_test)), [attempts]);

  return (
    <main className={p.container}>
      <PageHeader
        eyebrow="Practice · ACT"
        title="Practice tests"
        description="Full-length ACT practice tests, or just the sections you want to focus on. Your progress and history are below the launcher."
        actions={<HelpButton slug="practice-tests" sectionId="act-practice-test" />}
      />

      {stats}

      {resumeInfo && <ResumeCard info={resumeInfo} />}

      <section className={p.launcherCard}>
        <div className={p.cardHeader}>
          <div>
            <div className={p.h2}>Launch a test</div>
            <div className={p.cardHint}>
              Pick a test, choose your sections and timing, and start. Your
              extended-time setting from the Account page is pre-selected.
              Released forms leave out unscored questions, so a shorter section
              gets proportionally less time. You start each section&apos;s clock
              yourself, and it doesn&apos;t pause once it runs.
            </div>
          </div>
        </div>
        {forms.length === 0 ? (
          <div className={p.empty}>
            <div className={p.emptyTitle}>No ACT tests yet.</div>
            <div className={p.emptyBody}>ACT content is being added; check back soon.</div>
          </div>
        ) : (
          <ActTestLauncher
            forms={forms}
            completedTests={completedTests}
            resumeInfo={resumeInfo}
            defaultMultiplier={defaultMultiplier}
          />
        )}
      </section>

      {chart}

      <section className={p.card}>
        <div className={p.cardHeader}>
          <div className={p.h2}>History</div>
          <div className={p.cardHint}>
            {attempts.length} completed test{attempts.length === 1 ? '' : 's'}
          </div>
        </div>
        {attempts.length === 0 ? (
          <div className={p.empty}>
            <div className={p.emptyTitle}>No tests completed yet.</div>
            <div className={p.emptyBody}>
              Launch one above and it&apos;ll appear here with section scores
              and a link to its results.
            </div>
          </div>
        ) : (
          <ActHistoryTable attempts={attempts} />
        )}
      </section>
    </main>
  );
}

// ──────────────────────────────────────────────────────────────

function isReady(form: HubForm): boolean {
  return form.format != null && !form.reviewReason;
}

function ActTestLauncher({
  forms,
  completedTests,
  resumeInfo,
  defaultMultiplier,
}: {
  forms: HubForm[];
  completedTests: Set<string>;
  resumeInfo: HubResumeInfo | null;
  defaultMultiplier: number;
}) {
  // Default to the first ready form not yet taken, like the SAT launcher.
  const initial = forms.find((f) => isReady(f) && !completedTests.has(f.sourceTest))
    ?? forms.find(isReady)
    ?? forms[0];
  const [sourceTest, setSourceTest] = useState(initial.sourceTest);
  // 'full', one section code ("english only"), or 'custom' (checkboxes).
  const [sectionMode, setSectionMode] = useState<string>('full');
  const [customSections, setCustomSections] = useState<ActSection[]>([]);
  const [timing, setTiming] = useState<Timing>(parseTimeMultiplier(defaultMultiplier));
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const form = forms.find((f) => f.sourceTest === sourceTest) ?? initial;
  const ready = isReady(form);
  const inProgressHere = resumeInfo?.sourceTest === form.sourceTest;
  const formSections = form.sections.map((sec) => sec.section);

  const sections: ActSection[] = sectionMode === 'full'
    ? formSections
    : sectionMode === 'custom'
      ? formSections.filter((sec) => customSections.includes(sec))
      : formSections.filter((sec) => sec === sectionMode);

  const untimed = timing === 'untimed';
  const multiplier: ActTimeMultiplier = untimed ? 1 : timing;

  const questionsBySection: Partial<Record<ActSection, string[]>> = {};
  for (const sec of form.sections) {
    questionsBySection[sec.section] = Array.from({ length: sec.count }, (_, i) => `${sec.section}-${i}`);
  }
  const plan = ready && sections.length > 0
    ? buildSectionPlan({ format: form.format as ActFormat, multiplier, questionsBySection, selectedSections: sections, untimed })
    : [];
  const totalQuestions = plan.reduce((n, sec) => n + sec.question_count, 0);
  const totalMs = plan.reduce((n, sec) => n + sec.time_limit_ms, 0);
  const breakMs = plan.reduce((n, sec) => n + sec.break_after_ms, 0);

  function onChangeForm(next: string) {
    setSourceTest(next);
    setError(null);
    const nextForm = forms.find((f) => f.sourceTest === next);
    const nextSections = nextForm?.sections.map((sec) => sec.section) ?? [];
    // A single-section pick the new form doesn't have falls back to full.
    if (sectionMode !== 'full' && sectionMode !== 'custom' && !nextSections.includes(sectionMode as ActSection)) {
      setSectionMode('full');
    }
    setCustomSections((cur) => cur.filter((sec) => nextSections.includes(sec)));
  }

  function onStart() {
    if (!ready || sections.length === 0 || pending) return;
    const fd = new FormData();
    fd.set('source_test', form.sourceTest);
    fd.set('time_multiplier', String(multiplier));
    fd.set('timing_mode', untimed ? 'untimed' : 'timed');
    fd.set('section_selection', 'custom');
    for (const sec of sections) fd.append('sections', sec);
    setError(null);
    startTransition(async () => {
      // Redirects on success; returns actionFail on failure.
      const res = await startActPracticeTest(null, fd);
      if (res && res.ok === false) setError(res.error ?? 'Could not start this test. Please try again.');
    });
  }

  const summary = !ready
    ? 'This form is still being reviewed and can’t be taken as a timed test yet.'
    : sections.length === 0
      ? 'Select at least one section.'
      : [
          form.format ? ACT_FORMAT_LABELS[form.format] : null,
          `${plan.length} section${plan.length === 1 ? '' : 's'}`,
          `${totalQuestions} questions`,
          untimed ? 'Untimed' : `${minutesLabel(totalMs)}${breakMs > 0 ? ` + ${minutesLabel(breakMs)} break` : ''}`,
        ].filter(Boolean).join(' · ');

  return (
    <div className={l.launcher}>
      <div className={l.row}>
        <label className={l.label}>
          Test
          <select className={l.select} value={sourceTest} onChange={(e) => onChangeForm(e.target.value)}>
            {forms.map((f) => (
              <option key={f.sourceTest} value={f.sourceTest}>
                {completedTests.has(f.sourceTest) ? '✓ ' : ''}
                {f.name}
                {!isReady(f) ? ' · not ready yet' : completedTests.has(f.sourceTest) ? ' · completed' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className={l.sectionLabel}>
          Sections
          <select
            className={l.select}
            value={sectionMode}
            onChange={(e) => {
              setSectionMode(e.target.value);
              if (e.target.value === 'custom' && customSections.length === 0) setCustomSections(formSections);
              setError(null);
            }}
            disabled={inProgressHere}
          >
            <option value="full">Full test</option>
            {form.sections.length > 1 && form.sections.map((sec) => (
              <option key={sec.section} value={sec.section}>{sectionLabel(sec.section)} only</option>
            ))}
            {form.sections.length > 2 && <option value="custom">Choose sections…</option>}
          </select>
        </label>

        <label className={l.sectionLabel}>
          Timing
          <select
            className={l.select}
            value={String(timing)}
            onChange={(e) => setTiming(e.target.value === 'untimed' ? 'untimed' : parseTimeMultiplier(e.target.value))}
            disabled={inProgressHere}
          >
            {ACT_TIME_MULTIPLIERS.map((m) => (
              <option key={m} value={String(m)}>{TIMING_LABELS[String(m)]}</option>
            ))}
            <option value="untimed">{TIMING_LABELS.untimed}</option>
          </select>
        </label>

        {inProgressHere && resumeInfo ? (
          <Link href={`/practice/test/act/attempt/${resumeInfo.attemptId}`} className={l.launchBtn}>
            Continue test →
          </Link>
        ) : (
          <button
            type="button"
            className={l.launchBtn}
            onClick={onStart}
            disabled={!ready || sections.length === 0 || pending}
            aria-disabled={!ready || sections.length === 0 || pending}
          >
            {pending ? 'Opening…' : 'Start test →'}
          </button>
        )}
      </div>

      {sectionMode === 'custom' && !inProgressHere && (
        <fieldset className={s.sectionPicker}>
          <legend className={s.srOnly}>Sections to include</legend>
          {form.sections.map((sec) => (
            <label key={sec.section} className={s.sectionChoice}>
              <input
                type="checkbox"
                checked={customSections.includes(sec.section)}
                onChange={(e) => {
                  const on = e.target.checked;
                  setCustomSections((cur) => on ? [...cur, sec.section] : cur.filter((v) => v !== sec.section));
                  setError(null);
                }}
              />
              {sectionLabel(sec.section)}
            </label>
          ))}
        </fieldset>
      )}

      <p className={s.planLine}>
        {inProgressHere ? 'You have this test in progress. Continue keeps its saved sections and timing.' : summary}
      </p>
      {!inProgressHere && ready && plan.length > 1 && (
        <p className={s.planSections}>
          {plan.map((sec) => (
            `${sectionLabel(sec.section)}: ${sec.question_count} question${sec.question_count === 1 ? '' : 's'}, ${sec.time_limit_ms === 0 ? 'untimed' : minutesLabel(sec.time_limit_ms)}`
          )).join('  ·  ')}
        </p>
      )}
      {error && <p role="alert" className={s.error}>{error}</p>}
    </div>
  );
}

function ResumeCard({ info }: { info: HubResumeInfo }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const [error, setError] = useState<string | null>(null);

  async function onAbandon() {
    const ok = await confirm({
      title: `Abandon ${info.name}?`,
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
    ? `Section ${info.sectionIndex + 1} of ${info.sectionCount} · ${info.sectionLabel}${isUntimedPlan(info.plan) ? ' · Untimed' : info.sectionStatus === 'in_progress' ? ' (clock running)' : ''}`
    : `${info.sectionCount} sections`;

  return (
    <div className={p.resumeCard} role="status">
      <div>
        <strong>You have a test in progress:</strong>{' '}
        {info.name}{' · '}{where}
        {error && <div className={s.error} role="alert">{error}</div>}
      </div>
      <div className={s.resumeActions}>
        <Link href={`/practice/test/act/attempt/${info.attemptId}`} className={p.resumeLink}>
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

function ActHistoryTable({ attempts }: { attempts: HubAttempt[] }) {
  return (
    <div className={p.tableWrap}>
      <table className={p.table}>
        <thead>
          <tr>
            <th className={p.th}>Test</th>
            <th className={p.th}>Finished</th>
            <th className={p.thNum}>English</th>
            <th className={p.thNum}>Math</th>
            <th className={p.thNum}>Reading</th>
            <th className={p.thNum}>Science</th>
            <th className={p.thNum}>Composite</th>
            <th className={p.th}></th>
          </tr>
        </thead>
        <tbody>
          {attempts.map((a) => {
            const meta = a.untimed
              ? 'Untimed'
              : a.time_multiplier != null && Number(a.time_multiplier) > 1
                ? `${Number(a.time_multiplier)}× time`
                : null;
            return (
              <tr key={a.id}>
                <td className={p.td}>
                  <div className={p.testName}>{a.name ?? a.source_test}</div>
                  {meta && <div className={p.testMeta}>{meta}</div>}
                </td>
                <td className={p.td}>{formatDate(a.finished_at)}</td>
                <td className={p.tdNum}>{cellOrDash(a.english_scaled)}</td>
                <td className={p.tdNum}>{cellOrDash(a.math_scaled)}</td>
                <td className={p.tdNum}>{cellOrDash(a.reading_scaled)}</td>
                <td className={p.tdNum}>{cellOrDash(a.science_scaled)}</td>
                <td className={`${p.tdNum} ${p.tdComposite}`}>{cellOrDash(a.composite_score)}</td>
                <td className={p.tdAction}>
                  <Link href={`/practice/test/act/attempt/${a.id}/results`} className={p.viewLink}>
                    View report →
                  </Link>
                </td>
              </tr>
            );
          })}
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
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
