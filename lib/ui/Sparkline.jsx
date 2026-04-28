// Tiny inline SVG sparkline. Renders a polyline through a series
// of values, normalized to its viewBox. Sized to sit comfortably
// inside a stat tile (default 80×24).
//
// Designed to consume the same trend bucket shape the weekly-
// trend RPC returns:
//   [{ accuracy: 0.72, attempts: 14, ... }, ...]
//
// Caller picks which numeric field via the `field` prop, and a
// stroke color via `tone` (resolved against the design-system
// tile-* tokens). Empty values (null / 0 / NaN) render as a
// flat baseline rather than dragging the line down — for
// "accuracy" especially, a no-attempts week is missing data,
// not a 0% week. Pass `treatZeroAsNull: true` to opt into that
// behavior on the attempts series too.
//
// Server-renderable; no hooks, no client boundary.

import s from './Sparkline.module.css';

const VIEWBOX_W = 80;
const VIEWBOX_H = 24;
const PADDING = 2;

const TONE_CLASS = {
  gold: s.toneGold,
  cyan: s.toneCyan,
  navy: s.toneNavy,
  success: s.toneSuccess,
  danger: s.toneDanger,
  amber: s.toneAmber,
  violet: s.toneViolet,
  slate: s.toneSlate,
};

/**
 * @param {{
 *   data: Array<number | null | undefined> | Array<Record<string, number | null | undefined>>,
 *   field?: string,
 *   tone?: keyof typeof TONE_CLASS,
 *   width?: number,
 *   height?: number,
 *   treatZeroAsNull?: boolean,
 *   ariaLabel?: string,
 * }} props
 */
export function Sparkline({
  data,
  field,
  tone = 'gold',
  width = VIEWBOX_W,
  height = VIEWBOX_H,
  treatZeroAsNull = false,
  ariaLabel,
}) {
  if (!Array.isArray(data) || data.length === 0) return null;

  const series = data.map((d) => {
    const v = field
      ? (d == null ? null : d[field])
      : d;
    if (v == null || Number.isNaN(v)) return null;
    if (treatZeroAsNull && v === 0) return null;
    return Number(v);
  });

  // No usable values → render the empty viewBox so the layout
  // doesn't shift; a flat baseline reads as "no data" without
  // having to pull the consumer into a conditional.
  const usable = series.filter((v) => v != null);
  if (usable.length === 0) {
    return (
      <svg
        viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
        width={width}
        height={height}
        className={`${s.spark} ${TONE_CLASS[tone] ?? TONE_CLASS.gold}`}
        role="img"
        aria-label={ariaLabel ?? 'No data'}
      >
        <line
          x1={PADDING} y1={VIEWBOX_H / 2}
          x2={VIEWBOX_W - PADDING} y2={VIEWBOX_H / 2}
          className={s.baseline}
        />
      </svg>
    );
  }

  const min = Math.min(...usable);
  const max = Math.max(...usable);
  const range = max - min || 1;
  const lastY = (v) =>
    VIEWBOX_H - PADDING - ((v - min) / range) * (VIEWBOX_H - 2 * PADDING);

  // Build the polyline — null buckets break the line so empty
  // weeks don't drag it to 0. Group consecutive non-null
  // values into separate <polyline> segments.
  const segments = [];
  let current = [];
  series.forEach((v, i) => {
    const x = PADDING
      + (series.length === 1 ? 0 : i / (series.length - 1)) * (VIEWBOX_W - 2 * PADDING);
    if (v == null) {
      if (current.length > 0) {
        segments.push(current);
        current = [];
      }
      return;
    }
    current.push({ x, y: lastY(v) });
  });
  if (current.length > 0) segments.push(current);

  // Final-point dot for the most-recent value, so the eye
  // anchors on "where we are now" before scanning the trend.
  const last = [...series].reverse().find((v) => v != null);
  const lastIdx = series.length - 1 - series.slice().reverse().findIndex((v) => v != null);
  const lastX = PADDING
    + (series.length === 1 ? 0 : lastIdx / (series.length - 1)) * (VIEWBOX_W - 2 * PADDING);
  const lastDotY = lastY(last);

  return (
    <svg
      viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
      width={width}
      height={height}
      className={`${s.spark} ${TONE_CLASS[tone] ?? TONE_CLASS.gold}`}
      role="img"
      aria-label={ariaLabel}
    >
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
          className={s.line}
        />
      ))}
      <circle cx={lastX} cy={lastDotY} r={1.6} className={s.dot} />
    </svg>
  );
}
