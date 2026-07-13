// <Gated> — render children only if the current user holds at least
// `minPlan` (preview < standard < full). The UI companion to
// requirePlan() (lib/api/auth.ts) for tier-gating surfaces (§1.5).
//
// Server Component: it resolves the plan via the SQL has_plan() resolver
// on the server, so plan state never round-trips to the client and the
// gated markup isn't shipped to users who can't see it. Falls back to
// `fallback` (default: nothing) when the user is signed out or under-tier.
//
// Use on NEW tier-gated features (plan engine, SRS). The legacy binary
// access gate (proxy.js) is unchanged until the `entitlements_gate`
// feature flag is flipped.

import type { ReactNode } from 'react';
import { createClient } from '@/lib/supabase/server';

export async function Gated({
  minPlan,
  children,
  fallback = null,
}: {
  minPlan: 'preview' | 'standard' | 'full';
  children: ReactNode;
  fallback?: ReactNode;
}): Promise<ReactNode> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fallback;

  const { data, error } = await supabase.rpc('has_plan', {
    p_user: user.id,
    p_min_plan: minPlan,
  });
  if (error || !data) return fallback;
  return children;
}
