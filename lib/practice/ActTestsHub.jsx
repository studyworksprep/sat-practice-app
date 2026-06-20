// ACT practice-tests hub. Sibling to the SAT hub layout that lives
// directly in app/next/(student)/practice/tests/page.js — same
// shape (header / Resume callout / per-form card grid / history
// table) but the data model is the ACT virtual-construct model
// (§3.4): each card is a distinct source_test from act_questions,
// and clicking Start writes a practice_sessions row with
// test_type='act' + filter_criteria.kind='practice_test'.
//
// Rendered as a client island so the Start button can use
// useTransition + the startActPracticeTest Server Action without
// a per-card form-action plumbing.

'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import { startActPracticeTest } from '@/app/(student)/practice/tests/actions';
import s from './ActTestsHub.module.css';

/**
 * @param {object} props
 * @param {Array<{ sourceTest: string, total: number,
 *   sections: Array<{ section: string, count: number }> }>} props.forms
 * @param {Array<{ id: string, source_test: string,
 *   finished_at: string, english_scaled: number|null,
 *   math_scaled: number|null, reading_scaled: number|null,
 *   science_scaled: number|null, composite_score: number|null }>} props.attempts
 * @param {{ sessionId: string, position: number, total: number,
 *   sourceTest: string|null, deadlineAt: string|null }|null}
 *   [props.resumeInfo]
 * @param {React.ReactNode} props.tabs - Tabs nav rendered above the
 *   header so the test-type slice is the first thing visible.
 */
export function ActTestsHub({ forms, attempts, resumeInfo, tabs }) {
  const completedTests = new Set(attempts.map((a) => a.source_test));

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

      {resumeInfo && (
        <div className={s.resumeCard} role="status">
          <div>
            <strong>You have a test in progress:</strong>{' '}
            {resumeInfo.sourceTest ?? 'ACT practice test'}
            {' · '}
            Question {resumeInfo.position + 1} of {resumeInfo.total}
          </div>
          <Link
            href={`/practice/s/${resumeInfo.sessionId}/${resumeInfo.position}`}
            className={s.resumeLink}
          >
            Continue →
          </Link>
        </div>
      )}

      <section className={s.launcherCard}>
        <div className={s.cardHeader}>
          <div>
            <div className={s.h2}>Available tests</div>
            <div className={s.cardHint}>
              Each card is a single ACT form. The timer starts the
              moment you click Start.
            </div>
          </div>
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
                completed={completedTests.has(form.sourceTest)}
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

function TestFormCard({ form, completed }) {
  const [pending, startTransition] = useTransition();
  function onStart() {
    const fd = new FormData();
    fd.set('source_test', form.sourceTest);
    startTransition(async () => {
      await startActPracticeTest(null, fd);
      // startActPracticeTest redirects on success; on failure it
      // returns an actionFail result we currently swallow because
      // the card doesn't yet have an inline error slot. Failures
      // here are rare (rate-limit only) and the next click retries.
    });
  }

  // Single-section form label: "Math · 45 questions". Multi-section
  // form (none seeded today): "English 40 · Math 60 · 100 total".
  const isSingleSection = form.sections.length === 1;
  const headlineSection = isSingleSection ? sectionLabel(form.sections[0].section) : null;

  return (
    <li className={s.testCard}>
      <div className={s.testCardBody}>
        <div className={s.testCardTitle}>
          {form.sourceTest}
          {completed && <span className={s.testCardCompleted}>✓ Completed</span>}
        </div>
        <div className={s.testCardMeta}>
          {isSingleSection
            ? `${headlineSection} · ${form.total} question${form.total === 1 ? '' : 's'}`
            : form.sections
                .map((sec) => `${sectionLabel(sec.section)} ${sec.count}`)
                .join(' · ')
              + ` · ${form.total} total`}
        </div>
      </div>
      <button
        type="button"
        className={s.testCardCta}
        onClick={onStart}
        disabled={pending}
      >
        {pending ? 'Starting…' : 'Start'}
      </button>
    </li>
  );
}

function ActHistoryTable({ attempts }) {
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
              <td className={s.td}>{a.source_test}</td>
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

function cellOrDash(v) {
  return Number.isFinite(v) ? String(v) : '—';
}

function formatDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
