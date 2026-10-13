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
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import {
  ACT_FORMAT_LABELS,
  compositeDescription,
  compositeSectionsFor,
} from '@/lib/practice/act-test-plan';
import type { ActSectionRow, ActTestResultsAttempt } from './load-act-test-results';
import s from './ActResults.module.css';

export interface ReviewLink {
  label: string;
  href: string;
}

interface ActTestResultsProps {
  attempt: ActTestResultsAttempt;
  sectionRows: ActSectionRow[];
  /** One "open review" link per section session (student:
   *  /practice/review/<sid>; tutor: /tutor/sessions/<sid>). Empty
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
  const anyScaledMissing = sectionRows.some((r) => r.scaled == null);
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
        <div className={s.eyebrow}>ACT practice test</div>
        <h1 className={s.h1}>{attempt.sourceTest}</h1>
        <p className={s.sub}>
          {ACT_FORMAT_LABELS[attempt.format]}
          {' · '}Finished {formatDate(attempt.finishedAt)}
          {attempt.timeMultiplier > 1 ? ` · ${attempt.timeMultiplier}× time` : ''}
          {viewerNote ? ` · ${viewerNote}` : ''}
        </p>
      </header>

      {Number.isFinite(attempt.compositeScore) ? (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValue}>{attempt.compositeScore}</div>
          <div className={s.compositeSub}>{compositeDescription(attempt.format)}</div>
        </section>
      ) : missingSections.length > 0 ? (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValueMissing}>—</div>
          <div className={s.compositeSub}>
            {compositeDescription(attempt.format).replace(/^Out of 36 · /, 'The composite is the ')}.
            This attempt did not include {missingSections.map(sectionLabel).join(', ')},
            so the composite isn&apos;t reported.
          </div>
        </section>
      ) : (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValueMissing}>—</div>
          <div className={s.compositeSub}>
            Composite needs a scaled score for {needed.map(sectionLabel).join(', ')};
            {' '}{pendingSections.length === 1 ? `${sectionLabel(pendingSections[0])} is` : 'some are'} still pending for this form.
          </div>
        </section>
      )}

      <section className={s.card}>
        <div className={s.cardHeader}>
          <div className={s.h2}>Section scores</div>
        </div>
        <div className={s.sectionGrid}>
          {sectionRows.map((row) => (
            <div key={row.section} className={s.sectionTile}>
              <div className={s.sectionTileLabel}>{row.label}</div>
              <div className={s.sectionTileScaled}>
                {row.scaled != null ? row.scaled : '—'}
              </div>
              <div className={s.sectionTileRaw}>
                {row.raw.correct} of {row.raw.total} correct
              </div>
              {row.scaled == null && (
                <div className={s.scaledPending}>
                  Scaled score pending
                </div>
              )}
            </div>
          ))}
        </div>
        {anyScaledMissing && (
          <div className={s.scaledNote}>
            Scaled scores come from the official raw-to-scaled
            conversion table for each ACT form. This form doesn&apos;t
            have one loaded yet, so only raw counts are shown for the
            sections marked pending.
          </div>
        )}
      </section>

      <section className={s.card}>
        <div className={s.h2}>Review</div>
        <p className={s.reviewBody}>
          The question-by-question review (rationales, answers, time per
          question) lives on each section&apos;s review page.
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
