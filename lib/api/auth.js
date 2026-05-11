// Single auth code path for every API route. See docs/architecture-plan.md §3.3.
//
// Before this module existed, ~100 API routes each did their own combination
// of `supabase.auth.getUser()`, inline `profile.role !== 'admin'` gates, and
// ad-hoc `createServiceClient()` calls. The audit found five distinct
// patterns; this module collapses them to three helpers:
//
//   requireUser()
//     - Returns { user, profile, supabase } or throws 401.
//     - Use for any route that requires a logged-in user but doesn't care
//       about role. Profile is fetched once and attached.
//
//   requireRole(['admin', 'teacher'])
//     - Returns { user, profile, supabase } or throws 401/403.
//     - Use for any route with a role gate. The inline `if (profile.role
//       !== 'admin') return 403` pattern goes away — there is one place to
//       check, one place to fix.
//
//   requireServiceRole('reason for bypass')
//     - Returns { user, profile, service } where `service` is the RLS-
//       bypassing client. `user`/`profile` are still the caller's identity
//       (so the route can still enforce app-layer rules). The `reason` is
//       logged for the service-role audit.
//     - Use sparingly. Every call site is auditable via grep.
//
// This module is dormant until Phase 2 refactors each route tree onto it.
// The shape of the return value is stable from day one so migrations can
// happen incrementally without breaking callers.

import { cache } from 'react';
import { createClient, createServiceClient } from '../supabase/server';
import { ApiError } from './response';
import { logger } from './logger';

// Wrapped in React.cache so layout + page in the same request share
// one fetch. Before this, /dashboard cost 4 DB round-trips on every
// nav (layout: auth + profile + first_name; page: auth + profile);
// now it's 2. The cache scope is per-request, so no cross-user leak.
const getUserAndProfile = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr) {
    throw new ApiError('Authentication failed', 401);
  }
  if (!user) {
    throw new ApiError('Not authenticated', 401);
  }

  // first_name is folded in here so the student / tutor layouts can
  // read it from the cached profile instead of issuing a second
  // profiles query for the nav greeting. Cheap to add to the same
  // row read; saves a round-trip on every page load.
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, role, subscription_exempt, ui_version, first_name')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    throw new ApiError('Failed to load profile', 500);
  }

  // is_demo gates writes for the marketing demo accounts. The DB is
  // the authoritative layer (restrictive policies deny INSERT/UPDATE/
  // DELETE for is_demo JWTs); this field is surfaced on the profile
  // so server routes can fail fast with a clear 403 via
  // requireWriter() instead of forwarding the request and surfacing
  // a Postgres RLS error.
  //
  // Read from the JWT app_metadata, not the profiles row. The
  // create-demo-accounts migration adds the column and mirrors it
  // into the JWT via the sync trigger, but reading from JWT means
  // this code path keeps working in environments where the demo
  // foundation migration hasn't shipped yet (the column simply
  // doesn't exist there, and a SELECT including it would 500
  // every page that calls requireUser).
  const isDemo = user.app_metadata?.is_demo === true;

  return {
    user,
    profile: profile
      ? { ...profile, is_demo: isDemo }
      : { id: user.id, role: 'practice', is_demo: isDemo, first_name: null },
    supabase,
  };
});

export async function requireUser() {
  return getUserAndProfile();
}

/**
 * Throw unless the authenticated user is permitted to mutate state.
 *
 * Marketing demo accounts (profiles.is_demo = true) read every page
 * but must never write. The DB enforces this via restrictive RLS
 * policies; this helper fails the request earlier with a clear 403
 * so mutation routes don't have to handle Postgres RLS errors
 * downstream.
 *
 * Pair with requireRole when both gates apply:
 *
 *   const ctx = await requireRole(['teacher', 'manager', 'admin']);
 *   await assertWriter(ctx);   // or just call requireWriter() solo
 *
 * @returns {Promise<{user, profile, supabase}>}
 */
export async function requireWriter() {
  const ctx = await getUserAndProfile();
  if (ctx.profile?.is_demo) {
    throw new ApiError('Demo accounts are read-only', 403);
  }
  return ctx;
}

/**
 * Same gate as requireWriter, but operating on an already-fetched
 * context (returned from requireRole / requireUser). Useful when
 * the route needs the role check first and the writer check second.
 */
export function assertWriter(ctx) {
  if (ctx?.profile?.is_demo) {
    throw new ApiError('Demo accounts are read-only', 403);
  }
}

/**
 * Throw unless the authenticated user has one of the allowed roles.
 * @param {string[]} allowedRoles - e.g. ['admin'] or ['teacher', 'admin']
 * @returns {Promise<{user, profile, supabase}>}
 */
export async function requireRole(allowedRoles) {
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new ApiError('requireRole called without roles', 500);
  }
  const ctx = await getUserAndProfile();
  const role = ctx.profile?.role ?? 'practice';
  if (!allowedRoles.includes(role)) {
    throw new ApiError('Forbidden', 403);
  }
  return ctx;
}

/**
 * Return a service-role Supabase client for routes that genuinely need
 * to bypass RLS. The `reason` argument is mandatory and is logged on
 * every call so it can be audited. The caller is still authenticated
 * via the RLS-scoped client.
 *
 * Use cases (valid): admin analytics that aggregate across all users,
 * webhook handlers that run as the system, internal cleanup jobs.
 *
 * Not valid: "I forgot to write RLS for this table", "this is easier
 * than writing a policy". If in doubt, write the policy.
 *
 * @param {string} reason - Required. Audit-log message.
 * @param {object} [options]
 * @param {string[]} [options.allowedRoles] - If provided, also gate the caller.
 * @returns {Promise<{user, profile, supabase, service}>}
 */
export async function requireServiceRole(reason, options = {}) {
  if (!reason || typeof reason !== 'string') {
    throw new ApiError('requireServiceRole called without a reason', 500);
  }

  let ctx;
  if (options.allowedRoles) {
    ctx = await requireRole(options.allowedRoles);
  } else {
    ctx = await getUserAndProfile();
  }

  // Demo accounts must never reach service-role code, which bypasses
  // RLS entirely. The DB-layer lockdown can't help here, so we gate
  // at the helper. If a future workflow legitimately needs a demo
  // user to drive a service-role action (none today), introduce an
  // allowlist on the reason argument rather than weakening this.
  if (ctx.profile?.is_demo) {
    throw new ApiError('Demo accounts are read-only', 403);
  }

  const service = createServiceClient();

  // Structured audit log of every RLS bypass. The `reason` string is
  // the historical free-text descriptor; `caller_role` and `user_id`
  // are first-class fields so log explorers can group and search.
  logger.info(
    {
      event: 'service_role_bypass',
      reason,
      user_id: ctx.user.id,
      caller_role: ctx.profile?.role ?? 'unknown',
    },
    'service_role_bypass',
  );

  return { ...ctx, service };
}
