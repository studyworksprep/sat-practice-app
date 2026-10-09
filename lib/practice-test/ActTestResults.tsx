// ACT practice-test results view. Server Component shared by the
// student and tutor routes — the loader (load-act-test-results.js)
// does the reads; this renders the composite + per-section tiles and
// links to the question-by-question review.
//
// Composite is only reported when all four section scales exist,
// which today needs a four-section form with a conversion table.
// Single-section forms show their one section and explain why the
// composite is blank.

import Link from 'next/link';
import { formatDate } from '@/lib/formatters';
import type { ActSectionRow, ActTestResultsAttempt } from './load-act-test-results';
import s from './ActResults.module.css';

interface ActTestResultsProps {
  attempt: ActTestResultsAttempt;
  sectionRows: ActSectionRow[];
  /** Where "Open review report" goes (student: /practice/review/<sid>;
   *  tutor: /tutor/sessions/<sid>). Null hides the link. */
  reviewHref: string | null;
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
  reviewHref,
  backHref = null,
  backLabel = '← Back',
  viewerNote = null,
}: ActTestResultsProps) {
  const anyScaledMissing = sectionRows.some((r) => r.scaled == null);

  return (
    <main className={s.container}>
      <header className={s.header}>
        {backHref && (
          <Link href={backHref} className={s.reviewLink}>{backLabel}</Link>
        )}
        <div className={s.eyebrow}>ACT practice test</div>
        <h1 className={s.h1}>{attempt.sourceTest}</h1>
        <p className={s.sub}>
          Finished {formatDate(attempt.finishedAt)}
          {viewerNote ? ` · ${viewerNote}` : ''}
        </p>
      </header>

      {Number.isFinite(attempt.compositeScore) ? (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValue}>{attempt.compositeScore}</div>
          <div className={s.compositeSub}>Out of 36 · rounded average of the four section scales</div>
        </section>
      ) : sectionRows.length < 4 ? (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValueMissing}>—</div>
          <div className={s.compositeSub}>
            Composite is the average of all four section scales. This
            attempt covered {sectionRows.length === 1 ? 'one section' : `${sectionRows.length} sections`},
            so the composite isn&apos;t reported.
          </div>
        </section>
      ) : (
        <section className={s.compositeCard}>
          <div className={s.compositeLabel}>Composite</div>
          <div className={s.compositeValueMissing}>—</div>
          <div className={s.compositeSub}>
            Composite needs a scaled score for all four sections; at
            least one is still pending for this form.
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
          question) lives on the session review page.
        </p>
        {reviewHref && (
          <Link className={s.reviewLink} href={reviewHref}>
            Open review report →
          </Link>
        )}
      </section>
    </main>
  );
}
