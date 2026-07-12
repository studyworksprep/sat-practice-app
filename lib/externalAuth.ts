import { createHash, timingSafeEqual } from 'node:crypto';
import { rateLimit } from '@/lib/api/rateLimit';

/**
 * Validate an external API key from the x-api-key header.
 * Used for service-to-service calls (e.g. Lessonworks → Studyworks).
 *
 * Comparison is constant-time (timingSafeEqual over fixed-length
 * digests) so the key can't be recovered byte-by-byte through a
 * timing side-channel — these endpoints sit in front of RLS-bypassing
 * service-role reads, so the bar is higher than for an ordinary
 * shared secret.
 */
export function validateExternalApiKey(request: Request): boolean {
  const key = request.headers.get('x-api-key');
  const expected = process.env.EXTERNAL_API_KEY;
  if (!key || !expected) return false;
  // Compare equal-length buffers: hashing both sides to a fixed
  // width sidesteps timingSafeEqual's equal-length requirement
  // without leaking the expected key's length.
  const a = createHash('sha256').update(key).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

/**
 * Shared guard for the external/public HTTP surface: constant-time
 * key check + a per-caller rate limit so a leaked or brute-forced
 * key can't be used for high-volume scraping, and key-guessing
 * traffic is throttled. Returns `{ ok: true }` or
 * `{ ok: false, status, error }` for the route to return verbatim.
 *
 * The bucket key includes the caller IP so one misbehaving consumer
 * can't starve the others once per-consumer keys exist.
 */
export type ExternalApiAccess =
  | { ok: true }
  | { ok: false; status: number; error: string };

export async function requireExternalApiAccess(
  request: Request,
  {
    scope,
    limit = 60,
    windowMs = 60_000,
  }: { scope?: string; limit?: number; windowMs?: number } = {},
): Promise<ExternalApiAccess> {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const rl = await rateLimit(`external:${scope ?? 'default'}:${ip}`, {
    limit,
    windowMs,
  });
  if (!rl.ok) {
    return { ok: false, status: 429, error: 'Rate limit exceeded' };
  }
  if (!validateExternalApiKey(request)) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }
  return { ok: true };
}
