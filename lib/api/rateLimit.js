// Rate limiting for content endpoints. See docs/architecture-plan.md §3.7.
//
// This module exposes a single `rateLimit(key, opts)` function that returns
// `{ ok: boolean, remaining: number, resetAt: number }`. Callers use it
// early in the request handler:
//
//   import { rateLimit } from '@/lib/api/rateLimit';
//   const rl = await rateLimit(`questions:${user.id}`, { limit: 60, windowMs: 60_000 });
//   if (!rl.ok) return fail('Rate limit exceeded', 429);
//
// Two backends are supported:
//
//  1) Upstash Redis via REST API (production). Set UPSTASH_REDIS_REST_URL
//     and UPSTASH_REDIS_REST_TOKEN. The free tier covers our first ~100k
//     users comfortably, and the REST interface works from Next.js edge
//     middleware and serverless functions alike.
//
//  2) An in-memory fallback (development and tests). Each function
//     instance keeps its own counters in a Map. Works for local dev and
//     unit tests; do not rely on it in a multi-instance deploy.
//
// DORMANT IN PHASE 1: no route currently calls this helper. Phase 2
// wires up the practice and question endpoints in the `app/next/*` tree.

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_LIMIT = 60;

// In-memory fallback. Keyed by rate-limit key; value is { count, resetAt }.
// Cleared when a window expires.
const memoryStore = new Map();

function memoryLimit(key, limit, windowMs) {
  const now = Date.now();
  const existing = memoryStore.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    memoryStore.set(key, { count: 1, resetAt });
    return { ok: true, remaining: limit - 1, resetAt };
  }
  if (existing.count >= limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }
  existing.count += 1;
  memoryStore.set(key, existing);
  return { ok: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

async function upstashLimit(key, limit, windowMs) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  // We use the INCR + EXPIRE pattern. A single round-trip pipeline sends
  // both commands. The first caller within a window triggers the
  // EXPIRE; subsequent callers just INCR.
  const bucketKey = `rl:${key}`;
  const body = [
    ['INCR', bucketKey],
    ['PEXPIRE', bucketKey, String(windowMs), 'NX'],
    ['PTTL', bucketKey],
  ];

  try {
    const res = await fetch(`${url}/pipeline`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    const json = await res.json();
    const count = Number(json?.[0]?.result ?? 0);
    const pttl = Number(json?.[2]?.result ?? windowMs);
    const resetAt = Date.now() + (pttl > 0 ? pttl : windowMs);
    if (count > limit) {
      return { ok: false, remaining: 0, resetAt };
    }
    return { ok: true, remaining: Math.max(0, limit - count), resetAt };
  } catch {
    return null;
  }
}

/**
 * Check-and-increment a rate limit bucket for `key`.
 *
 * @param {string} key - Opaque bucket identifier (e.g. `questions:${userId}`).
 * @param {object} [opts]
 * @param {number} [opts.limit=60] - Max requests per window.
 * @param {number} [opts.windowMs=60000] - Window length in ms.
 * @returns {Promise<{ok: boolean, remaining: number, resetAt: number}>}
 */
export async function rateLimit(key, opts = {}) {
  const limit = Number(opts.limit ?? DEFAULT_LIMIT);
  const windowMs = Number(opts.windowMs ?? DEFAULT_WINDOW_MS);

  // Prefer Upstash when configured; fall back to in-memory.
  const upstash = await upstashLimit(key, limit, windowMs);
  if (upstash) return upstash;
  return memoryLimit(key, limit, windowMs);
}
