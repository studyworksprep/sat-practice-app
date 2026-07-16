// Server-side feature-flag reads. First runtime consumer of the
// feature_flags table since the Stage C decommission retired the
// per-user UI-version switch — the table was deliberately kept as
// infrastructure for staged rollouts like this one (CLAUDE.md).
//
// RLS: feature_flags is SELECT-able by any authenticated user
// (ff_select, 20240101000002), so these reads run on the caller's
// RLS-scoped client — no service role.
//
// Split from lib/flags.ts so the pure stage-resolution policy stays
// unit-testable without dragging in next/headers.

import { cache } from 'react';
import { createClient } from './supabase/server';
import { resolveSidebarStage } from './flags';

/** Read one flag row's value. Wrapped in React.cache so layout +
 *  page in the same request share a single read. Any failure —
 *  missing row, RLS surprise, network — resolves to null so callers
 *  fall back to pre-flag behavior instead of erroring the page. */
export const getFlag = cache(async (key: string): Promise<string | null> => {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from('feature_flags')
      .select('value')
      .eq('key', key)
      .maybeSingle();
    return data?.value ?? null;
  } catch {
    return null;
  }
});

/** Should this role see the Phase 6.1 sidebar shell? */
export async function sidebarEnabledFor(role: string): Promise<boolean> {
  return resolveSidebarStage(await getFlag('sidebar_shell'), role);
}
