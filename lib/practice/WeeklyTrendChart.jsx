// Weekly accuracy + volume chart, shared between the tutor
// performance page (cohort scope) and the student dashboard
// (single-student scope). Same shape in both: an array of
// rolling 7-day buckets with attempts / correct / accuracy
// (null for empty weeks). Two series in one viewBox:
//
//   - vertical bars at the bottom = weekly attempt volume
//     (relative to the busiest week in the window)
//   - line on top  = weekly accuracy, scaled to [0, 1]
//
// Hand-rolled SVG instead of pulling a chart library — the
// data is small (≤13 weeks for a 90-day window) and a chart
// library would dwarf the visualization. Server-rendered, no
// hydration cost.
//
// `labels` lets the caller customize the three legend tile
// captions (the cohort version uses "Window avg"; a single
// student wants "Last 90 days" or similar). Defaults match
// the tutor page's wording.

import s from './WeeklyTrendChart.module.css';

const WIDTH = 560;
const HEIGHT = 160;
const MARGIN = { top: 12, right: 16, bottom: 24, left: 28 };
const INNER_W = WIDTH - MARGIN.left - MARGIN.right;
const INNER_H = HEIGHT - MARGIN.top - MARGIN.bottom;

const ACC_TICKS = [0, 0.5, 1];

const DEFAULT_LABELS = {
  latest: 'This week',
  average: 'Window avg',
  delta: 'Δ vs prior',
  latestSubEmpty: 'No attempts yet',
  deltaSub: 'Latest week vs window',
};

/**
 * @param {{
 *   trend: Array<{ startIso: string, endIso: string, attempts: number, correct: number, accuracy: number|null }>,
 *   labels?: Partial<typeof DEFAULT_LABELS>,
 * }} props
 */
export function WeeklyTrendChart({ trend, labels }) {
  const L = { ...DEFAULT_LABELS, ...(labels ?? {}) };
  if (!trend || trend.length === 0) return null;
  const maxAttempts = Math.max(...trend.map((b) => b.attempts), 1);

  // Bucket positions on the x-axis. Bars take 70% of the slot
  // width with the line points centered on the bar's center.
  const slotW = INNER_W / trend.length;
  const barW = slotW * 0.7;

  // Build the accuracy line as a polyline — skip null buckets
  // so empty weeks don't pull the line to 0%.
  const linePoints = trend
    .map((b, i) => {
      if (b.accuracy == null) return null;
      const cx = MARGIN.left + slotW * i + slotW / 2;
      const cy = MARGIN.top + INNER_H - b.accuracy * INNER_H;
      return { i, cx, cy, b };
    })
    .filter(Boolean);

  // Aggregates for the right-side legend.
  const totalAttempts = trend.reduce((sum, b) => sum + b.attempts, 0);
  const totalCorrect = trend.reduce((sum, b) => sum + b.correct, 0);
  const avgAccuracy = totalAttempts > 0 ? totalCorrect / totalAttempts : null;

  // Latest non-empty week for the "this week" callout.
  const latest = [...trend].reverse().find((b) => b.attempts > 0) ?? null;
  const prior = (() => {
    if (!latest) return null;
    const idx = trend.indexOf(latest);
    if (idx <= 0) return null;
    // Average of all earlier weeks, weighted by attempts.
    let a = 0; let c = 0;
    for (let i = 0; i < idx; i += 1) {
      a += trend[i].attempts;
      c += trend[i].correct;
    }
    return a > 0 ? c / a : null;
  })();
  const accuracyDelta = (latest?.accuracy != null && prior != null)
    ? latest.accuracy - prior
    : null;

  return (
    <div className={s.wrap}>
      <div className={s.legend}>
        <div className={s.legendStat}>
          <div className={s.legendLabel}>{L.latest}</div>
          <div className={s.legendValue}>
            {latest && latest.attempts > 0
              ? `${Math.round(latest.accuracy * 100)}%`
              : '—'}
          </div>
          <div className={s.legendSub}>
            {latest && latest.attempts > 0
              ? `${latest.correct} / ${latest.attempts} correct`
              : L.latestSubEmpty}
          </div>
        </div>
        <div className={s.legendStat}>
          <div className={s.legendLabel}>{L.average}</div>
          <div className={s.legendValue}>
            {avgAccuracy != null ? `${Math.round(avgAccuracy * 100)}%` : '—'}
          </div>
          <div className={s.legendSub}>
            {totalAttempts.toLocaleString()} attempts
          </div>
        </div>
        <div className={s.legendStat}>
          <div className={s.legendLabel}>{L.delta}</div>
          <div
            className={[
              s.legendValue,
              accuracyDelta != null && accuracyDelta > 0.005 ? s.deltaUp : null,
              accuracyDelta != null && accuracyDelta < -0.005 ? s.deltaDown : null,
            ].filter(Boolean).join(' ')}
          >
            {accuracyDelta == null
              ? '—'
              : `${accuracyDelta > 0 ? '+' : ''}${Math.round(accuracyDelta * 100)} pts`}
          </div>
          <div className={s.legendSub}>
            {L.deltaSub}
          </div>
        </div>
      </div>

      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label="Cohort accuracy and attempt volume by week"
        className={s.chart}
      >
        {/* y-axis tick guides for accuracy */}
        {ACC_TICKS.map((t) => {
          const y = MARGIN.top + INNER_H - t * INNER_H;
          return (
            <g key={t}>
              <line
                x1={MARGIN.left} y1={y}
                x2={MARGIN.left + INNER_W} y2={y}
                className={s.gridLine}
              />
              <text
                x={MARGIN.left - 6}
                y={y}
                className={s.tickLabel}
                textAnchor="end"
                dominantBaseline="middle"
              >
                {Math.round(t * 100)}%
              </text>
            </g>
          );
        })}

        {/* volume bars */}
        {trend.map((b, i) => {
          if (b.attempts === 0) return null;
          const h = (b.attempts / maxAttempts) * (INNER_H * 0.45);
          const x = MARGIN.left + slotW * i + (slotW - barW) / 2;
          const y = MARGIN.top + INNER_H - h;
          return (
            <rect
              key={`bar-${i}`}
              x={x}
              y={y}
              width={barW}
              height={h}
              className={s.volBar}
              rx={2}
            />
          );
        })}

        {/* accuracy line */}
        {linePoints.length >= 2 && (
          <polyline
            points={linePoints.map((p) => `${p.cx},${p.cy}`).join(' ')}
            className={s.accLine}
          />
        )}
        {linePoints.map((p) => (
          <circle
            key={`pt-${p.i}`}
            cx={p.cx}
            cy={p.cy}
            r={3}
            className={s.accDot}
          >
            <title>
              {`Week ending ${formatShort(p.b.endIso)}: ${
                Math.round((p.b.accuracy ?? 0) * 100)
              }% on ${p.b.attempts} attempts`}
            </title>
          </circle>
        ))}

        {/* x-axis: one label every other week to avoid crowding */}
        {trend.map((b, i) => {
          if (i % 2 !== 0 && i !== trend.length - 1) return null;
          const cx = MARGIN.left + slotW * i + slotW / 2;
          return (
            <text
              key={`xt-${i}`}
              x={cx}
              y={HEIGHT - 6}
              className={s.tickLabel}
              textAnchor="middle"
            >
              {formatShort(b.endIso)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

function formatShort(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
