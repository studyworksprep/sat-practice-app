/**
 * Date/time and number formatting utilities for the SAT practice app.
 */

/**
 * Format an ISO date string as "Jan 5" or "Jan 5, 2025" (shows year if not current year).
 */
export function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== now.getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

/**
 * Format an ISO date string as just month + day ("Jan 5"), no year.
 * Used for tight rows like "Due Apr 21" where the year is either
 * implied or supplied elsewhere.
 */
export function formatShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Format an ISO date string as "Jan 5, 2:30 PM".
 */
export function formatDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return (
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ', ' +
    d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  );
}

/**
 * Format a duration in milliseconds as a human-readable string.
 * Examples: "2m 30s", "1h 5m", "45s", "< 1s"
 */
export function formatDuration(ms) {
  if (!ms || ms < 0) return '< 1s';

  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
  }
  return seconds > 0 ? `${seconds}s` : '< 1s';
}

/**
 * Format a duration in seconds for a timer display (MM:SS or H:MM:SS).
 */
export function formatTimerDisplay(totalSeconds) {
  if (totalSeconds < 0) totalSeconds = 0;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const pad = (n) => String(n).padStart(2, '0');

  if (hours > 0) {
    return `${hours}:${pad(minutes)}:${pad(seconds)}`;
  }
  return `${pad(minutes)}:${pad(seconds)}`;
}

/**
 * Format a number as a percentage string.
 * @param {number} numerator
 * @param {number} denominator
 * @param {number} [decimals=0] - Number of decimal places
 * @returns {string|null} e.g. "75%" or null if denominator is 0
 */
export function formatPercent(numerator, denominator, decimals = 0) {
  if (!denominator) return null;
  return (numerator / denominator * 100).toFixed(decimals) + '%';
}

/**
 * Get a relative time string like "2 minutes ago", "3 hours ago", "yesterday".
 */
export function timeAgo(iso) {
  if (!iso) return '';
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;

  if (diffMs < 0) return 'just now';

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes === 1) return '1 minute ago';
  if (minutes < 60) return `${minutes} minutes ago`;
  if (hours === 1) return '1 hour ago';
  if (hours < 24) return `${hours} hours ago`;
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;

  return formatDate(iso);
}

/**
 * Compact relative-time string: "Just now", "5m ago", "3h ago",
 * "2d ago", then falls back to a locale date. Intended for tight
 * rows (dashboard cards, activity lists) where the verbose
 * timeAgo() ("5 minutes ago") is too long. Returns null on missing
 * or invalid input so the caller can show a placeholder.
 */
export function formatRelativeShort(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

/**
 * Format an SAT score with section label.
 * @param {number} score - The scaled score (200-800)
 * @param {string} [section] - "rw" or "math"
 */
export function formatScore(score, section) {
  if (score == null) return '—';
  const label = section === 'rw' || section === 'RW' ? 'R&W' : section === 'math' || section === 'M' ? 'Math' : '';
  return label ? `${score} ${label}` : String(score);
}
