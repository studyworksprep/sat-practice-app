// Weak-questions queue — Smart Review scoring, ported to v2.
//
// The legacy /api/smart-review route reads question_status + a
// joined taxonomy table. question_status is a v1 aggregation that
// isn't maintained by the v2 submit path, so it went dark as
// traffic moved to v2 runners (new-tree practice, assignments,
// full-length tests). This module re-implements the same scoring
// on top of v2 `attempts` + `questions_v2`.
//
// Priority formula (kept verbatim from the proven Smart Review
// heuristic so rankings are comparable):
//
//   (last_is_correct ? 0 : 40)            // wrong now = big bump
// + (1 - accuracy) * 30                   // historically bad = bump
// + min(daysSince/7, 4) * 10              // stale = bump, capped at 4 weeks
// + (difficulty - 1) * 5                  // harder = small bump
//
// Returns rows sorted desc. Only questions the student has got
// wrong at least once are candidates — an always-right question
// is not a weak-queue item no matter how long ago the attempt was.
// Unpublished / broken / deleted questions are dropped.

import { fetchAll } from '@/lib/supabase/fetchAll';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Resolve a list of `attempts.question_id` values to their
 * matching `questions_v2` rows, translating v1-era IDs through
 * `question_id_map` first.
 *
 * Background: `attempts.question_id` is a mix. v2-era rows store
 * the v2 UUID directly; v1-era rows still hold the original v1
 * UUID. Looking the v1 IDs up against `questions_v2.id` (which
 * was regenerated during the v1→v2 copy) returns nothing, so any
 * caller that joins attempts → questions_v2 silently drops a
 * legacy student's entire history. The translation step makes the
 * join correct for both eras.
 *
 * The selectClause must include `id, is_published, is_broken,
 * deleted_at` so the publish/broken/deleted filter applies. The
 * returned Map is keyed by the ORIGINAL `attempts.question_id`
 * value (so callers using attempt rows index in directly) and
 * filters out rows that fail the publish/broken/deleted gate.
 *
 * @param {object} supabase     - Supabase client
 * @param {string[]} attemptQids - distinct question_ids from attempts
 * @param {string} selectClause - SELECT clause for questions_v2
 * @returns {Promise<Map<string, object>>}
 */
export async function resolveQuestionV2Meta(supabase, attemptQids, selectClause) {
  if (!attemptQids || attemptQids.length === 0) return new Map();

  // 1) Translate any v1 IDs → v2 IDs. v2-era IDs aren't in
  //    old_question_id, so they get no entry here and fall back
  //    to themselves below.
  const { data: mapRows } = await supabase
    .from('question_id_map')
    .select('old_question_id, new_question_id')
    .in('old_question_id', attemptQids);
  const v1ToV2 = new Map(
    (mapRows ?? []).map((r) => [r.old_question_id, r.new_question_id]),
  );

  // 2) Effective IDs to look up: translated where v1, original
  //    where v2. De-dup since multiple v1 IDs (different versions)
  //    could conceivably collapse to the same v2 row.
  const effectiveIds = Array.from(
    new Set(attemptQids.map((id) => v1ToV2.get(id) ?? id)),
  );

  // 3) questions_v2 lookup, paginated for max-rows safety.
  const meta = await fetchAll((from, to) =>
    supabase
      .from('questions_v2')
      .select(selectClause)
      .in('id', effectiveIds)
      .range(from, to),
  );
  const metaByEffectiveId = new Map(
    meta
      .filter((q) => q.is_published && !q.is_broken && q.deleted_at == null)
      .map((q) => [q.id, q]),
  );

  // 4) Re-key by the original attempts.question_id so callers can
  //    index directly using values from their attempt rows.
  const metaByOriginalId = new Map();
  for (const origId of attemptQids) {
    const eff = v1ToV2.get(origId) ?? origId;
    const q = metaByEffectiveId.get(eff);
    if (q) metaByOriginalId.set(origId, q);
  }
  return metaByOriginalId;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {string} userId
 * @param {{ skillName?: string }} [options]
 */
export async function buildWeakQueue(supabase, userId, options = {}) {
  // 1) Every attempt this student has made (paginated).
  const attempts = await fetchAll((from, to) =>
    supabase
      .from('attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .range(from, to),
  );
  if (attempts.length === 0) return [];

  // 2) Aggregate to per-question stats. Attempts are in time order,
  //    so a running last_* value ends up holding the most recent.
  const statsByQid = new Map();
  for (const a of attempts) {
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
    st.last_is_correct = a.is_correct;
    st.last_at = a.created_at;
  }

  // 3) Only keep questions the student has missed at least once.
  const missedIds = Array.from(statsByQid.values())
    .filter((r) => r.any_wrong)
    .map((r) => r.question_id);
  if (missedIds.length === 0) return [];

  // 4) Resolve question_v2 metadata, translating v1 IDs through
  //    question_id_map so legacy-only students' wrong questions
  //    don't get silently dropped by the join.
  const metaById = await resolveQuestionV2Meta(
    supabase,
    missedIds,
    'id, difficulty, skill_name, domain_name, is_published, is_broken, deleted_at',
  );

  // 5) Score.
  const now = Date.now();
  const scored = [];
  for (const stat of statsByQid.values()) {
    if (!stat.any_wrong) continue;
    const q = metaById.get(stat.question_id);
    if (!q) continue;
    if (options.skillName && q.skill_name !== options.skillName) continue;

    const accuracy = stat.count > 0 ? stat.correct / stat.count : 0;
    const daysSince = stat.last_at
      ? (now - new Date(stat.last_at).getTime()) / DAY_MS
      : 30;

    const priority =
      (stat.last_is_correct ? 0 : 40) +
      (1 - accuracy) * 30 +
      Math.min(daysSince / 7, 4) * 10 +
      ((q.difficulty || 1) - 1) * 5;

    scored.push({
      question_id: stat.question_id,
      priority,
      skill_name: q.skill_name,
      domain_name: q.domain_name,
      difficulty: q.difficulty,
      accuracy,
      count: stat.count,
      correct: stat.correct,
      days_since: daysSince,
      last_is_correct: stat.last_is_correct,
    });
  }

  scored.sort((a, b) => b.priority - a.priority);
  return scored;
}

/**
 * Compute per-skill aggregate stats from a scored queue. Used by
 * the Review page's "Common errors" card.
 *
 * Returns an array of { skill_name, domain_name, wrong, total,
 * accuracy }, sorted by (wrong desc, accuracy asc) — so the
 * skill where the student has the most errors comes first, with
 * low-accuracy as a tiebreak.
 */
export function commonErrorsFromAttempts(attempts, metaById) {
  const bySkill = new Map();
  for (const a of attempts) {
    const q = metaById.get(a.question_id);
    if (!q || !q.skill_name) continue;
    let row = bySkill.get(q.skill_name);
    if (!row) {
      row = {
        skill_name: q.skill_name,
        domain_name: q.domain_name,
        wrong: 0,
        total: 0,
      };
      bySkill.set(q.skill_name, row);
    }
    row.total += 1;
    if (!a.is_correct) row.wrong += 1;
  }
  const out = Array.from(bySkill.values()).map((r) => ({
    ...r,
    accuracy: r.total > 0 ? (r.total - r.wrong) / r.total : 1,
  }));
  out.sort((a, b) => {
    if (b.wrong !== a.wrong) return b.wrong - a.wrong;
    return a.accuracy - b.accuracy;
  });
  return out;
}
