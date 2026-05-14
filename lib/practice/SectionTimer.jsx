// Countdown timer for ACT practice-test sessions. The session row
// carries an ISO deadline in filter_criteria.deadlineAt; this
// component ticks once a second and calls `onExpire` when the
// deadline passes so the runner can auto-submit the set.
//
// Persistence is implicit: the deadline lives on the server-side
// session row, so reloading the runner just recomputes the
// remaining ms from the same anchor. We never store the timer in
// localStorage — that would let a student "pause" by closing the
// tab. The clock runs as long as the session is in_progress.

'use client';

import { useEffect, useRef, useState } from 'react';
import s from './SectionTimer.module.css';

/**
 * @param {object} props
 * @param {string} props.deadlineIso - ISO string when the section
 *   ends; once Date.now() crosses this, onExpire fires.
 * @param {() => void} props.onExpire - Invoked exactly once when
 *   the deadline passes. The runner uses this to fire its
 *   submit-set Server Action.
 * @param {string} [props.label='Section'] - Optional label shown
 *   next to the countdown (e.g. "Math").
 */
export function SectionTimer({ deadlineIso, onExpire, label = 'Section' }) {
  const deadlineMs = deadlineIso ? Date.parse(deadlineIso) : null;

  // Render once with the initial remaining ms, then re-render on
  // each tick. We hold `expired` as a ref to make sure onExpire
  // fires exactly once even if the parent re-renders us.
  const expiredRef = useRef(false);
  const [remainingMs, setRemainingMs] = useState(() => {
    if (!deadlineMs) return 0;
    return Math.max(0, deadlineMs - Date.now());
  });

  useEffect(() => {
    if (!deadlineMs) return undefined;

    // Fire onExpire immediately if the deadline is already past
    // (e.g. the student reloaded after the section ended).
    if (deadlineMs <= Date.now() && !expiredRef.current) {
      expiredRef.current = true;
      onExpire();
      return undefined;
    }

    const t = setInterval(() => {
      const rem = Math.max(0, deadlineMs - Date.now());
      setRemainingMs(rem);
      if (rem === 0 && !expiredRef.current) {
        expiredRef.current = true;
        onExpire();
      }
    }, 1000);
    return () => clearInterval(t);
    // onExpire is intentionally not in the dep list — we want the
    // initial callback reference to be the one that fires. If the
    // parent re-creates it on every render, useRef + the
    // expiredRef guard above keeps the call exactly-once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deadlineMs]);

  if (!deadlineMs) return null;

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const display =
    hours > 0
      ? `${hours}:${pad(minutes)}:${pad(seconds)}`
      : `${minutes}:${pad(seconds)}`;

  // Warn at 5:00 remaining, urgent at 1:00. Drives a CSS pulse so
  // the timer doesn't surprise the student when time's nearly up.
  const tone =
    remainingMs <= 60_000
      ? 'urgent'
      : remainingMs <= 5 * 60_000
        ? 'warn'
        : 'normal';

  return (
    <div
      className={`${s.timer} ${s[`timer_${tone}`] ?? ''}`}
      role="timer"
      aria-live="off"
      aria-label={`${label} time remaining`}
    >
      <span className={s.label}>{label}</span>
      <span className={s.value}>{display}</span>
    </div>
  );
}

function pad(n) {
  return String(n).padStart(2, '0');
}
