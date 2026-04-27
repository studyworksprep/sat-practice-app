// Practice-test launcher — dropdown + accommodations + Launch link.
//
// Lives on the /practice/tests page (primary) and used to live on
// /practice/start as a compact panel. Launching goes to the per-
// test instruction page (/practice/test/[id]) rather than straight
// into the runner, because students told us that felt like a real
// SAT starting. The selected accommodation rides across as
// ?ext=1&mult=1.5 so the launch page opens with the multiplier
// already picked and the module times on screen reflect the
// adjusted clock.
//
// Self-contained client island — no server actions, no session
// tracking. Just state for the select + accommodation controls,
// and an <a href="…"> that the browser navigates.

'use client';

import { useMemo, useState } from 'react';
import s from './TestLauncher.module.css';

/**
 * @typedef {{
 *   id: string,
 *   code: string | null,
 *   name: string,
 *   isAdaptive: boolean,
 *   completed: boolean,
 * }} TestOption
 */

/**
 * @param {object} props
 * @param {TestOption[]} props.tests
 * @param {string}       [props.basePath='/practice']
 */
export function TestLauncher({ tests, basePath = '/practice' }) {
  const firstIncomplete = useMemo(
    () => tests.find((t) => !t.completed) ?? tests[0] ?? null,
    [tests],
  );
  const [selectedId, setSelectedId] = useState(firstIncomplete?.id ?? '');
  const [accommodationOn, setAccommodationOn] = useState(false);
  const [multiplier, setMultiplier] = useState(1.5);

  const selectedTest = tests.find((t) => t.id === selectedId) ?? null;

  const launchHref = (() => {
    if (!selectedTest) return '#';
    const params = new URLSearchParams();
    if (accommodationOn && multiplier > 1) {
      params.set('ext', '1');
      params.set('mult', String(multiplier));
    }
    const qs = params.toString();
    return `${basePath}/test/${selectedTest.id}${qs ? `?${qs}` : ''}`;
  })();

  return (
    <div className={s.launcher}>
      <div className={s.row}>
        <label className={s.label}>
          Test
          <select
            className={s.select}
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
          >
            {tests.length === 0 && (
              <option value="">No published tests yet</option>
            )}
            {tests.map((t) => (
              <option key={t.id} value={t.id}>
                {t.completed ? '✓ ' : ''}
                {t.name}
                {t.code ? ` · ${t.code}` : ''}
                {t.isAdaptive ? ' · Adaptive' : ''}
                {t.completed ? ' · completed' : ''}
              </option>
            ))}
          </select>
        </label>

        <label className={s.check}>
          <input
            type="checkbox"
            checked={accommodationOn}
            onChange={(e) => setAccommodationOn(e.target.checked)}
          />
          <span>Extra-time accommodation</span>
        </label>

        {accommodationOn && (
          <select
            className={s.multiplier}
            value={multiplier}
            onChange={(e) => setMultiplier(Number(e.target.value))}
            aria-label="Time multiplier"
          >
            <option value={1.5}>1.5× time</option>
            <option value={2}>2× time</option>
          </select>
        )}

        <a
          href={launchHref}
          className={s.launchBtn}
          aria-disabled={!selectedTest}
        >
          Launch test →
        </a>
      </div>
    </div>
  );
}
