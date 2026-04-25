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

/** Successful action / route response — payload is spread alongside ok. */
export type Ok<T extends Record<string, unknown> = Record<string, never>> =
  { ok: true } & T;

/** Failed response — message + optional extras the caller can attach. */
export type Fail<E extends Record<string, unknown> = Record<string, never>> =
  { ok: false; error: string } & E;

/** Discriminated union returned by every action / route. */
export type ActionResult<T extends Record<string, unknown> = Record<string, never>> =
  Ok<T> | Fail;

export type ApiResult<T extends Record<string, unknown> = Record<string, never>> =
  Ok<T> | Fail;

// ──────────────────────────────────────────────────────────────
// Roles + auth context.
// ──────────────────────────────────────────────────────────────

export type UserRole = 'practice' | 'student' | 'teacher' | 'manager' | 'admin';

/** Shape returned by lib/api/auth.js requireUser(). Mirrors the
 *  current implementation's actual return so .ts callers don't
 *  have to re-derive it. Once auth.js itself migrates to .ts,
 *  this type definition moves alongside it. */
export interface AuthContext {
  user: {
    id: string;
    email?: string | null;
    [key: string]: unknown;
  };
  profile: {
    id: string;
    role: UserRole;
    subscription_exempt?: boolean | null;
    ui_version?: 'legacy' | 'next' | null;
    [key: string]: unknown;
  };
  /** Supabase server client — typed loosely here until lib/supabase
   *  helpers migrate. Use the client's own .from('table') chain for
   *  per-query typing in the meantime. */
  supabase: unknown;
}
