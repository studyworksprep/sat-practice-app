// Student-dashboard data load: stat tiles + per-domain performance
// grid. One RPC (get_student_dashboard_stats — see migration
// 000036) does the aggregation server-side.
//
// We previously wrapped this in next/cache's unstable_cache with a
// 60-second TTL keyed on userId. That turned out to be unsafe: in
// some Next 16 invocation paths (background revalidation,
// prefetch, etc.) the closure runs after the originating request
// scope has been torn down. The supabase client captured outside
// the cache still holds a reference to a `cookieStore` from
// `await cookies()`, but that object is request-scoped — the next
// call returns no cookies, Supabase sends the RPC without an auth
// header, RLS / SECURITY INVOKER on the function denies, and the
// empty result gets stored as the next-60s cached value.
//
// We saw the same shape blow up the tutor dashboard
// (lib/practice/load-tutor-dashboard.ts) — students returning from
// any deep link would land on an empty stats grid. Pre-emptively
// applying the same fix here. The dashboard isn't sub-second-fresh
// anywhere today, and the RPC runs server-side, so paying for it
// per-render is comparable to or cheaper than the prior cache-miss
// path used to be.
//
// See docs/architecture-plan.md §3.6.

import { createClient } from '@/lib/supabase/server';
import { domainSection } from '@/lib/ui/question-layout';

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
    mastery: number | null;
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
    // Mastery comes from the RPC (migration
    // 20260505000000_dashboard_stats_with_mastery): difficulty- +
    // band-weighted accuracy × volume curve × recency bonus,
    // capped at 100. Null is possible if the database is older
    // than the migration; tolerate that until the migration has
    // run everywhere.
    mastery?: number | string | null;
  }> | null;
}

/** Load the dashboard aggregate for the given user. The caller
 *  should already have `requireUser()` to confirm the session — the
 *  userId here is treated as authenticated. RLS on attempts /
 *  questions_v2 still applies inside the RPC because the function
 *  is SECURITY INVOKER, so a forged userId can't exfiltrate another
 *  user's data either way. */
export async function loadDashboardAggregate(userId: string): Promise<DashboardAggregate> {
  const supabase = await createClient();

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
      mastery: d.mastery == null ? null : Number(d.mastery),
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
