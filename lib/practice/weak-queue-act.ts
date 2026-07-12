// ACT-side weak-queue + common-errors scoring. Sibling to
// lib/practice/weak-queue.js (SAT). See docs/architecture-plan.md
// §3.4 — review surfaces fork at the loader/data layer; the
// rendering UI consumes a uniform shape.
//
// Returns rows in the same shape the SAT loader produces:
//   { question_id, priority, skill_name, domain_name, difficulty,
//     accuracy, count, correct, days_since, last_is_correct }
//
// where skill_name carries the ACT `category` and domain_name
// carries the section label ("Math", "English", etc.). This lets
// the existing Common Errors card + WeakQueueLauncher render ACT
// rows without knowing they're ACT.
//
// No v1-to-v2 id translation here — ACT has no legacy
// era. Every question_id in act_attempts is a native act_questions
// uuid.

import { fetchAll } from '@/lib/supabase/fetchAll';
import { sectionLabel } from '@/lib/practice/act-taxonomy';
import { isStillWeak } from '@/lib/practice/weak-queue';

const DAY_MS = 24 * 60 * 60 * 1000;
const IN_CHUNK_SIZE = 400;

// Look up ACT question metadata for a set of question_ids the
// student has attempted. Filters out broken rows so a removed
// question can't surface in Review.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function resolveActQuestionMeta(supabase: any, qids: string[]) {
  const out = new Map<string, {
    id: string;
    difficulty: number | null;
    category: string | null;
    section: string;
    is_broken: boolean;
  }>();
  if (qids.length === 0) return out;
  for (let i = 0; i < qids.length; i += IN_CHUNK_SIZE) {
    const chunk = qids.slice(i, i + IN_CHUNK_SIZE);
    const rows = await fetchAll((from, to) =>
      supabase
        .from('act_questions')
        .select('id, difficulty, category, section, is_broken')
        .in('id', chunk)
        .range(from, to),
    );
    for (const r of rows as Array<{
      id: string; difficulty: number | null; category: string | null;
      section: string; is_broken: boolean;
    }>) {
      if (!r.is_broken) out.set(r.id, r);
    }
  }
  return out;
}

interface WeakQueueOptions {
  /** Filter to a single ACT category — the rough analog of the
   *  SAT skillName filter. */
  categoryName?: string;
}

interface ScoredEntry {
  question_id: string;
  priority: number;
  skill_name: string | null;   // ACT category
  domain_name: string | null;  // ACT section label
  difficulty: number | null;
  accuracy: number;
  count: number;
  correct: number;
  days_since: number;
  last_is_correct: boolean | null;
}

export async function buildWeakQueueAct(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  userId: string,
  options: WeakQueueOptions = {},
): Promise<ScoredEntry[]> {
  // 1) Every ACT attempt this student has, time-ordered.
  const attempts = await fetchAll((from, to) =>
    supabase
      .from('act_attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .range(from, to),
  );
  if (attempts.length === 0) return [];

  // 2) Aggregate per question.
  const statsByQid = new Map<string, {
    question_id: string;
    count: number;
    correct: number;
    last_is_correct: boolean | null;
    last_at: string | null;
    any_wrong: boolean;
  }>();
  for (const a of attempts as Array<{
    question_id: string; is_correct: boolean | null; created_at: string;
  }>) {
    let st = statsByQid.get(a.question_id);
    if (!st) {
      st = {
        question_id: a.question_id,
        count: 0,
        correct: 0,
        last_is_correct: null,
        last_at: null,
        any_wrong: false,
      };
      statsByQid.set(a.question_id, st);
    }
    st.count += 1;
    if (a.is_correct) st.correct += 1;
    else st.any_wrong = true;
    st.last_is_correct = !!a.is_correct;
    st.last_at = a.created_at;
  }

  // 3) Keep only still-weak questions (missed at least once and not
  //    yet recovered) so mastered questions graduate out of the
  //    queue and the drill advances. Mirrors the SAT buildWeakQueue.
  const candidateIds = Array.from(statsByQid.values())
    .filter((r) => r.any_wrong && isStillWeak(r))
    .map((r) => r.question_id);
  if (candidateIds.length === 0) return [];

  const metaById = await resolveActQuestionMeta(supabase, candidateIds);
  const now = Date.now();
  const byId = new Map<string, ScoredEntry>();

  for (const stat of statsByQid.values()) {
    if (!stat.any_wrong || !isStillWeak(stat)) continue;
    const q = metaById.get(stat.question_id);
    if (!q) continue;
    if (options.categoryName && q.category !== options.categoryName) continue;

    const accuracy = stat.count > 0 ? stat.correct / stat.count : 0;
    const daysSince = stat.last_at
      ? (now - new Date(stat.last_at).getTime()) / DAY_MS
      : 30;

    // Same priority formula as the SAT side so cross-test rankings
    // stay comparable in shape:
    //   wrong now (40)
    //   + historically bad (0..30)
    //   + stale (0..40, capped at 4 weeks)
    //   + difficulty bump ((d-1) * 5)
    // ACT difficulty is 1..5 (vs SAT's 1..3) so the difficulty bump
    // can reach 20 instead of 10. That's intentional — a harder ACT
    // item should weigh more in the queue, matching the broader scale.
    const priority =
      (stat.last_is_correct ? 0 : 40) +
      (1 - accuracy) * 30 +
      Math.min(daysSince / 7, 4) * 10 +
      ((q.difficulty || 1) - 1) * 5;

    byId.set(q.id, {
      question_id: q.id,
      priority,
      skill_name: q.category,
      domain_name: q.section ? sectionLabel(q.section) : null,
      difficulty: q.difficulty,
      accuracy,
      count: stat.count,
      correct: stat.correct,
      days_since: daysSince,
      last_is_correct: stat.last_is_correct,
    });
  }

  const scored = Array.from(byId.values());
  scored.sort((a, b) => b.priority - a.priority);
  return scored;
}

interface CommonErrorRow {
  skill_name: string;   // ACT category
  domain_name: string;  // ACT section label
  weak: number;
  total: number;
  accuracy: number;
}

/** Compute per-category Common Errors rows from a list of ACT
 *  attempts + a meta map. Same distinct-question, still-weak logic
 *  as the SAT commonErrorsFromAttempts (ACT has no v1/v2 split, so
 *  questions key directly on question_id) — see that function for
 *  the rationale. Same output shape so the Common Errors card can
 *  render either side without branching. Attempts must carry
 *  created_at so the most-recent attempt per question is known. */
export function commonErrorsFromActAttempts(
  attempts: Array<{ question_id: string; is_correct: boolean | null; created_at: string }>,
  metaById: Map<string, { category: string | null; section: string | null }>,
): CommonErrorRow[] {
  // 1) Collapse to per-question stats, tracking recency.
  const byQuestion = new Map<string, {
    category: string;
    section: string | null;
    count: number;
    correct: number;
    last_at: string | null;
    last_is_correct: boolean | null;
  }>();
  for (const a of attempts) {
    const q = metaById.get(a.question_id);
    if (!q || !q.category) continue;
    let st = byQuestion.get(a.question_id);
    if (!st) {
      st = {
        category: q.category,
        section: q.section,
        count: 0,
        correct: 0,
        last_at: null,
        last_is_correct: null,
      };
      byQuestion.set(a.question_id, st);
    }
    st.count += 1;
    if (a.is_correct) st.correct += 1;
    if (st.last_at == null || a.created_at >= st.last_at) {
      st.last_at = a.created_at;
      st.last_is_correct = !!a.is_correct;
    }
  }

  // 2) Group by category, counting only the still-weak questions.
  const byCategory = new Map<string, {
    skill_name: string; domain_name: string;
    weak: number; total: number; attempts: number; correctAttempts: number;
  }>();
  for (const st of byQuestion.values()) {
    let row = byCategory.get(st.category);
    if (!row) {
      row = {
        skill_name: st.category,
        domain_name: st.section ? sectionLabel(st.section) : '',
        weak: 0,
        total: 0,
        attempts: 0,
        correctAttempts: 0,
      };
      byCategory.set(st.category, row);
    }
    row.total += 1;
    row.attempts += st.count;
    row.correctAttempts += st.correct;
    if (isStillWeak(st)) row.weak += 1;
  }

  const out = Array.from(byCategory.values()).map((r) => ({
    skill_name: r.skill_name,
    domain_name: r.domain_name,
    weak: r.weak,
    total: r.total,
    accuracy: r.attempts > 0 ? r.correctAttempts / r.attempts : 1,
  }));
  out.sort((a, b) => {
    if (b.weak !== a.weak) return b.weak - a.weak;
    return a.accuracy - b.accuracy;
  });
  return out;
}

/** Resolve meta for a list of attempted ACT questions; used to feed
 *  commonErrorsFromActAttempts. Filters broken questions out. */
export async function resolveActQuestionMetaForReview(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  qids: string[],
): Promise<Map<string, { category: string | null; section: string }>> {
  const full = await resolveActQuestionMeta(supabase, qids);
  const out = new Map<string, { category: string | null; section: string }>();
  for (const [id, r] of full) {
    out.set(id, { category: r.category, section: r.section });
  }
  return out;
}
