// Midnight November 8, 2026 in America/New_York (EST).
export const SIGNUP_PRICE_CUTOFF = '2026-11-08T05:00:00.000Z';
export function usesNewSignupPrice(createdAt) {
  const signup = Date.parse(createdAt);
  if (!Number.isFinite(signup)) throw new Error('Missing valid account signup date');
  return signup >= Date.parse(SIGNUP_PRICE_CUTOFF);
}
