/**
 * Convert raw correct count to SAT-style scaled score (200–800).
 *
 * This is a simplified linear approximation. The real SAT uses per-test
 * equating tables that also account for adaptive module difficulty. Replace
 * the body here with an official lookup table when available.
 */
export function toScaledScore(correct, total) {
  if (!total || total === 0) return 200;
  const raw = Math.max(0, Math.min(correct, total));
  return Math.min(800, Math.max(200, Math.round(200 + (raw / total) * 600)));
}
