// Small ↑/↓/→ delta indicator. Shows the change between a
// "current" value and a "prior" value with directional tone.
// Used inside stat tiles where there's a meaningful "vs prior
// period" comparison — e.g., this week vs last week, latest
// 30 days vs prior 60.
//
// `format` controls how the numeric delta renders:
//   - 'percent' (default) → "+12 pts" / "−3 pts" — for
//     percentage values where the comparison is in
//     percentage points, not relative.
//   - 'count'             → "+14" / "−6" — for counts (attempts,
//     sessions, etc.).
//   - 'percentRel'        → "+11%" / "−4%" — for relative change
//     (current − prior) / prior. Pass current and prior raw,
//     not the difference.
//
// `threshold` (default 0.005 for 'percent', 1 for 'count')
// suppresses jitter — anything inside the threshold renders as
// "→" with neutral tone instead of a colored delta. Keeps a
// week-to-week 1-attempt drift from looking dramatic.

import s from './Delta.module.css';

const DEFAULT_THRESHOLDS = {
  percent: 0.005,
  percentRel: 0.005,
  count: 1,
};

/**
 * @param {{
 *   current: number | null,
 *   prior: number | null,
 *   format?: 'percent' | 'percentRel' | 'count',
 *   threshold?: number,
 *   suffix?: string,
 *   className?: string,
 * }} props
 */
export function Delta({
  current,
  prior,
  format = 'percent',
  threshold,
  suffix,
  className,
}) {
  if (current == null || prior == null) {
    return (
      <span className={`${s.delta} ${s.toneNeutral} ${className ?? ''}`}>
        →&nbsp;—
      </span>
    );
  }

  const t = threshold ?? DEFAULT_THRESHOLDS[format] ?? 0;

  let raw;
  let display;
  if (format === 'percent') {
    // Treat current/prior as 0..1 fractions, render delta as
    // "pts" because that's the right framing for accuracy-style
    // metrics (a 60% → 65% change is "+5 pts", not "+8.3%").
    raw = current - prior;
    const pts = Math.round(raw * 100);
    display = `${pts > 0 ? '+' : ''}${pts} pts`;
  } else if (format === 'count') {
    raw = current - prior;
    display = `${raw > 0 ? '+' : ''}${Math.round(raw).toLocaleString()}`;
  } else {
    // percentRel — relative change.
    if (prior === 0) {
      // Pure increase from zero — bypass relative math, render as
      // "new" with positive tone if current > 0.
      raw = current > 0 ? Number.POSITIVE_INFINITY : 0;
      display = current > 0 ? 'new' : '0%';
    } else {
      raw = (current - prior) / prior;
      const pct = Math.round(raw * 100);
      display = `${pct > 0 ? '+' : ''}${pct}%`;
    }
  }

  const tone =
    Number.isFinite(raw) && raw > t ? s.toneUp
    : Number.isFinite(raw) && raw < -t ? s.toneDown
    : !Number.isFinite(raw) && raw > 0 ? s.toneUp
    : s.toneNeutral;

  const arrow =
    Number.isFinite(raw) && raw > t ? '↑'
    : Number.isFinite(raw) && raw < -t ? '↓'
    : !Number.isFinite(raw) && raw > 0 ? '↑'
    : '→';

  return (
    <span className={`${s.delta} ${tone} ${className ?? ''}`}>
      {arrow}&nbsp;{display}{suffix ? ` ${suffix}` : ''}
    </span>
  );
}
