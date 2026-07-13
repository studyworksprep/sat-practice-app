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

import { cache } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient, createServiceClient } from '../supabase/server';
import type { TypedSupabaseClient } from '../supabase/server';
import type { UserRole } from '@/lib/types/api';
import { ApiError } from './response';
import { logger } from './logger';

/** The profile shape every server entry point sees. `role` is cast to
 *  the UserRole union exactly once, here at the seam — the DB CHECK
 *  constraint on profiles.role guarantees the value set. */
export interface AuthProfile {
  id: string;
  role: UserRole;
  subscription_exempt: boolean | null;
  first_name: string | null;
  is_demo: boolean;
}

export interface AuthContext {
  user: User;
  profile: AuthProfile;
  supabase: TypedSupabaseClient;
}

export interface ServiceRoleContext extends AuthContext {
  service: TypedSupabaseClient;
}

// Wrapped in React.cache so layout + page in the same request share
// one fetch. Before this, /dashboard cost 4 DB round-trips on every
// nav (layout: auth + profile + first_name; page: auth + profile);
// now it's 2. The cache scope is per-request, so no cross-user leak.
const getUserAndProfile = cache(async (): Promise<AuthContext> => {
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
    .select('id, role, subscription_exempt, first_name')
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
      ? {
          id: profile.id,
          role: (profile.role ?? 'practice') as UserRole,
          subscription_exempt: profile.subscription_exempt ?? null,
          first_name: profile.first_name ?? null,
          is_demo: isDemo,
        }
      : {
          id: user.id,
          role: 'practice',
          subscription_exempt: null,
          first_name: null,
          is_demo: isDemo,
        },
    supabase,
  };
});

export async function requireUser(): Promise<AuthContext> {
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
 */
export async function requireWriter(): Promise<AuthContext> {
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
export function assertWriter(
  ctx: { profile?: { is_demo?: boolean } | null } | null | undefined,
): void {
  if (ctx?.profile?.is_demo) {
    throw new ApiError('Demo accounts are read-only', 403);
  }
}

/**
 * Throw unless the authenticated user has one of the allowed roles.
 * e.g. requireRole(['admin']) or requireRole(['teacher', 'admin'])
 */
export async function requireRole(
  allowedRoles: readonly string[],
): Promise<AuthContext> {
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
 * Throw unless the authenticated user holds at least `minPlan`
 * (preview < standard < full). This is the LICENSING gate — the
 * companion to requireRole's authorization gate (§1.5). It resolves via
 * the SQL has_plan()/effective_plan() resolver, which today reproduces
 * the legacy role+exempt+subscription access exactly (parity-verified),
 * with sponsored access derived live from the roster edge. Throws 402
 * when the plan is insufficient.
 *
 * The live enforcement path (proxy.js) is not yet switched onto this
 * resolver — that's gated behind the `entitlements_gate` feature flag.
 * Use requirePlan on NEW tier-gated surfaces (plan engine, SRS).
 */
export async function requirePlan(
  minPlan: 'preview' | 'standard' | 'full',
): Promise<AuthContext> {
  const ctx = await getUserAndProfile();
  const { data, error } = await ctx.supabase.rpc('has_plan', {
    p_user: ctx.user.id,
    p_min_plan: minPlan,
  });
  if (error) {
    throw new ApiError('Failed to resolve entitlement', 500);
  }
  if (!data) {
    throw new ApiError('This feature requires an upgraded plan', 402);
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
 */
export async function requireServiceRole(
  reason: string,
  options: { allowedRoles?: readonly string[] } = {},
): Promise<ServiceRoleContext> {
  if (!reason || typeof reason !== 'string') {
    throw new ApiError('requireServiceRole called without a reason', 500);
  }

  let ctx: AuthContext;
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
