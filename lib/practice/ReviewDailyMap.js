// Daily-practice bar chart for the assignment-flavored session
// review report. One bar per calendar day in the assignment's
// range; bar height encodes attempt count, bar color encodes
// accuracy (green ≥80%, amber 50–79%, red <50%, slate when
// the student didn't practice that day). Replaces the previous
// intensity-tinted square strip — the lighter/darker squares
// were too subtle to read at a glance.
//
// Lives next to ReviewInteractive but extracted so the main
// file stays readable. Shares ReviewInteractive.module.css.

'use client';

import s from './ReviewInteractive.module.css';

export function ReviewDailyMap({ dailyMap }) {
  const max = Math.max(1, ...dailyMap.days.map((d) => d.attempts));
  const firstLabel = formatDayLabel(dailyMap.firstDay);
  const lastLabel = formatDayLabel(dailyMap.lastDay);
  // Sum the per-day correct totals so the header can surface the
  // assignment's overall accuracy alongside the attempt count.
  const totalCorrect = dailyMap.days.reduce(
    (sum, d) => sum + (d.correct || 0),
    0,
  );
  const overallAcc = dailyMap.totalAttempts > 0
    ? Math.round((totalCorrect / dailyMap.totalAttempts) * 100)
    : null;

  return (
    <div className={s.dailyMap}>
      <div className={s.dailyMapRange}>
        <span>{firstLabel}</span>
        <span className={s.dailyMapRangeTotal}>
          {dailyMap.totalAttempts} attempt{dailyMap.totalAttempts === 1 ? '' : 's'} over{' '}
          {dailyMap.days.length} day{dailyMap.days.length === 1 ? '' : 's'}
          {overallAcc != null && ` · ${overallAcc}% correct`}
        </span>
        <span>{lastLabel}</span>
      </div>

      <div className={s.dailyChart}>
        {dailyMap.days.map((d) => {
          const heightPct = d.attempts > 0
            ? Math.max(8, (d.attempts / max) * 100)
            : 0;
          const acc = d.attempts > 0
            ? Math.round((d.correct / d.attempts) * 100)
            : null;
          const toneCls =
            d.attempts === 0 ? s.dailyBarEmpty
            : acc == null    ? s.dailyBarNeutral
            : acc >= 80      ? s.dailyBarGood
            : acc >= 50      ? s.dailyBarOk
            :                  s.dailyBarLow;
          const title =
            d.attempts === 0
              ? `${formatDayLabel(d.date)} — no practice`
              : `${formatDayLabel(d.date)} — ${d.attempts} attempt${
                  d.attempts === 1 ? '' : 's'
                }${acc != null ? `, ${acc}% correct` : ''}`;
          return (
            <div
              key={d.date}
              className={s.dailyBarCol}
              title={title}
              aria-label={title}
            >
              <div className={s.dailyBarValue}>
                {d.attempts > 0 ? d.attempts : ''}
              </div>
              <div className={s.dailyBarTrack}>
                {d.attempts > 0 ? (
                  <div
                    className={`${s.dailyBarFill} ${toneCls}`}
                    style={{ height: `${heightPct}%` }}
                  />
                ) : (
                  <div className={`${s.dailyBarFill} ${toneCls}`} />
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.dailyChartLegend}>
        <span className={s.dailyLegendItem}>
          <span className={`${s.dailyLegendSwatch} ${s.dailyBarGood}`} />
          ≥ 80% accuracy
        </span>
        <span className={s.dailyLegendItem}>
          <span className={`${s.dailyLegendSwatch} ${s.dailyBarOk}`} />
          50–79%
        </span>
        <span className={s.dailyLegendItem}>
          <span className={`${s.dailyLegendSwatch} ${s.dailyBarLow}`} />
          &lt; 50%
        </span>
        <span className={s.dailyLegendItem}>
          <span className={`${s.dailyLegendSwatch} ${s.dailyBarEmpty}`} />
          No practice
        </span>
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
