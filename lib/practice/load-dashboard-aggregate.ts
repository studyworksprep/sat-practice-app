// Cached fetch for the student dashboard's stat tiles + per-domain
// performance grid. Replaces the previous shape — four count('exact')
// scans on attempts + a 5,000-row pull + chunked v1→v2 / questions_v2
// metadata lookups — with a single RPC call wrapped in unstable_cache.
//
// Cost shape:
//   - Cache hit: 0 DB round-trips, returns instantly.
//   - Cache miss: 1 RPC call (the aggregation runs server-side via
//     get_student_dashboard_stats — see migration 000036).
//
// Cache key includes the user id so different users get distinct
// entries. TTL is 60s; the dashboard isn't sub-second-fresh anywhere
// today, and the answer-submit action calls revalidateTag on this
// user's tag so a fresh answer flushes the cache for the next visit.
//
// Per-call wrapper: unstable_cache options can't include dynamic
// tags as a function, so we recreate the wrapper per call. Next.js
// dedupes by the keyParts so the underlying cache works.

import { unstable_cache } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { domainSection } from '@/lib/ui/question-layout';

const TTL_SECONDS = 60;
const PERFORMANCE_LOOKBACK_DAYS = 90;

export interface DashboardAggregate {
  totalAttempts: number;
  correctAttempts: number;
  weekAttempts: number;
  performance: {
    math: SectionPerformance;
    rw:   SectionPerformance;
  };
}

interface SectionPerformance {
  domains: Array<{
    name: string;
    code: string | null;
    section: 'math' | 'rw';
    correct: number;
    total: number;
  }>;
  correct: number;
  total: number;
  pct: number | null;
}

interface RpcRow {
  total_attempts: number | string;
  correct_attempts: number | string;
  week_attempts: number | string;
  per_domain: Array<{
    domain_code: string | null;
    domain_name: string;
    correct: number | string;
    total: number | string;
  }> | null;
}

export function dashboardCacheTag(userId: string): string {
  return `dashboard:${userId}`;
}

/** Load the cached dashboard aggregate for the given user. The
 *  caller should already have `requireUser()` to confirm the
 *  session — the userId here is treated as authenticated. RLS on
 *  attempts / questions_v2 still applies inside the RPC because
 *  the function is SECURITY INVOKER, so a forged userId can't
 *  exfiltrate another user's data either way. */
export async function loadDashboardAggregate(userId: string): Promise<DashboardAggregate> {
  // Create the cookies-bound supabase client OUTSIDE unstable_cache.
  // Next.js 15 throws if cookies() is called inside a cache scope;
  // the captured client carries the cookie jar without re-invoking
  // cookies() during the cached fetch.
  const supabase = await createClient();

  return unstable_cache(
    async () => {
      const nowMs = Date.now();
      const sevenDaysAgo  = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
      const lookbackStart = new Date(
        nowMs - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
      ).toISOString();

      const { data, error } = await supabase.rpc('get_student_dashboard_stats', {
        p_user_id:        userId,
        p_week_ago:       sevenDaysAgo,
        p_lookback_start: lookbackStart,
      });
      if (error) throw error;

      const row: RpcRow | undefined = (data as RpcRow[] | null | undefined)?.[0];

      const totalAttempts   = Number(row?.total_attempts   ?? 0);
      const correctAttempts = Number(row?.correct_attempts ?? 0);
      const weekAttempts    = Number(row?.week_attempts    ?? 0);

      const perDomain = Array.isArray(row?.per_domain) ? row!.per_domain : [];
      const domains = perDomain
        .filter((d) => d?.domain_name)
        .map((d) => ({
          name:    d.domain_name,
          code:    d.domain_code ?? null,
          section: domainSection(d.domain_code) as 'math' | 'rw',
          correct: Number(d.correct ?? 0),
          total:   Number(d.total   ?? 0),
        }))
        .sort((a, b) => b.total - a.total);

      const math = domains.filter((d) => d.section === 'math');
      const rw   = domains.filter((d) => d.section === 'rw');

      return {
        totalAttempts,
        correctAttempts,
        weekAttempts,
        performance: {
          math: { domains: math, ...sectionTotals(math) },
          rw:   { domains: rw,   ...sectionTotals(rw)   },
        },
      };
    },
    ['student-dashboard-aggregate', userId],
    { revalidate: TTL_SECONDS, tags: [dashboardCacheTag(userId)] },
  )();
}

function sectionTotals(domains: Array<{ correct: number; total: number }>) {
  let correct = 0;
  let total = 0;
  for (const d of domains) {
    correct += d.correct;
    total   += d.total;
  }
  return {
    correct,
    total,
    pct: total > 0 ? Math.round((correct / total) * 100) : null,
  };
}
