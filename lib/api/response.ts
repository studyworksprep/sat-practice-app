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
// A throwing helper is also exported so that `requireUser()` and friends
// in lib/api/auth.js can signal authentication failures with a throw that
// the route wrapper or Server Action wrapper converts into a `fail()` /
// `actionFail()`.

import { NextResponse } from 'next/server';
import type { Ok, Fail } from '@/lib/types';

// ---- Route-handler helpers ----

export function ok<T>(data: T, init: ResponseInit = {}): NextResponse {
  return NextResponse.json({ ok: true, data }, init);
}

export function fail(
  error: string | Error,
  status: number = 400,
  extra: Record<string, unknown> = {},
): NextResponse {
  const body: Record<string, unknown> = {
    ok: false,
    error: typeof error === 'string' ? error : String(error),
  };
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
 *
 * Two call shapes:
 *   actionOk()              → { ok: true, data: null }
 *   actionOk({ tag })       → { ok: true, data: { tag } }
 *
 * The literal `ok: true` lets callers narrow on `res.ok` and pull
 * payload fields out of `res.data` with full type safety.
 */
export function actionOk(): Ok<{ data: null }>;
export function actionOk<T>(data: T): Ok<{ data: T }>;
export function actionOk<T>(data: T | null = null): Ok<{ data: T | null }> {
  return { ok: true, data } as Ok<{ data: T | null }>;
}

/**
 * Failure return for a Server Action. Same shape as actionOk but with
 * an error message. Does NOT throw — the caller (a form with
 * useActionState) expects a return value that it can inspect for the
 * pending/error transition. Extra fields (e.g. field-specific
 * validation errors) are merged onto the result.
 */
export function actionFail(
  error: string | Error | null | undefined,
  extra: Record<string, unknown> = {},
): Fail {
  const message =
    typeof error === 'string'
      ? error
      : String(
          (error as { message?: unknown } | null | undefined)?.message ?? error,
        );
  const safeExtra =
    extra && typeof extra === 'object' ? extra : {};
  return { ok: false, error: message, ...safeExtra } as Fail;
}

// ---- Shared error class ----

// Thrown by the auth helpers (lib/api/auth.js). Callable from both
// route handlers (where .toResponse() returns a NextResponse) and
// Server Actions (where .toActionResult() returns the plain-object
// shape). Route/action wrappers catch it and call the appropriate
// converter based on context.
export class ApiError extends Error {
  status: number;
  extra: Record<string, unknown>;

  constructor(message: string, status: number = 400, extra: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.extra = extra;
  }

  toResponse(): NextResponse {
    return fail(this.message, this.status, this.extra);
  }

  /**
   * Pre-envelope error response for routes that haven't migrated to
   * the `{ ok, data | error }` shape yet. Returns a NextResponse with
   * `{ error: message }` and the right status, matching what the
   * legacy inline `if (...) return NextResponse.json({ error }, ...)`
   * checks were producing. Transitional — once consumers move to the
   * new envelope, callers swap `.toLegacyResponse()` for
   * `.toResponse()`.
   */
  toLegacyResponse(): NextResponse {
    return NextResponse.json({ error: this.message }, { status: this.status });
  }

  toActionResult(): Fail {
    return actionFail(this.message, this.extra);
  }
}

// ──────────────────────────────────────────────────────────────
// Route-handler wrapper. See lib/api/auth.js for context — auth
// helpers throw ApiError instead of returning a response, so the
// caller has to convert. Wrapping the handler is shorter and more
// uniform than try/catch at every call site.
//
// Two flavors so the auth-migration doesn't double as a response-
// envelope migration:
//
//   apiRoute(handler)
//     - ApiError → fail() shape: `{ ok: false, error }`
//     - For routes whose consumers have moved to `{ ok, data | error }`.
//
//   legacyApiRoute(handler)
//     - ApiError → bare `{ error }` shape
//     - For routes whose consumers still inspect `json.error` on a
//       non-2xx and would break if we suddenly returned `json.ok`.
//
// Pick the legacy wrapper when porting an existing route off its
// inline role check; pick `apiRoute` for any new route written from
// scratch.
// ──────────────────────────────────────────────────────────────

type RouteHandler<Args extends unknown[]> = (
  ...args: Args
) => Promise<NextResponse> | NextResponse;

export function apiRoute<Args extends unknown[]>(
  handler: RouteHandler<Args>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ApiError) return e.toResponse();
      throw e;
    }
  };
}

export function legacyApiRoute<Args extends unknown[]>(
  handler: RouteHandler<Args>,
): (...args: Args) => Promise<NextResponse> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (e) {
      if (e instanceof ApiError) return e.toLegacyResponse();
      throw e;
    }
  };
}
