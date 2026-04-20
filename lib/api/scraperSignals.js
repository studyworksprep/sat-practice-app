// Behavioral scraper detection, shadow mode. See docs/architecture-plan.md §3.7.
//
// A real student spends 30–180 seconds per question and interacts with
// the page (selects options, scrolls rationale, uses Desmos, types).
// A scraper hammers sequential content endpoints with millisecond
// spacing and no DOM interaction. This helper looks at per-session
// request cadence and returns a signal level.
//
// Levels:
//   'ok'        - looks normal; no action.
//   'suspicious' - cadence is too tight; log for manual review.
//   'blocked'   - unambiguous scraper pattern; route should fail fast.
//
// The two signals we use:
//   - Requests per window (count-based; tuned against rate limits)
//   - Median inter-request interval (cadence-based)
// A request interval under 150ms sustained across 10+ requests is the
// fingerprint we care about — humans don't page through questions that
// fast.
//
// Phase 1 this module is in SHADOW mode: the check() function returns
// 'ok' unconditionally but logs the computed signal so we can calibrate
// against real traffic before enforcing anything. Phase 2 flips the
// enforce flag once the log shows clean separation.

import { logger } from './logger';

const SESSION_HISTORY_LIMIT = 50;
const MIN_HUMAN_INTERVAL_MS = 150;
const MIN_REQUESTS_FOR_DECISION = 10;

// Module-scoped map of session id -> recent request timestamps (ms).
// Reset on cold start; that's fine — scraper detection only needs a
// few minutes of history, and a fresh instance will re-accumulate.
const sessionHistory = new Map();

/**
 * Record a request and return a decision for this session.
 *
 * @param {string} sessionKey - session id, user id, or any stable id.
 * @param {object} [opts]
 * @param {boolean} [opts.enforce=false] - if false, always returns 'ok' but logs.
 * @returns {{ level: 'ok'|'suspicious'|'blocked', samples: number, medianIntervalMs: number|null }}
 */
export function check(sessionKey, opts = {}) {
  const enforce = !!opts.enforce;
  const now = Date.now();

  const history = sessionHistory.get(sessionKey) ?? [];
  history.push(now);
  // Trim to the most recent N entries so we can compute a rolling window.
  while (history.length > SESSION_HISTORY_LIMIT) history.shift();
  sessionHistory.set(sessionKey, history);

  if (history.length < MIN_REQUESTS_FOR_DECISION) {
    return { level: 'ok', samples: history.length, medianIntervalMs: null };
  }

  // Compute median inter-request interval.
  const intervals = [];
  for (let i = 1; i < history.length; i += 1) {
    intervals.push(history[i] - history[i - 1]);
  }
  intervals.sort((a, b) => a - b);
  const median = intervals[Math.floor(intervals.length / 2)] || 0;

  let level = 'ok';
  if (median < MIN_HUMAN_INTERVAL_MS) {
    level = 'blocked';
  } else if (median < MIN_HUMAN_INTERVAL_MS * 2) {
    level = 'suspicious';
  }

  // Shadow mode: always log, only enforce if the caller asked for it.
  logger.info(
    {
      sessionKey,
      samples: history.length,
      medianIntervalMs: median,
      computedLevel: level,
      enforce,
    },
    'scraper_signal',
  );

  if (!enforce) {
    return { level: 'ok', samples: history.length, medianIntervalMs: median };
  }
  return { level, samples: history.length, medianIntervalMs: median };
}

/**
 * Clear a session's history. Useful for tests and for manual unlocks
 * after a false-positive block.
 */
export function reset(sessionKey) {
  sessionHistory.delete(sessionKey);
}
