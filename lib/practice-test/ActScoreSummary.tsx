import Link from 'next/link';
import { formatDuration } from '@/lib/practice/format-duration';
import type { ActSectionRow } from './load-act-test-results';
import s from './ActScoreSummary.module.css';

/** Shared ACT test summary for score reports and question review. */
export function ActScoreSummary({ sectionRows, compositeScore, reviewHref = null, sectionReviewHrefs = {}, scoreDescription = null }: {
  sectionRows: Omit<ActSectionRow, 'sessionId'>[];
  compositeScore: number | null;
  reviewHref?: string | null;
  sectionReviewHrefs?: Record<string, string>;
  scoreDescription?: string | null;
}) {
  const single = sectionRows.length === 1 ? sectionRows[0] : null;
  const score = single ? single.scaled : compositeScore;
  const total = sectionRows.reduce((n, row) => n + row.raw.total, 0);
  const correct = sectionRows.reduce((n, row) => n + row.raw.correct, 0);
  const answered = sectionRows.reduce((n, row) => n + row.attempted, 0);
  const time = sectionRows.reduce((n, row) => n + row.timeMs, 0);
  return (
    <section className={s.summary} aria-label="ACT test scores">
      <div className={s.overview}>
        <div className={s.score}>
          <h2>{single ? `${single.label} score` : 'Composite score'}</h2>
          <div className={s.value}>{score ?? '—'}<span> / 36</span></div>
          <p>{score != null ? (!single && scoreDescription ? scoreDescription : 'ACT scaled score') : single ? 'Scaled score unavailable for this attempt.' : (scoreDescription ?? 'Composite unavailable for this attempt.')}</p>
          {single && <p>Single-section practice test</p>}
        </div>
        <dl className={s.stats}>
          <div><dt>Questions correct</dt><dd>{correct}<small> / {total}</small></dd><p>{total ? Math.round(correct / total * 100) : 0}% of all questions</p></div>
          <div><dt>To review</dt><dd>{total - correct}</dd><p>{answered - correct} incorrect · {total - answered} unanswered</p></div>
          <div><dt>Recorded time</dt><dd>{time > 0 ? formatDuration(time) : '—'}</dd><p>Time spent on questions</p></div>
        </dl>
      </div>
      {!single && <div className={s.sections}>
        {sectionRows.map(row => <div key={row.section} className={s.section}>
          <h3>{row.label}</h3>
          <div className={s.sectionScore}>{row.scaled ?? '—'}<small> / 36</small></div>
          <p>{row.raw.correct} of {row.raw.total} correct</p>
          {row.scaled == null && <p>Scaled score unavailable</p>}
          {(sectionReviewHrefs[row.section] || reviewHref) && <Link href={sectionReviewHrefs[row.section] || `${reviewHref}?section=${row.section}`}>Review {row.label} →</Link>}
        </div>)}
      </div>}
      {single && (sectionReviewHrefs[single.section] || reviewHref) && <Link className={s.review} href={sectionReviewHrefs[single.section] || `${reviewHref}?section=${single.section}`}>Review {single.label} questions →</Link>}
      {sectionRows.some(row => row.scaled == null) && <p className={s.note}>A scaled score requires the conversion table for this ACT form. Raw question counts are shown where a saved scaled score is unavailable.</p>}
    </section>
  );
}
