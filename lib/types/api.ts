// Canonical API + Server-Action response envelopes.
//
// Every Server Action in the new tree returns ActionResult<T>;
// every route handler returns ApiResult<T>. The two shapes share
// the same { ok, ...payload } discriminant so client code can
// branch on `res.ok` and TypeScript narrows the type automatically:
//
//   const res = await submitAnswerAction(null, fd);
//   if (!res.ok) {
//     console.error(res.error);
//   } else {
//     console.log(res.isCorrect);  // narrowed; safe to access
//   }
//
// Helpers in lib/api/response.js return values that conform to
// these shapes; we'll re-type those helpers as the lib/ tree
// migrates from .js to .ts.

// The default `Record<string, unknown>` (rather than the stricter
// `Record<string, never>`) is intentional: actionOk() with no payload
// still emits `data: null` at runtime, and several actions use the
// nested-data pattern (`actionOk({ tag })` → `{ ok: true, data: { tag } }`),
// so callers that write `Promise<ActionResult>` need the loose default
// to accept that runtime shape. Specific payloads still get tight
// types — e.g. `ActionResult<{ isCorrect: boolean }>` narrows
// `res.isCorrect` to `boolean` in the success branch.

/** Successful action / route response — payload is spread alongside ok. */
export type Ok<T extends Record<string, unknown> = Record<string, unknown>> =
  { ok: true } & T;

/** Failed response — message + optional extras the caller can attach. */
export type Fail<E extends Record<string, unknown> = Record<string, unknown>> =
  { ok: false; error: string } & E;

/** Discriminated union returned by every action / route. */
export type ActionResult<T extends Record<string, unknown> = Record<string, unknown>> =
  Ok<T> | Fail;

export type ApiResult<T extends Record<string, unknown> = Record<string, unknown>> =
  Ok<T> | Fail;

// ──────────────────────────────────────────────────────────────
// Roles + auth context.
// ──────────────────────────────────────────────────────────────

export type UserRole = 'practice' | 'student' | 'teacher' | 'manager' | 'admin';

/** The real AuthContext now lives beside its implementation in
 *  lib/api/auth.ts (typed user, profile, and Database-generic
 *  Supabase client). Re-exported here so existing
 *  `import type { AuthContext } from '@/lib/types'` callers keep
 *  working. */
export type { AuthContext, AuthProfile } from '@/lib/api/auth';
