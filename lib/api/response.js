// Standard response envelope for API routes AND Server Actions.
// See docs/architecture-plan.md §3.3 and §3.9.
//
// Two shapes are exported:
//
//   ok(data) / fail(error, status)
//     - For route handlers (app/api/**). Returns NextResponse objects.
//     - Every API route returns `{ ok: true, data }` on success and
//       `{ ok: false, error }` on failure, so the client fetch sites can
//       branch on `json.ok` instead of re-inventing error parsing.
//
//   actionOk(data) / actionFail(error)
//     - For Server Actions ('use server' functions called from forms or
//       client components). Returns plain objects, not NextResponse —
//       React's Action machinery (useActionState, <form action>) consumes
//       the return value directly and doesn't go through an HTTP layer.
//     - Same { ok, data } / { ok, error } shape so the same client-side
//       branching logic works uniformly.
//
// Usage from a route handler:
//
//   import { ok, fail } from '@/lib/api/response';
//   return ok({ items, total });
//   return fail('Not authorized', 403);
//
// Usage from a Server Action:
//
//   'use server';
//   import { actionOk, actionFail } from '@/lib/api/response';
//   export async function updateProfile(prevState, formData) {
//     const name = formData.get('name');
//     if (!name) return actionFail('Name is required');
//     // ... do the mutation
//     return actionOk({ name });
//   }
//
// A throwing helper is also exported so that `requireUser()` and friends
// in lib/api/auth.js can signal authentication failures with a throw that
// the route wrapper (Phase 2) or Server Action wrapper converts into a
// `fail()` / `actionFail()`.

import { NextResponse } from 'next/server';

// ---- Route-handler helpers ----

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

// ---- Server Action helpers ----

/**
 * Success return for a Server Action. Returns a plain object (not a
 * NextResponse) because Server Actions bypass the HTTP layer — the
 * return value is consumed directly by the client via useActionState.
 */
export function actionOk(data = null) {
  return { ok: true, data };
}

/**
 * Failure return for a Server Action. Same shape as actionOk but with
 * an error message. Does NOT throw — the caller (a form with
 * useActionState) expects a return value that it can inspect for the
 * pending/error transition.
 *
 * @param {string|Error} error - message or Error instance
 * @param {object} [extra] - merged into the returned object for
 *   field-specific validation errors, etc.
 */
export function actionFail(error, extra = {}) {
  const message = typeof error === 'string' ? error : String(error?.message ?? error);
  return { ok: false, error: message, ...(extra && typeof extra === 'object' ? extra : {}) };
}

// ---- Shared error class ----

// Thrown by the auth helpers (lib/api/auth.js). Callable from both
// route handlers (where .toResponse() returns a NextResponse) and
// Server Actions (where .toActionResult() returns the plain-object
// shape). Route/action wrappers catch it and call the appropriate
// converter based on context.
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

  toActionResult() {
    return actionFail(this.message, this.extra);
  }
}
