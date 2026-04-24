// Test-date countdown banner.
//
// Rendered when a student has their target SAT date set on
// profiles.sat_test_date. Shows days-remaining + a suggested
// study-time split across flashcards, weak-questions drilling,
// and full-length tests; the split biases toward mocks as the
// date approaches. Used on the Review page and on the dashboard.
//
// Server-friendly — takes an iso date string and today-ms (so the
// caller snapshots "now" once per render for React 19 / compiler
// purity rules) and returns JSX. Shape of the output is
// intentionally consistent across both mount points.

import s from './StudyCountdown.module.css';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * @param {object} props
 * @param {string|null} props.isoDate     — profiles.sat_test_date
 * @param {number}      [props.todayMs]   — optional override (defaults to Date.now())
 * @param {boolean}     [props.compact]   — slimmer banner for the dashboard mount
 */
export function StudyCountdown({ isoDate, todayMs, compact = false }) {
  const countdown = buildCountdown(isoDate, todayMs);
  if (!countdown) return null;

  return (
    <div className={`${s.banner} ${compact ? s.compact : ''}`}>
      <div className={s.top}>
        <div>
          <div className={s.title}>
            {countdown.daysLeft === 0
              ? 'Your SAT is today — rest up'
              : countdown.daysLeft === 1
                ? 'Your SAT is tomorrow'
                : countdown.daysLeft < 0
                  ? 'Your target test date has passed'
                  : `Your SAT is in ${countdown.daysLeft} days`}
          </div>
          <div className={s.sub}>{countdown.dateLabel}</div>
        </div>
        {countdown.plan && countdown.daysLeft > 0 && (
          <div className={s.plan}>
            <div className={s.planLabel}>Suggested split</div>
            <div className={s.planRow}>
              <span><strong>{countdown.plan.flashcards}</strong> flashcards</span>
              <span><strong>{countdown.plan.weak}</strong> weak questions</span>
              <span><strong>{countdown.plan.mocks}</strong> full tests</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function buildCountdown(isoDate, todayMs) {
  if (!isoDate) return null;
  const d = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;

  const anchor = todayMs ?? Date.now();
  const today = new Date(anchor);
  today.setHours(0, 0, 0, 0);
  const daysLeft = Math.round((d.getTime() - today.getTime()) / DAY_MS);

  const dateLabel = d.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  return {
    daysLeft,
    dateLabel,
    plan: daysLeft > 0 ? allocateDays(daysLeft) : null,
  };
}

/**
 * Rough study-plan allocation. Close to test = heavier mocks;
 * plenty of runway = heavier flashcards + weak-questions.
 * Output is an integer day count per bucket; sum equals daysLeft.
 */
function allocateDays(daysLeft) {
  let wFlash;
  let wWeak;
  let wMocks;
  if (daysLeft <= 5) {
    wFlash = 1; wWeak = 2; wMocks = 2;
  } else if (daysLeft <= 14) {
    wFlash = 2; wWeak = 3; wMocks = 2;
  } else {
    wFlash = 3; wWeak = 4; wMocks = 2;
  }
  const total = wFlash + wWeak + wMocks;
  const raw = [
    (daysLeft * wFlash) / total,
    (daysLeft * wWeak) / total,
    (daysLeft * wMocks) / total,
  ];
  const floored = raw.map(Math.floor);
  const leftover = daysLeft - floored.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < leftover; k += 1) {
    floored[order[k % order.length].i] += 1;
  }
  return { flashcards: floored[0], weak: floored[1], mocks: floored[2] };
}
