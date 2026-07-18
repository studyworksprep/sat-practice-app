// Weak-questions queue — priority scoring for review drills.
//
// The legacy /api/smart-review route reads question_status + a
// joined taxonomy table. question_status is a v1 aggregation that
// isn't maintained by the v2 submit path, so it went dark as
// traffic moved to v2 runners (new-tree practice, assignments,
// full-length tests). This module re-implements the same scoring
// on top of v2 `attempts` + `questions_v2`.
//
// Priority formula (kept verbatim from the proven legacy
// smart-review heuristic so rankings are comparable):
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

// A question the student has attempted within this window is set
// aside when assembling a fresh drill, so consecutive drills walk
// through the breadth of the weak set instead of re-serving the same
// top-priority items. It cycles back once the window lapses — or
// sooner, least-recently-seen first, if there aren't enough cooler
// questions to fill the requested drill size.
export const DRILL_COOLDOWN_MS = 24 * 60 * 60 * 1000;

// PostgREST URL length cap on .in() lists. A UUID is 36 chars +
// comma; ~400 UUIDs is ~15KB which fits inside typical 16KB URL
// limits with room for the surrounding query params. Going over
// returns a 414 with an empty-body error that surfaces to callers
// as `Error: { message: '' }` — which is exactly the failure mode
// the performance page hit on bigger rosters before this chunking
// was added.
const IN_CHUNK_SIZE = 400;

/**
 * Pre-Stage-E-4 this widened a v2 id list with the v1 counterparts
 * that pointed to the same questions, so the attempts IN-list caught
 * both eras. attempts.question_id is now exclusively v2-keyed, so
 * the widening is a no-op; we keep the shape so the ten callers
 * that destructure `{ allIds, v2ByLegacy }` don't have to change in
 * lock-step. Both fields can drop to plain v2Ids / nothing once
 * those callers are individually simplified.
 *
 * @param {object} supabase
 * @param {string[]} v2Ids
 * @returns {Promise<{ allIds: string[], v2ByLegacy: Map<string,string> }>}
 */
export async function expandToAttemptIds(_supabase, v2Ids) {
  if (!v2Ids || v2Ids.length === 0) {
    return { allIds: [], v2ByLegacy: new Map() };
  }
  return { allIds: Array.from(new Set(v2Ids)), v2ByLegacy: new Map() };
}

/**
 * Resolve a list of `attempts.question_id` values to their matching
 * `questions_v2` rows. attempts is exclusively v2-keyed after
 * Stage E-4, so the original v1→v2 translation step is gone — this
 * is now a direct `questions_v2 IN (attemptQids)` lookup with the
 * publish/broken/deleted gate applied.
 *
 * Chunked because attemptQids can run into the thousands on big
 * rosters and a single ungated `.in()` blows past PostgREST's URL
 * length cap.
 *
 * The selectClause must include `id, is_published, is_broken,
 * deleted_at` so the gate applies; returned Map is keyed by
 * `attempts.question_id` for direct indexing from attempt rows.
 *
 * @param {object} supabase     - Supabase client
 * @param {string[]} attemptQids - distinct question_ids from attempts
 * @param {string} selectClause - SELECT clause for questions_v2
 * @returns {Promise<Map<string, object>>}
 */
export async function resolveQuestionV2Meta(supabase, attemptQids, selectClause) {
  if (!attemptQids || attemptQids.length === 0) return new Map();

  const meta = [];
  for (let i = 0; i < attemptQids.length; i += IN_CHUNK_SIZE) {
    const chunk = attemptQids.slice(i, i + IN_CHUNK_SIZE);
    const chunkRows = await fetchAll((from, to) =>
      supabase
        .from('questions_v2')
        .select(selectClause)
        .in('id', chunk)
        .range(from, to),
    );
    meta.push(...chunkRows);
  }
  return new Map(
    meta
      .filter((q) => q.is_published && !q.is_broken && q.deleted_at == null)
      .map((q) => [q.id, q]),
  );
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

  // 3) Keep only questions that are still weak — missed at least
  //    once AND not yet recovered. A question whose most recent
  //    attempt was correct and whose accuracy has climbed back to
  //    the threshold graduates out of the queue, so a student who
  //    re-answers a drill question correctly stops seeing it and the
  //    queue advances to the next weakest material.
  const candidateIds = Array.from(statsByQid.values())
    .filter((r) => r.any_wrong && isStillWeak(r))
    .map((r) => r.question_id);
  if (candidateIds.length === 0) return [];

  // 4) Resolve questions_v2 metadata — attempts is exclusively
  //    v2-keyed, so this is a direct chunked IN-lookup.
  const metaById = await resolveQuestionV2Meta(
    supabase,
    candidateIds,
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
    if (!stat.any_wrong || !isStillWeak(stat)) continue;
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
 * Pick the question ids for a single drill from a scored weak queue
 * (buildWeakQueue / buildWeakQueueAct output, sorted by priority).
 *
 * Prefers questions outside the recency cooldown so back-to-back
 * drills surface new material. Falls back to cooled-down questions
 * only to fill the requested size — least-recently-seen first — so a
 * drill is never short AND consecutive drills still rotate even when
 * the entire weak set was attempted recently (e.g. right after a big
 * practice session, when nothing is outside the window yet).
 *
 * Returns up to `size` question ids in the order they should appear:
 * SELECTION is priority-first (weakest, freshest material wins the
 * slots), but PRESENTATION is easy→hard (§3.2 difficulty ramping) —
 * the drill warms up before it bites. Unknown difficulty sorts last;
 * ties keep the priority order (Array.prototype.sort is stable).
 */
export function selectDrillQuestionIds(scored, size, cooldownMs = DRILL_COOLDOWN_MS) {
  const cooldownDays = cooldownMs / DAY_MS;
  const fresh = [];
  const recent = [];
  for (const r of scored) {
    // scored is priority-sorted; pushing preserves that order within
    // each bucket, so `fresh` stays highest-priority-first.
    if (r.days_since >= cooldownDays) fresh.push(r);
    else recent.push(r);
  }
  // Least-recently-seen first, so dipping into the cooled-down set
  // advances through it instead of re-serving the same items.
  recent.sort((a, b) => b.days_since - a.days_since);
  const picked = fresh.slice(0, size);
  if (picked.length < size) {
    picked.push(...recent.slice(0, size - picked.length));
  }
  picked.sort(
    (a, b) => (a.difficulty ?? Infinity) - (b.difficulty ?? Infinity),
  );
  return picked.map((r) => r.question_id);
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
 * Whether a question still counts as weak, from its aggregate stats.
 * Recovered = most recent attempt correct AND lifetime accuracy at or
 * above WEAK_ACCURACY_THRESHOLD; anything else is still weak. Shared
 * by the weak-queue candidacy gate and the Common Errors card so the
 * two never drift. `stat` needs { last_is_correct, count, correct }.
 */
export function isStillWeak({ last_is_correct, count, correct }) {
  const accuracy = count > 0 ? correct / count : 0;
  return last_is_correct !== true || accuracy < WEAK_ACCURACY_THRESHOLD;
}

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
        // Present only when the caller's meta select includes it —
        // the Review hub needs it for §3.3 lesson recommendations.
        skill_code: q.skill_code ?? null,
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
        skill_code: st.skill_code ?? null,
        domain_name: st.domain_name,
        weak: 0,
        total: 0,
        attempts: 0,
        correctAttempts: 0,
      };
      bySkill.set(st.skill_name, row);
    }
    if (row.skill_code == null && st.skill_code != null) row.skill_code = st.skill_code;
    row.total += 1;
    row.attempts += st.count;
    row.correctAttempts += st.correct;
    if (isStillWeak(st)) row.weak += 1;
  }

  const out = Array.from(bySkill.values()).map((r) => ({
    skill_name: r.skill_name,
    skill_code: r.skill_code,
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
