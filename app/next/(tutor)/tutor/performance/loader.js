// Roster-wide performance aggregation for /tutor/performance.
//
// Tier 1 of the performance page (the rest is queued for later):
//
//   1. Skill heatmap — one row per skill the roster has touched
//      enough to evaluate (default ≥ 5 cohort attempts), with
//      cohort accuracy, # students who've engaged with the
//      skill, and # students who are below the struggling
//      threshold on it. The default sort surfaces the skills
//      where the most students need help.
//
//   2. Common errors rollup — same skills, ranked by raw "missed
//      questions across the cohort" so the tutor can see "Math
//      domain X is the headline weak spot."
//
// Data path: student_practice_stats view (RLS-scoped, returns
// only roster) → attempts in the last `windowDays` window
// scoped to those students → questions_v2 metadata via
// resolveQuestionV2Meta (which translates v1 attempt ids
// through question_id_map so legacy-era rows aren't dropped)
// → in-memory aggregation.

import { fetchAll } from '@/lib/supabase/fetchAll';
import { resolveQuestionV2Meta } from '@/lib/practice/weak-queue';

export const PERFORMANCE_WINDOW_DAYS = 90;

// Min cohort attempts before a skill shows on the heatmap. Lower
// than this and any single missed question dominates the
// percentage, which is misleading.
const MIN_SKILL_ATTEMPTS = 5;

// Min per-student attempts on a skill before that student counts
// toward the "students below threshold" tally. Avoids inflating
// the count via students with 1–2 attempts on the skill.
const MIN_STUDENT_ATTEMPTS_PER_SKILL = 3;

// Accuracy threshold for the "students below" tally. 60% is a
// common SAT-prep "needs work" cutoff.
const STRUGGLING_THRESHOLD = 0.6;

/**
 * @param {object} supabase  - RLS-scoped Supabase client.
 * @returns {Promise<{
 *   rosterSize: number,
 *   studentsWithActivity: number,
 *   totalAttempts: number,
 *   windowDays: number,
 *   skills: Array<{
 *     skill_code: string,
 *     skill_name: string,
 *     domain_name: string,
 *     domain_code: string,
 *     attempts: number,
 *     correct: number,
 *     accuracy: number,
 *     studentsTouched: number,
 *     studentsBelow60: number,
 *   }>
 * }>}
 */
export async function loadRosterPerformance(supabase) {
  // 1) Roster from the RLS-scoped view.
  const { data: rosterRows } = await supabase
    .from('student_practice_stats')
    .select('user_id');
  const rosterIds = (rosterRows ?? [])
    .map((r) => r.user_id)
    .filter(Boolean);

  if (rosterIds.length === 0) {
    return {
      rosterSize: 0,
      studentsWithActivity: 0,
      totalAttempts: 0,
      windowDays: PERFORMANCE_WINDOW_DAYS,
      skills: [],
    };
  }

  // 2) Roster attempts in the lookback window. Two-layer paging:
  //    rosterIds is chunked so the .in() URL stays under
  //    PostgREST's ~16KB cap (a manager with several hundred
  //    students hits this), and each chunk goes through fetchAll
  //    so the per-chunk results page through the max-rows cap.
  //    Chunks fan out via Promise.all — serial chunking on a
  //    big roster was the dominant slow-path on the perf page.
  const sinceIso = new Date(
    Date.now() - PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();
  const ROSTER_CHUNK = 200;
  const rosterChunks = [];
  for (let i = 0; i < rosterIds.length; i += ROSTER_CHUNK) {
    rosterChunks.push(rosterIds.slice(i, i + ROSTER_CHUNK));
  }
  const chunkResults = await Promise.all(
    rosterChunks.map((chunk) =>
      fetchAll((from, to) =>
        supabase
          .from('attempts')
          .select('user_id, question_id, is_correct, created_at')
          .in('user_id', chunk)
          .gte('created_at', sinceIso)
          .range(from, to),
      ),
    ),
  );
  const attempts = chunkResults.flat();

  if (attempts.length === 0) {
    return {
      rosterSize: rosterIds.length,
      studentsWithActivity: 0,
      totalAttempts: 0,
      windowDays: PERFORMANCE_WINDOW_DAYS,
      skills: [],
    };
  }

  // 3) Resolve question_v2 metadata for every attempted question,
  //    translating v1 ids through question_id_map. Anything that
  //    fails the publish/broken/deleted gate is excluded.
  const attemptedQids = Array.from(
    new Set(attempts.map((a) => a.question_id).filter(Boolean)),
  );
  const metaById = await resolveQuestionV2Meta(
    supabase,
    attemptedQids,
    'id, skill_code, skill_name, domain_code, domain_name, is_published, is_broken, deleted_at',
  );

  // 4) Per-(student, skill) tally first, so we can compute the
  //    "below threshold" count cleanly. We also accumulate the
  //    cohort-level rollup at the same time.
  const perStudentSkill = new Map(); // `${userId}::${skillCode}` → { attempts, correct }
  const skillTotals = new Map(); // skill_code → { skill_name, domain_*, attempts, correct, studentsTouched: Set }
  const studentsWithActivity = new Set();

  for (const a of attempts) {
    const meta = metaById.get(a.question_id);
    if (!meta) continue;
    const skillCode = meta.skill_code;
    if (!skillCode) continue;

    studentsWithActivity.add(a.user_id);

    const psKey = `${a.user_id}::${skillCode}`;
    const ps = perStudentSkill.get(psKey) ?? { attempts: 0, correct: 0 };
    ps.attempts += 1;
    if (a.is_correct) ps.correct += 1;
    perStudentSkill.set(psKey, ps);

    const sk = skillTotals.get(skillCode) ?? {
      skill_code: skillCode,
      skill_name: meta.skill_name ?? skillCode,
      domain_code: meta.domain_code ?? null,
      domain_name: meta.domain_name ?? null,
      attempts: 0,
      correct: 0,
      studentsTouched: new Set(),
    };
    sk.attempts += 1;
    if (a.is_correct) sk.correct += 1;
    sk.studentsTouched.add(a.user_id);
    skillTotals.set(skillCode, sk);
  }

  // 5) Walk perStudentSkill once, counting "below threshold" per
  //    skill. Students with fewer than MIN_STUDENT_ATTEMPTS_PER_SKILL
  //    don't contribute (their accuracy is too noisy).
  const studentsBelow60BySkill = new Map();
  for (const [key, ps] of perStudentSkill) {
    if (ps.attempts < MIN_STUDENT_ATTEMPTS_PER_SKILL) continue;
    const acc = ps.correct / ps.attempts;
    if (acc < STRUGGLING_THRESHOLD) {
      const skillCode = key.split('::')[1];
      studentsBelow60BySkill.set(
        skillCode,
        (studentsBelow60BySkill.get(skillCode) ?? 0) + 1,
      );
    }
  }

  // 6) Materialize the per-skill rows, dropping anything below
  //    MIN_SKILL_ATTEMPTS so a single missed question can't anchor
  //    the heatmap.
  const skills = [];
  for (const sk of skillTotals.values()) {
    if (sk.attempts < MIN_SKILL_ATTEMPTS) continue;
    skills.push({
      skill_code: sk.skill_code,
      skill_name: sk.skill_name,
      domain_code: sk.domain_code,
      domain_name: sk.domain_name,
      attempts: sk.attempts,
      correct: sk.correct,
      missed: sk.attempts - sk.correct,
      accuracy: sk.attempts > 0 ? sk.correct / sk.attempts : 0,
      studentsTouched: sk.studentsTouched.size,
      studentsBelow60: studentsBelow60BySkill.get(sk.skill_code) ?? 0,
    });
  }

  // 7) Weekly cohort accuracy + volume buckets for the trend
  //    chart. Rolling 7-day windows ending at "now" — the most
  //    recent week is always the rightmost data point and tracks
  //    the actual lookback boundary (no half-week boundary
  //    surprises if the load happens mid-week). Only buckets that
  //    have at least one attempt land in the output; the chart
  //    interpolates the rest.
  const trend = buildWeeklyTrend(attempts, PERFORMANCE_WINDOW_DAYS);

  return {
    rosterSize: rosterIds.length,
    studentsWithActivity: studentsWithActivity.size,
    totalAttempts: attempts.length,
    windowDays: PERFORMANCE_WINDOW_DAYS,
    skills,
    trend,
  };
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function buildWeeklyTrend(attempts, windowDays) {
  // Anchor weeks backwards from "now" so the most recent bucket
  // ends at the same instant the lookback boundary is computed
  // from. Bucket count = ceil(windowDays / 7); a 90-day window
  // gets 13 weeks.
  const now = Date.now();
  const numWeeks = Math.ceil(windowDays / 7);
  const buckets = new Array(numWeeks).fill(null).map((_, i) => {
    // i = 0 is the oldest bucket; i = numWeeks-1 is the newest.
    const endMs = now - (numWeeks - 1 - i) * WEEK_MS;
    const startMs = endMs - WEEK_MS;
    return {
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
      startMs,
      endMs,
      attempts: 0,
      correct: 0,
    };
  });
  for (const a of attempts) {
    const t = new Date(a.created_at).getTime();
    if (Number.isNaN(t)) continue;
    // Last bucket wins for the boundary instant.
    const idx = Math.min(
      numWeeks - 1,
      Math.max(0, Math.floor((t - buckets[0].startMs) / WEEK_MS)),
    );
    if (idx < 0 || idx >= numWeeks) continue;
    buckets[idx].attempts += 1;
    if (a.is_correct) buckets[idx].correct += 1;
  }
  return buckets.map((b) => ({
    startIso: b.startIso,
    endIso: b.endIso,
    attempts: b.attempts,
    correct: b.correct,
    accuracy: b.attempts > 0 ? b.correct / b.attempts : null,
  }));
}

/**
 * Sort comparator factory for the heatmap toolbar. Centralized
 * so the page (Server Component) and the toolbar (Client Island)
 * agree on how each option ranks.
 */
export function sortSkills(skills, sort) {
  const arr = [...skills];
  switch (sort) {
    case 'accuracy-asc':
      arr.sort((a, b) => a.accuracy - b.accuracy
        || b.attempts - a.attempts);
      break;
    case 'accuracy-desc':
      arr.sort((a, b) => b.accuracy - a.accuracy
        || b.attempts - a.attempts);
      break;
    case 'attempts':
      arr.sort((a, b) => b.attempts - a.attempts);
      break;
    case 'most-missed':
      // The "common errors" lens — skills with the most missed
      // questions across the cohort. Folded into the heatmap's
      // sort dropdown so the standalone Common-errors card can
      // come down.
      arr.sort((a, b) =>
        b.missed - a.missed
        || b.studentsBelow60 - a.studentsBelow60
        || a.accuracy - b.accuracy);
      break;
    case 'name':
      arr.sort((a, b) => (a.skill_name ?? '').localeCompare(b.skill_name ?? ''));
      break;
    case 'struggling':
    default:
      // Default: most students struggling, with cohort accuracy
      // ascending as the tiebreak. Skills with zero strugglers
      // fall to the bottom of this view but are still listed.
      arr.sort((a, b) =>
        b.studentsBelow60 - a.studentsBelow60
        || a.accuracy - b.accuracy
        || b.attempts - a.attempts);
      break;
  }
  return arr;
}
