// Format milliseconds as a short duration string. "23s" or "1m"
// or "2m 15s". Returns "—" when the input is null/undefined and
// "<1s" when it's < 1000ms but truthy, so the caller doesn't have
// to care about edge cases.
//
// Used by every report-style review surface (TestResultsInteractive,
// AssignmentReport, …) so the format reads consistently.
export function formatDuration(ms) {
  if (ms == null) return '—';
  if (ms === 0) return '';
  if (ms < 1000) return '<1s';
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const rem = sec % 60;
  return rem > 0 ? `${m}m ${rem}s` : `${m}m`;
}
