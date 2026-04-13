// Standard response envelope for API routes. See docs/architecture-plan.md §3.3.
//
// The goal is that every API route returns `{ ok: true, data }` on success
// and `{ ok: false, error }` on failure, so the 79 client fetch sites can
// branch on `json.ok` instead of each one re-inventing error parsing.
//
// Usage from a route handler:
//
//   import { ok, fail } from '@/lib/api/response';
//   return ok({ items, total });
//   return fail('Not authorized', 403);
//
// A throwing helper is also exported so that `requireUser()` and friends
// in lib/api/auth.js can signal authentication failures with a throw that
// the route wrapper (to be added in Phase 2) converts into a `fail()`.

import { NextResponse } from 'next/server';

export function ok(data, init = {}) {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(error, status = 400, extra = {}) {
  const body = { ok: false, error: typeof error === 'string' ? error : String(error) };
  if (extra && typeof extra === 'object') {
    Object.assign(body, extra);
  }
  return NextResponse.json(body, { status });
}

// Thrown by the auth helpers; caught by the route wrapper in Phase 2.
export class ApiError extends Error {
  constructor(message, status = 400, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.extra = extra;
  }

  toResponse() {
    return fail(this.message, this.status, this.extra);
  }
}
