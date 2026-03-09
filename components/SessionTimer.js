'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A practice session timer that counts up from when the user started practicing.
 * Persists across page navigations using sessionStorage.
 *
 * @param {Object} props
 * @param {string} [props.sessionId] - Unique session identifier for persistence
 * @param {boolean} [props.show=true] - Whether to show the timer
 */
export default function SessionTimer({ sessionId, show = true }) {
  const storageKey = sessionId ? `timer_${sessionId}` : null;
  const intervalRef = useRef(null);

  const [elapsed, setElapsed] = useState(0);
  const [paused, setPaused] = useState(false);
  const startTimeRef = useRef(null);

  // Restore or initialize timer
  useEffect(() => {
    if (!storageKey) {
      startTimeRef.current = Date.now();
      return;
    }

    try {
      const raw = sessionStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw);
        startTimeRef.current = saved.startTime;
        setElapsed(Math.floor((Date.now() - saved.startTime) / 1000));
      } else {
        startTimeRef.current = Date.now();
        sessionStorage.setItem(storageKey, JSON.stringify({ startTime: Date.now() }));
      }
    } catch {
      startTimeRef.current = Date.now();
    }
  }, [storageKey]);

  // Tick every second
  useEffect(() => {
    if (paused || !show) {
      if (intervalRef.current) clearInterval(intervalRef.current);
      return;
    }

    intervalRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [paused, show]);

  const togglePause = useCallback(() => {
    setPaused((p) => !p);
  }, []);

  if (!show) return null;

  const hours = Math.floor(elapsed / 3600);
  const minutes = Math.floor((elapsed % 3600) / 60);
  const seconds = elapsed % 60;
  const pad = (n) => String(n).padStart(2, '0');
  const display = hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;

  return (
    <div className="sessionTimer" onClick={togglePause} title={paused ? 'Click to resume' : 'Click to pause'}>
      <span className="sessionTimerIcon">{paused ? '⏸' : '⏱'}</span>
      <span className="sessionTimerDisplay">{display}</span>
    </div>
  );
}
