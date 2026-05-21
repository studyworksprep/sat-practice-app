// Student-dashboard ACT aggregate. Sibling to
// `load-dashboard-aggregate.ts` (the SAT loader) — same shape,
// branched join target. See docs/architecture-plan.md §3.4
// "Cross-test data model": forks live at the loader layer, the
// page renders both with the same component shape.
//
// Implementation choice (PR 4): in-loader JS aggregation rather
// than an RPC. Rationale —
//   - SAT runs through `get_student_dashboard_stats` (RPC) because
//     the attempts table is large and the per-domain rollup is hot
//     path. ACT data volume is small enough for an in-loader pass
//     to be cheaper than the round-trip cost of authoring + applying
//     a parallel RPC migration. PR 4 ships without an additional DB
//     migration for stats.
//   - When ACT volume catches up, the loader interface stays — only
//     the inside swaps to an RPC call.
//
// Returns the same DashboardAggregate shape as the SAT loader so
// the page can branch on test_type and render with the same
// SkillBreakdownCard / StatTile machinery.

import { createClient } from '@/lib/supabase/server';
import { sectionLabel, isActSection } from '@/lib/practice/act-taxonomy';
import type { ActSection } from '@/lib/practice/act-taxonomy';

const PERFORMANCE_LOOKBACK_DAYS = 90;

export interface ActDashboardAggregate {
  totalAttempts: number;
  correctAttempts: number;
  weekAttempts: number;
  /** Per-section rollup, keyed by ACT section. Each section
   *  carries its category breakdown (analogous to SAT's per-domain
   *  shape, where "section" is ACT-section and "domain" is
   *  ACT-category). The shape mirrors load-dashboard-aggregate.ts
   *  closely on purpose so the same render component can consume
   *  either side. */
  performance: {
    sections: Array<SectionPerformance>;
    correct: number;
    total: number;
    pct: number | null;
  };
}

interface CategoryStat {
  code: string | null;
  name: string;
  correct: number;
  total: number;
}

interface SectionPerformance {
  section: ActSection | string;
  /** "English", "Math", etc. */
  label: string;
  correct: number;
  total: number;
  pct: number | null;
  categories: CategoryStat[];
}

interface AttemptRow {
  question_id: string;
  is_correct: boolean | null;
  created_at: string;
}

interface QuestionMetaRow {
  id: string;
  section: string;
  category: string | null;
  category_code: string | null;
}

/** Load the ACT dashboard aggregate for the given user. Returns
 *  zeroed totals (and an empty performance section list) when the
 *  student has no ACT attempts at all — the dashboard renderer uses
 *  totalAttempts === 0 as the gate to hide the ACT card entirely
 *  (§3.4 "per-test-type sections hide when there's no data"). */
export async function loadDashboardAggregateAct(
  userId: string,
): Promise<ActDashboardAggregate> {
  const supabase = await createClient();

  const nowMs = Date.now();
  const sevenDaysAgo  = new Date(nowMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const lookbackStart = new Date(
    nowMs - PERFORMANCE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  // Two parallel reads — total counts (cheap) and the detailed
  // attempts-in-window slice that drives per-section / per-category
  // rollup. Per-attempt rows carry only question_id; we resolve
  // section/category via a follow-up IN-fetch on act_questions.
  const [
    { count: totalAttempts },
    { count: correctAttempts },
    { count: weekAttempts },
    { data: lookbackAttempts },
  ] = await Promise.all([
    supabase
      .from('act_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId),
    supabase
      .from('act_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('is_correct', true),
    supabase
      .from('act_attempts')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .gte('created_at', sevenDaysAgo),
    supabase
      .from('act_attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .gte('created_at', lookbackStart),
  ]);

  const total = Number(totalAttempts ?? 0);
  const correct = Number(correctAttempts ?? 0);
  const week = Number(weekAttempts ?? 0);

  // Zero attempts → return empty. Dashboard hides the card.
  if (total === 0) {
    return {
      totalAttempts: 0,
      correctAttempts: 0,
      weekAttempts: 0,
      performance: { sections: [], correct: 0, total: 0, pct: null },
    };
  }

  const attempts: AttemptRow[] = lookbackAttempts ?? [];

  // First-attempt-wins per question, mirroring how the SAT
  // dashboard's RPC aggregates (and how reviews count attempts).
  // Sort ascending by created_at so the first iteration is the
  // earliest attempt for each qid in the window.
  const earliestByQid = new Map<string, AttemptRow>();
  for (const a of [...attempts].sort((x, y) =>
    (x.created_at ?? '').localeCompare(y.created_at ?? ''),
  )) {
    if (!earliestByQid.has(a.question_id)) {
      earliestByQid.set(a.question_id, a);
    }
  }

  const qids = Array.from(earliestByQid.keys());
  const metaById = new Map<string, QuestionMetaRow>();
  if (qids.length > 0) {
    const { data: questionRows } = await supabase
      .from('act_questions')
      .select('id, section, category, category_code')
      .in('id', qids);
    for (const q of (questionRows ?? []) as QuestionMetaRow[]) {
      metaById.set(q.id, q);
    }
  }

  // Roll up per (section, category). A question with a missing
  // section/category gets bucketed under 'unknown' so it's still
  // visible — better than silently dropping rows.
  type Bucket = { correct: number; total: number };
  const sectionAcc = new Map<string, { stats: Bucket; categories: Map<string, CategoryStat & Bucket> }>();
  let perfCorrect = 0;
  let perfTotal = 0;

  for (const [qid, a] of earliestByQid) {
    const meta = metaById.get(qid);
    if (!meta) continue;
    const sectionKey = meta.section ?? 'unknown';
    const categoryName = meta.category ?? 'Other';
    const isC = !!a.is_correct;

    let s = sectionAcc.get(sectionKey);
    if (!s) {
      s = { stats: { correct: 0, total: 0 }, categories: new Map() };
      sectionAcc.set(sectionKey, s);
    }
    s.stats.total += 1;
    if (isC) s.stats.correct += 1;

    let c = s.categories.get(categoryName);
    if (!c) {
      c = {
        code: meta.category_code ?? null,
        name: categoryName,
        correct: 0,
        total: 0,
      };
      s.categories.set(categoryName, c);
    }
    c.total += 1;
    if (isC) c.correct += 1;

    perfTotal += 1;
    if (isC) perfCorrect += 1;
  }

  // Render sections in the canonical ACT order (english → math →
  // reading → science), then any 'unknown' bucket last.
  const orderRank = (s: string): number => {
    const order: Record<string, number> = { english: 0, math: 1, reading: 2, science: 3 };
    return order[s] ?? 99;
  };

  const sections: SectionPerformance[] = Array.from(sectionAcc.entries())
    .sort((a, b) => orderRank(a[0]) - orderRank(b[0]))
    .map(([sectionKey, entry]) => {
      const cats: CategoryStat[] = Array.from(entry.categories.values())
        .map((c) => ({ code: c.code, name: c.name, correct: c.correct, total: c.total }))
        // Weakest-first within section so the bar reads "needs work" → "mastered"
        // (mirrors lib/practice/load-dashboard-aggregate.ts skill ordering).
        .sort((a, b) => categoryRank(a) - categoryRank(b));
      return {
        section: isActSection(sectionKey) ? sectionKey : sectionKey,
        label: sectionLabel(sectionKey),
        correct: entry.stats.correct,
        total: entry.stats.total,
        pct: entry.stats.total > 0
          ? Math.round((entry.stats.correct / entry.stats.total) * 100)
          : null,
        categories: cats,
      };
    });

  return {
    totalAttempts: total,
    correctAttempts: correct,
    weekAttempts: week,
    performance: {
      sections,
      correct: perfCorrect,
      total: perfTotal,
      pct: perfTotal > 0 ? Math.round((perfCorrect / perfTotal) * 100) : null,
    },
  };
}

function categoryRank(c: { correct: number; total: number }): number {
  if (c.total <= 0) return Number.POSITIVE_INFINITY;
  return c.correct / c.total;
}
