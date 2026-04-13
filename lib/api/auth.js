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

import { createClient, createServiceClient } from '../supabase/server';
import { ApiError } from './response';

async function getUserAndProfile() {
  const supabase = createClient();
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

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, role, subscription_exempt, ui_version')
    .eq('id', user.id)
    .maybeSingle();

  if (profileErr) {
    throw new ApiError('Failed to load profile', 500);
  }

  return { user, profile: profile ?? { id: user.id, role: 'practice' }, supabase };
}

export async function requireUser() {
  return getUserAndProfile();
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

  const service = createServiceClient();

  // Audit log. In Phase 1 this just writes to stderr; Phase 2 swaps it
  // for a structured log entry via lib/api/logger.js.
  // eslint-disable-next-line no-console
  console.info(
    JSON.stringify({
      event: 'service_role_bypass',
      reason,
      user_id: ctx.user.id,
      role: ctx.profile?.role ?? 'unknown',
    }),
  );

  return { ...ctx, service };
}
