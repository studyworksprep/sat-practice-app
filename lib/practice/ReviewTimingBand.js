// Per-question timing band for the practice-session review report.
// Hover/focus surfaces the question's skill + measured time +
// status; click jumps the review to that question.
//
// Lives next to ReviewInteractive but keeps the parent file small.
// Shares ReviewInteractive.module.css — the timing-band styles
// already lived alongside the band's styles in that module.

'use client';

import s from './ReviewInteractive.module.css';

export function ReviewTimingBand({
  timing,
  items,
  hoverPosition,
  setHoverPosition,
  onSelect,
}) {
  const totalMs = timing.totalMs > 0 ? timing.totalMs : 1;
  const hover = hoverPosition != null
    ? timing.entries.find((e) => e.position === hoverPosition)
    : null;

  const hovered = hover ? items.find((it) => it.position === hover.position) : null;

  return (
    <div className={s.timing}>
      <div className={s.timingStats}>
        <span>
          Total <strong>{formatMs(timing.totalMs)}</strong>
        </span>
        <span>
          Median <strong>{formatMs(timing.medianMs)}</strong>
        </span>
        <span>
          Measured {timing.measuredCount} / {timing.entries.length}
        </span>
      </div>

      <div className={s.timingBarShell}>
        <div className={s.timingBar}>
          {timing.entries.map((e) => {
            const widthPct =
              e.timeSpentMs > 0
                ? Math.max((e.timeSpentMs / totalMs) * 100, 0.5)
                : 1.25;
            const tone =
              e.status === 'correct'
                ? s.timingSegCorrect
                : e.status === 'incorrect'
                  ? s.timingSegWrong
                  : s.timingSegMissing;
            const isActive = hoverPosition === e.position;
            return (
              <button
                key={e.position}
                type="button"
                className={`${s.timingSeg} ${tone} ${isActive ? s.timingSegActive : ''}`}
                style={{ flex: `${widthPct} 0 0%` }}
                onMouseEnter={() => setHoverPosition(e.position)}
                onMouseLeave={() => setHoverPosition(null)}
                onFocus={() => setHoverPosition(e.position)}
                onBlur={() => setHoverPosition(null)}
                onClick={() => onSelect(e.position)}
                aria-label={`Question ${e.position + 1}, ${formatMs(e.timeSpentMs)}`}
              >
                <span className={s.timingSegNum}>{e.position + 1}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={s.timingHover} aria-live="polite">
        {hover && hovered ? (
          <>
            <span className={s.timingHoverNum}>Q{hover.position + 1}</span>
            <span className={s.timingHoverSkill}>
              {hover.skillName ?? hover.domainName ?? 'Question'}
            </span>
            <span className={s.timingHoverDot}>·</span>
            <span className={s.timingHoverTime}>
              {hover.timeSpentMs > 0 ? formatMs(hover.timeSpentMs) : 'no timing'}
            </span>
            <span className={s.timingHoverDot}>·</span>
            <span
              className={
                hover.status === 'correct'
                  ? s.timingHoverCorrect
                  : hover.status === 'incorrect'
                    ? s.timingHoverWrong
                    : s.timingHoverMissing
              }
            >
              {hover.status}
            </span>
          </>
        ) : (
          <span className={s.timingHoverPlaceholder}>
            Hover a segment to see time spent on that question.
          </span>
        )}
      </div>
    </div>
  );
}

function formatMs(ms) {
  if (!ms || ms <= 0) return '0s';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s2 = totalSec % 60;
  return s2 === 0 ? `${m}m` : `${m}m ${s2}s`;
}
