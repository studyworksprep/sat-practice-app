// Inline SVG progress-toward-target chart for the tutor's student
// detail page. Plots official composite scores over time as a
// connected polyline, with the student's target_sat_score as a
// dashed horizontal reference line.
//
// Server-renderable — no hooks, no client boundary. Sized to fit
// in a card slot with a fixed aspect ratio; the polyline scales
// to fit whatever min/max the data + target suggest.
//
// Empty-state copy lives at the call site, not here — this just
// returns null when there's nothing to plot, so the caller can
// pick its own placeholder.

import s from './StudentDetail.module.css';

const VIEWBOX_W = 720;
const VIEWBOX_H = 220;
const MARGIN = { top: 18, right: 88, bottom: 32, left: 56 };

const PLOT_W = VIEWBOX_W - MARGIN.left - MARGIN.right;
const PLOT_H = VIEWBOX_H - MARGIN.top - MARGIN.bottom;

/**
 * @param {object} props
 * @param {Array<{ test_date: string, composite_score: number, test_type?: string|null }>} props.scores
 * @param {number|null} props.targetScore
 */
export function ScoreProgressChart({ scores, targetScore }) {
  if (!scores || scores.length === 0) return null;

  // Sort oldest → newest so the polyline reads left-to-right.
  const points = scores
    .filter((s) => s.composite_score != null && s.test_date)
    .map((s) => ({ ms: Date.parse(s.test_date), score: Number(s.composite_score), type: s.test_type ?? 'SAT' }))
    .filter((p) => Number.isFinite(p.ms) && Number.isFinite(p.score))
    .sort((a, b) => a.ms - b.ms);

  if (points.length === 0) return null;

  const scoreValues = points.map((p) => p.score);
  const targetValue = targetScore != null ? Number(targetScore) : null;
  const minScoreRaw = Math.min(...scoreValues, targetValue ?? Number.POSITIVE_INFINITY);
  const maxScoreRaw = Math.max(...scoreValues, targetValue ?? Number.NEGATIVE_INFINITY);

  // Pad the y-domain by 40 points (a typical SAT bin) so the line
  // doesn't kiss the edge. Clamp to the SAT total range 400–1600.
  const yMin = Math.max(400, Math.floor((minScoreRaw - 40) / 50) * 50);
  const yMax = Math.min(1600, Math.ceil((maxScoreRaw + 40) / 50) * 50);
  const ySpan = Math.max(1, yMax - yMin);

  const tMin = points[0].ms;
  const tMax = points[points.length - 1].ms;
  const tSpan = Math.max(1, tMax - tMin);

  const xFor = (ms) => MARGIN.left + ((ms - tMin) / tSpan) * PLOT_W;
  const yFor = (score) => MARGIN.top + (1 - (score - yMin) / ySpan) * PLOT_H;

  // Single-point case: anchor it horizontally in the center.
  const xs = points.length === 1
    ? points.map(() => MARGIN.left + PLOT_W / 2)
    : points.map((p) => xFor(p.ms));
  const ys = points.map((p) => yFor(p.score));
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${xs[i].toFixed(1)} ${ys[i].toFixed(1)}`).join(' ');

  // Y-axis tick marks: 4 evenly-spaced score values across yMin–yMax.
  const yTicks = [0, 1, 2, 3, 4].map((i) => yMin + (ySpan * i) / 4);

  const targetY = targetValue != null ? yFor(targetValue) : null;
  const latestScore = points[points.length - 1].score;

  return (
    <div className={s.chartWrap}>
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        className={s.chart}
        role="img"
        aria-label={
          targetValue != null
            ? `Score progress chart, latest ${latestScore}, target ${targetValue}`
            : `Score progress chart, latest ${latestScore}`
        }
      >
        {/* Y-axis ticks + gridlines */}
        {yTicks.map((tick) => {
          const y = yFor(tick);
          return (
            <g key={tick}>
              <line
                x1={MARGIN.left}
                x2={MARGIN.left + PLOT_W}
                y1={y}
                y2={y}
                className={s.chartGrid}
              />
              <text
                x={MARGIN.left - 8}
                y={y + 4}
                textAnchor="end"
                className={s.chartTickLabel}
              >
                {Math.round(tick)}
              </text>
            </g>
          );
        })}

        {/* Target line + label */}
        {targetY != null && (
          <g>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + PLOT_W}
              y1={targetY}
              y2={targetY}
              className={s.chartTargetLine}
            />
            <text
              x={MARGIN.left + PLOT_W + 8}
              y={targetY + 4}
              className={s.chartTargetLabel}
            >
              Target {targetValue}
            </text>
          </g>
        )}

        {/* Score polyline + points */}
        {points.length > 1 && (
          <path d={pathD} className={s.chartLine} />
        )}
        {points.map((p, i) => (
          <g key={`${p.ms}-${i}`}>
            <circle cx={xs[i]} cy={ys[i]} r={4} className={s.chartDot} />
            <text
              x={xs[i]}
              y={ys[i] - 8}
              textAnchor="middle"
              className={s.chartPointLabel}
            >
              {p.score}
            </text>
          </g>
        ))}

        {/* X-axis: leftmost + rightmost date labels */}
        <text
          x={xs[0]}
          y={MARGIN.top + PLOT_H + 18}
          textAnchor="start"
          className={s.chartTickLabel}
        >
          {formatShort(points[0].ms)}
        </text>
        {points.length > 1 && (
          <text
            x={xs[xs.length - 1]}
            y={MARGIN.top + PLOT_H + 18}
            textAnchor="end"
            className={s.chartTickLabel}
          >
            {formatShort(points[points.length - 1].ms)}
          </text>
        )}
      </svg>
    </div>
  );
}

function formatShort(ms) {
  const d = new Date(ms);
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
