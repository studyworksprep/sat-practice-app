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

import { useEffect, useId, useRef, useState } from 'react';
import { formatDate, formatShortDate, parseLocalOrIso } from '@/lib/formatters';
import s from './ReviewInteractive.module.css';

export function ReviewDailyMap({ dailyMap }) {
  const frameRef = useRef(null);
  const scrollRef = useRef(null);
  const dayRefs = useRef([]);
  const tooltipId = useId();
  const [activeDay, setActiveDay] = useState(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [canScroll, setCanScroll] = useState(false);
  const [plotWidth, setPlotWidth] = useState(0);
  // Match the 4px grid gap and 20px minimum column in the plot. Label
  // density follows the space per day, including after the card resizes.
  const dayWidth = Math.max(
    20,
    (plotWidth - 4 * (dailyMap.days.length - 1)) /
      Math.max(1, dailyMap.days.length),
  );
  const labelStep = dayWidth >= 44 ? 1 : dayWidth >= 28 ? 2 : 7;
  const showEveryDate = labelStep === 1;
  const dateTicks = getDateTicks(dailyMap.days, labelStep);
  const max = Math.max(1, ...dailyMap.days.map((d) => d.attempts));
  const firstLabel = formatDate(dailyMap.firstDay);
  const lastLabel = formatDate(dailyMap.lastDay);
  const practiceDays = dailyMap.days.filter((day) => day.attempts > 0);
  const lastPracticeDay = practiceDays.at(-1);
  // Sum the per-day correct totals so the header can surface the
  // assignment's overall accuracy alongside the attempt count.
  const totalCorrect = dailyMap.days.reduce(
    (sum, d) => sum + (d.correct || 0),
    0,
  );
  const overallAcc =
    dailyMap.totalAttempts > 0
      ? Math.round((totalCorrect / dailyMap.totalAttempts) * 100)
      : null;

  useEffect(() => {
    const scroll = scrollRef.current;
    if (!scroll) return;
    const observer = new ResizeObserver(() => {
      setPlotWidth(scroll.clientWidth - 4);
      setCanScroll(scroll.scrollWidth > scroll.clientWidth + 1);
    });
    observer.observe(scroll);
    return () => observer.disconnect();
  }, [dailyMap.days.length]);

  function showDay(index, target = dayRefs.current[index]) {
    if (!target || !frameRef.current) return;
    const frame = frameRef.current.getBoundingClientRect();
    const bar = target.getBoundingClientRect();
    if (bar.right <= frame.left || bar.left >= frame.right) {
      setActiveDay(null);
      return;
    }
    // Keep the tooltip outside the scrolling plot and within the card edges.
    const halfWidth = Math.min(110, (frame.width - 12) / 2);
    const center = (bar.left + bar.right) / 2 - frame.left;
    const left = Math.max(
      halfWidth + 6,
      Math.min(frame.width - halfWidth - 6, center),
    );
    setActiveDay({ index, left: `${(left / frame.width) * 100}%` });
  }

  function handleKeyDown(event, index) {
    if (event.key === 'Escape') {
      setActiveDay(null);
      return;
    }
    const next =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? dailyMap.days.length - 1
              : null;
    if (next == null) return;
    event.preventDefault();
    dayRefs.current[
      Math.max(0, Math.min(dailyMap.days.length - 1, next))
    ]?.focus();
  }

  const selectedDay = activeDay == null ? null : dailyMap.days[activeDay.index];

  return (
    <div className={s.dailyMap}>
      <div className={s.dailyMapRange}>
        <span>
          {firstLabel}
          {firstLabel !== lastLabel && ` – ${lastLabel}`}
        </span>
        <span className={s.dailyMapRangeTotal}>
          {dailyMap.totalAttempts} attempt
          {dailyMap.totalAttempts === 1 ? '' : 's'} over {dailyMap.days.length}{' '}
          day{dailyMap.days.length === 1 ? '' : 's'}
          {overallAcc != null && ` · ${overallAcc}% correct`}
        </span>
      </div>

      <div
        ref={frameRef}
        className={s.dailyChartFrame}
        onPointerLeave={() => {
          const focused = dayRefs.current.indexOf(document.activeElement);
          if (focused >= 0) showDay(focused);
          else setActiveDay(null);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget))
            setActiveDay(null);
        }}
      >
        <div
          className={s.dailyActivitySummary}
          style={{ visibility: selectedDay ? 'hidden' : undefined }}
        >
          {practiceDays.length === 0 ? (
            'No practice in this period'
          ) : (
            <>
              Practiced on {practiceDays.length} of {dailyMap.days.length} day
              {dailyMap.days.length === 1 ? '' : 's'}
              {' · '}Last activity {formatDayLabel(lastPracticeDay.date)}
            </>
          )}
        </div>
        {selectedDay && (
          <div
            id={tooltipId}
            role="tooltip"
            className={s.dailyChartTooltip}
            style={{ left: activeDay.left }}
          >
            <strong>
              {formatDate(selectedDay.date, {
                weekday: 'short',
                year: 'numeric',
              })}
            </strong>
            <span>{formatDayActivity(selectedDay)}</span>
          </div>
        )}
        <div
          ref={scrollRef}
          className={s.dailyChartScroll}
          onScroll={() => {
            if (activeDay) showDay(activeDay.index);
          }}
        >
          <div
            className={s.dailyChart}
            data-date-labels={
              showEveryDate ? 'daily' : labelStep === 2 ? 'spaced' : 'weekly'
            }
            style={{
              '--daily-days': dailyMap.days.length,
              '--daily-day-width': '20px',
            }}
          >
            {dailyMap.days.map((d, index) => {
              const heightPct =
                d.attempts > 0 ? Math.max(8, (d.attempts / max) * 100) : 0;
              const acc =
                d.attempts > 0
                  ? Math.round((d.correct / d.attempts) * 100)
                  : null;
              const toneCls =
                d.attempts === 0
                  ? s.dailyBarEmpty
                  : acc == null
                    ? s.dailyBarNeutral
                    : acc >= 80
                      ? s.dailyBarGood
                      : acc >= 50
                        ? s.dailyBarOk
                        : s.dailyBarLow;
              const label = `${formatDate(d.date, { weekday: 'short', year: 'numeric' })} — ${formatDayActivity(d)}`;
              return (
                <button
                  key={d.date}
                  ref={(node) => {
                    dayRefs.current[index] = node;
                  }}
                  type="button"
                  className={s.dailyBarCol}
                  tabIndex={index === focusIndex ? 0 : -1}
                  aria-label={label}
                  aria-describedby={
                    activeDay?.index === index ? tooltipId : undefined
                  }
                  data-date={d.date}
                  onPointerEnter={(event) =>
                    showDay(index, event.currentTarget)
                  }
                  onFocus={(event) => {
                    setFocusIndex(index);
                    showDay(index, event.currentTarget);
                  }}
                  onClick={(event) => showDay(index, event.currentTarget)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                >
                  <span className={s.dailyBarValue} aria-hidden="true">
                    {d.attempts > 0 ? d.attempts : ''}
                  </span>
                  <span className={s.dailyBarTrack} aria-hidden="true">
                    {d.attempts > 0 ? (
                      <span
                        className={`${s.dailyBarFill} ${toneCls}`}
                        style={{ height: `${heightPct}%` }}
                      />
                    ) : (
                      <span className={`${s.dailyBarFill} ${toneCls}`} />
                    )}
                  </span>
                  <span className={s.dailyBarDate} aria-hidden="true">
                    {dateTicks.has(index) && formatDayLabel(d.date)}
                    {showEveryDate && (
                      <span className={s.dailyBarWeekday}>
                        {parseLocalOrIso(d.date).toLocaleDateString('en-US', {
                          weekday: 'short',
                        })}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {(!showEveryDate || canScroll) && (
          <p className={s.dailyChartHint}>
            {!showEveryDate &&
              (labelStep === 2
                ? 'One bar per day · Dates every 2 days'
                : 'One bar per day · Weekly date labels')}
            {!showEveryDate && canScroll && ' · '}
            {canScroll && 'Swipe or scroll to see all days'}
          </p>
        )}
      </div>

      <div className={s.dailyChartLegend}>
        <span className={s.dailyLegendItem}>
          <span className={`${s.dailyLegendSwatch} ${s.dailyBarGood}`} />≥ 80%
          accuracy
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
  return formatShortDate(iso) || iso || '';
}

function formatDayActivity(day) {
  if (day.attempts === 0) return 'No practice';
  const accuracy = Math.round((day.correct / day.attempts) * 100);
  return `${day.attempts} attempt${day.attempts === 1 ? '' : 's'}, ${accuracy}% correct`;
}

function getDateTicks(days, labelStep) {
  if (labelStep === 1) return new Set(days.map((_, index) => index));
  const ticks = new Set([0, days.length - 1]);
  if (labelStep === 2) {
    for (let index = 2; index < days.length - 2; index += 2) ticks.add(index);
    return ticks;
  }
  let previous = 0;
  days.forEach((day, index) => {
    // Anchor longer timelines to Mondays. Leave enough room around the
    // endpoints for their labels, even on a narrow screen.
    if (
      index - previous >= 3 &&
      days.length - 1 - index >= 3 &&
      parseLocalOrIso(day.date).getDay() === 1
    ) {
      ticks.add(index);
      previous = index;
    }
  });
  return ticks;
}
