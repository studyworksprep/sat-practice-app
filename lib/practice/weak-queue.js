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

// PostgREST URL length cap on .in() lists. A UUID is 36 chars +
// comma; ~400 UUIDs is ~15KB which fits inside typical 16KB URL
// limits with room for the surrounding query params. Going over
// returns a 414 with an empty-body error that surfaces to callers
// as `Error: { message: '' }` — which is exactly the failure mode
// the performance page hit on bigger rosters before this chunking
// was added.
const IN_CHUNK_SIZE = 400;

async function fetchInChunks(supabase, table, columns, key, ids) {
  if (!ids || ids.length === 0) return [];
  const rows = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK_SIZE) {
    const chunk = ids.slice(i, i + IN_CHUNK_SIZE);
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .in(key, chunk);
    if (error) throw error;
    if (data) rows.push(...data);
  }
  return rows;
}

/**
 * Mirror of resolveQuestionV2Meta for the opposite join direction.
 *
 * Given a list of v2 question IDs (typically from
 * assignments_v2.question_ids, practice_test_module_items_v2, or
 * any other v2-keyed source), return:
 *   - `allIds`: every question_id value that could match these
 *     questions in `attempts` — the v2 IDs themselves PLUS any
 *     legacy v1 IDs that map to them via question_id_map.
 *   - `v2ByLegacy`: a Map from legacy v1 id → v2 id, so callers
 *     can normalize attempt rows back to the v2 key before
 *     grouping (an attempt on the legacy id "counts as" an
 *     attempt on the v2 question for completion / accuracy
 *     purposes).
 *
 * Why this exists: a legacy-era practice attempt was recorded
 * with the v1 question_id. After the v1→v2 copy regenerated v2
 * IDs, those old rows still hold v1 ids. A naive
 * `.in('question_id', v2Ids)` against `attempts` misses every
 * such row, making a legacy student look like they never
 * answered any v2-keyed questions — even questions they did on
 * the legacy practice page that's now part of an assignment.
 *
 * @param {object} supabase
 * @param {string[]} v2Ids
 * @returns {Promise<{ allIds: string[], v2ByLegacy: Map<string,string> }>}
 */
export async function expandToAttemptIds(supabase, v2Ids) {
  if (!v2Ids || v2Ids.length === 0) {
    return { allIds: [], v2ByLegacy: new Map() };
  }

  const mapRows = await fetchInChunks(
    supabase,
    'question_id_map',
    'old_question_id, new_question_id',
    'new_question_id',
    v2Ids,
  );

  const v2ByLegacy = new Map(
    mapRows.map((r) => [r.old_question_id, r.new_question_id]),
  );

  const allIds = Array.from(new Set([...v2Ids, ...v2ByLegacy.keys()]));
  return { allIds, v2ByLegacy };
}

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
  //    to themselves below. Chunked because attemptQids can run
  //    into the thousands on big rosters and the ungated list
  //    blows past PostgREST's URL length cap.
  const mapRows = await fetchInChunks(
    supabase,
    'question_id_map',
    'old_question_id, new_question_id',
    'old_question_id',
    attemptQids,
  );
  const v1ToV2 = new Map(
    mapRows.map((r) => [r.old_question_id, r.new_question_id]),
  );

  // 2) Effective IDs to look up: translated where v1, original
  //    where v2. De-dup since multiple v1 IDs (different versions)
  //    could conceivably collapse to the same v2 row.
  const effectiveIds = Array.from(
    new Set(attemptQids.map((id) => v1ToV2.get(id) ?? id)),
  );

  // 3) questions_v2 lookup, also chunked. fetchAll handles the
  //    max-rows pagination shape; we wrap each chunk so the
  //    .in() URL stays under cap.
  const meta = [];
  for (let i = 0; i < effectiveIds.length; i += IN_CHUNK_SIZE) {
    const chunk = effectiveIds.slice(i, i + IN_CHUNK_SIZE);
    const chunkRows = await fetchAll((from, to) =>
      supabase
        .from('questions_v2')
        .select(selectClause)
        .in('id', chunk)
        .range(from, to),
    );
    meta.push(...chunkRows);
  }
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

  // 5) Score and collapse to v2 question ids. Multiple v1
  //    attempt-ids can map to the same v2 row (different
  //    versions of the same question); collapsing here keeps
  //    the runner happy — practice_sessions.question_ids feeds
  //    questions_v2 directly, and v1 ids would render as
  //    "removed" since they aren't in questions_v2. Highest-
  //    priority entry wins when duplicates collapse.
  const now = Date.now();
  const byV2 = new Map();
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

    const entry = {
      question_id: q.id,
      priority,
      skill_name: q.skill_name,
      domain_name: q.domain_name,
      difficulty: q.difficulty,
      accuracy,
      count: stat.count,
      correct: stat.correct,
      days_since: daysSince,
      last_is_correct: stat.last_is_correct,
    };

    const existing = byV2.get(q.id);
    if (!existing || existing.priority < priority) {
      byV2.set(q.id, entry);
    }
  }

  const scored = Array.from(byV2.values());
  scored.sort((a, b) => b.priority - a.priority);
  return scored;
}

/**
 * A question stays a "common error" until the student shows they've
 * recovered it: their most recent attempt was correct AND their
 * lifetime accuracy on it is at or above this threshold. Below it
 * (or a wrong most-recent attempt) the question still counts as
 * currently weak. Mastered questions drop out so the Common Errors
 * card ranks skills by how many questions are *currently* weak, not
 * by total historical wrong attempts.
 */
export const WEAK_ACCURACY_THRESHOLD = 0.5;

/**
 * Compute per-skill Common Errors rows from a student's attempts.
 * Used by the Review page's "Common errors" card.
 *
 * Aggregates to distinct questions first (keyed by the resolved v2
 * id, so v1/v2 splits of the same question merge), classifies each
 * as still-weak via WEAK_ACCURACY_THRESHOLD, then groups by skill.
 *
 * Returns an array of { skill_name, domain_name, weak, total,
 * accuracy } where `weak` is the count of distinct currently-weak
 * questions, `total` the distinct questions attempted in the skill,
 * and `accuracy` the attempt-level skill accuracy (drives the bar).
 * Sorted by (weak desc, accuracy asc) so the skill with the most
 * currently-weak questions comes first, low accuracy breaking ties.
 *
 * `attempts` rows must carry created_at so the most-recent attempt
 * per question can be identified (they aren't assumed pre-sorted).
 */
export function commonErrorsFromAttempts(attempts, metaById) {
  // 1) Collapse to per-question stats. Track recency so we know the
  //    correctness of the most recent attempt, not just any attempt.
  const byQuestion = new Map();
  for (const a of attempts) {
    const q = metaById.get(a.question_id);
    if (!q || !q.skill_name) continue;
    const key = q.id ?? a.question_id;
    let st = byQuestion.get(key);
    if (!st) {
      st = {
        skill_name: q.skill_name,
        domain_name: q.domain_name,
        count: 0,
        correct: 0,
        last_at: null,
        last_is_correct: null,
      };
      byQuestion.set(key, st);
    }
    st.count += 1;
    if (a.is_correct) st.correct += 1;
    if (st.last_at == null || a.created_at >= st.last_at) {
      st.last_at = a.created_at;
      st.last_is_correct = a.is_correct;
    }
  }

  // 2) Group by skill, counting only the still-weak questions.
  const bySkill = new Map();
  for (const st of byQuestion.values()) {
    let row = bySkill.get(st.skill_name);
    if (!row) {
      row = {
        skill_name: st.skill_name,
        domain_name: st.domain_name,
        weak: 0,
        total: 0,
        attempts: 0,
        correctAttempts: 0,
      };
      bySkill.set(st.skill_name, row);
    }
    row.total += 1;
    row.attempts += st.count;
    row.correctAttempts += st.correct;
    const accuracy = st.count > 0 ? st.correct / st.count : 0;
    const lastCorrect = st.last_is_correct === true;
    if (!lastCorrect || accuracy < WEAK_ACCURACY_THRESHOLD) row.weak += 1;
  }

  const out = Array.from(bySkill.values()).map((r) => ({
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
