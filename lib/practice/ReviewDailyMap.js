// Daily-practice heatmap strip for the assignment-flavored
// session review report. One cell per calendar day in the
// assignment's range; cell intensity is the day's attempt count
// against the assignment's question set; gaps make "did it in
// one sitting" vs "three short stretches" visible at a glance.
//
// Lives next to ReviewInteractive but extracted so the main
// file stays readable. Shares ReviewInteractive.module.css.

'use client';

import s from './ReviewInteractive.module.css';

export function ReviewDailyMap({ dailyMap }) {
  const max = Math.max(1, ...dailyMap.days.map((d) => d.attempts));
  const firstLabel = formatDayLabel(dailyMap.firstDay);
  const lastLabel = formatDayLabel(dailyMap.lastDay);
  return (
    <div className={s.dailyMap}>
      <div className={s.dailyMapRange}>
        <span>{firstLabel}</span>
        <span className={s.dailyMapRangeTotal}>
          {dailyMap.totalAttempts} attempt{dailyMap.totalAttempts === 1 ? '' : 's'} over{' '}
          {dailyMap.days.length} day{dailyMap.days.length === 1 ? '' : 's'}
        </span>
        <span>{lastLabel}</span>
      </div>
      <div className={s.dailyMapStrip}>
        {dailyMap.days.map((d) => {
          const pct = d.attempts > 0 ? d.attempts / max : 0;
          const cls =
            d.attempts === 0
              ? s.dailyCellEmpty
              : pct >= 0.75
                ? s.dailyCell4
                : pct >= 0.5
                  ? s.dailyCell3
                  : pct >= 0.25
                    ? s.dailyCell2
                    : s.dailyCell1;
          const acc =
            d.attempts > 0 ? Math.round((d.correct / d.attempts) * 100) : null;
          const title =
            d.attempts === 0
              ? `${formatDayLabel(d.date)} — no practice`
              : `${formatDayLabel(d.date)} — ${d.attempts} attempt${
                  d.attempts === 1 ? '' : 's'
                }${acc != null ? `, ${acc}% correct` : ''}`;
          return (
            <span
              key={d.date}
              className={`${s.dailyCell} ${cls}`}
              title={title}
              aria-label={title}
            />
          );
        })}
      </div>
    </div>
  );
}

function formatDayLabel(iso) {
  if (!iso) return '';
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}
