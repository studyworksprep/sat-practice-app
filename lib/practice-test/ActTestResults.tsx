// ACT practice-test results view. Server Component shared by the
// student and tutor routes — the loader (load-act-test-results.ts)
// does the reads; this renders the composite + per-section tiles and
// links to the question-by-question review of each section.
//
// The composite follows the form's format: all four sections on the
// classic ACT, English/Math/Reading on the enhanced ACT (Science is
// reported separately). Forms that lack a section or a conversion
// table show why the composite is blank.

import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import { ActScoreSummary } from './ActScoreSummary';
import { ActBreakdownCards } from '@/lib/practice/ActBreakdownCards';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import {
  ACT_FORMAT_LABELS,
  compositeDescription,
  compositeSectionsFor,
} from '@/lib/practice/act-test-plan';
import type { ActSectionRow, ActTestResultsAttempt } from './load-act-test-results';
import s from './ActResults.module.css';
import { findActSectionReviewLink } from './act-review-navigation';

export interface ReviewLink {
  label: string;
  href: string;
  section?: string;
}

function sectionReviewHref(href: string, section: string) {
  if (href.startsWith('/practice/test/act/')) return href;
  const [path, query] = href.split('?');
  const params = new URLSearchParams(query);
  params.set('section', section);
  return `${path}?${params}`;
}

interface ActTestResultsProps {
  attempt: ActTestResultsAttempt;
  sectionRows: ActSectionRow[];
  /** One "open review" link per section session (student:
   *  /practice/test/act/attempt/<id>/review/<section>; tutor: /tutor/sessions/<sid>). Empty
   *  hides the review card's links. */
  reviewLinks: ReviewLink[];
  /** Optional breadcrumb target + label. */
  backHref?: string | null;
  backLabel?: string;
  /** Optional line under the title (e.g. the student's name on the
   *  tutor route). */
  viewerNote?: string | null;
}

export function ActTestResults({
  attempt,
  sectionRows,
  reviewLinks,
  backHref = null,
  backLabel = '← Back',
  viewerNote = null,
}: ActTestResultsProps) {
  const needed = compositeSectionsFor(attempt.format);
  const present = new Set(sectionRows.map((r) => r.section));
  const missingSections = needed.filter((sec) => !present.has(sec));
  const pendingSections = needed.filter(
    (sec) => present.has(sec) && sectionRows.find((r) => r.section === sec)?.scaled == null,
  );

  return (
    <main className={s.container}>
      <header className={s.header}>
        {backHref && (
          <Link href={backHref} className={s.reviewLink}>{backLabel}</Link>
        )}
        <div className={s.eyebrow}>ACT score report</div>
        <h1 className={s.h1}>{attempt.formName}</h1>
        <p className={s.sub}>
          {attempt.formDetail ? `${attempt.formDetail} · ` : ''}
          {ACT_FORMAT_LABELS[attempt.format]}
          {' · '}Finished {formatDate(attempt.finishedAt)}
          {attempt.untimed ? ' · Untimed' : attempt.timeMultiplier > 1 ? ` · ${attempt.timeMultiplier}× time` : ''}
          {viewerNote ? ` · ${viewerNote}` : ''}
        </p>
      </header>

      <ActScoreSummary
        sectionRows={sectionRows}
        compositeScore={attempt.compositeScore}
        scoreDescription={Number.isFinite(attempt.compositeScore) ? compositeDescription(attempt.format)
          : missingSections.length ? 'Composite requires ' + missingSections.map(sectionLabel).join(', ') + '.'
          : 'Composite pending scaled scores for ' + pendingSections.map(sectionLabel).join(', ') + '.'}
        sectionReviewHrefs={Object.fromEntries(sectionRows.flatMap(row => {
          const link = findActSectionReviewLink(reviewLinks, row.section, row.sessionId);
          return link ? [[row.section, sectionReviewHref(link.href, row.section)]] : [];
        }))}
      />

      <section aria-label="Performance by ACT category" className={s.breakdownGrid}>
        <ActBreakdownCards domains={sectionRows.map((row) => ({
          code: row.section, name: row.label, correct: row.raw.correct,
          total: row.raw.total, categories: row.categories,
        }))} />
      </section>

      <section className={s.card}>
        <div className={s.h2}>Review your answers</div>
        <p className={s.reviewBody}>
          Choose a section to review your answers, explanations, flagged
          questions, and time spent on each question.
        </p>
        {reviewLinks.length > 0 && (
          <ul className={s.reviewList}>
            {reviewLinks.map((l) => (
              <li key={l.href}>
                <Link className={s.reviewLink} href={l.href}>
                  {l.label} →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
