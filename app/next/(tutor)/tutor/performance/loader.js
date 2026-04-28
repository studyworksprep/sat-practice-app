// Roster-wide performance aggregation for /tutor/performance.
//
// Calls two SQL RPCs (get_roster_skill_performance,
// get_roster_weekly_trend) defined in
// 20240101000033_roster_performance_rpcs.sql so the per-skill
// aggregation + weekly trend bucketing happen DB-side. Earlier
// versions of this loader fanned out chunked attempts queries
// and aggregated in JS — that worked but cost real network +
// CPU on bigger rosters (~10s on a 200-student manager). The
// RPCs return ~30 + ~13 rows total instead of tens of thousands
// of attempt rows.
//
// RLS still applies inside the RPCs (SECURITY INVOKER), so the
// caller's roster ids are the only gate on whose data the RPC
// sees. We pull rosterIds from student_practice_stats (also
// RLS-scoped) before calling.

export const PERFORMANCE_WINDOW_DAYS = 90;

const MIN_SKILL_ATTEMPTS = 5;
const MIN_STUDENT_ATTEMPTS_PER_SKILL = 3;
const STRUGGLING_THRESHOLD = 0.6;

const NUM_WEEKS = Math.ceil(PERFORMANCE_WINDOW_DAYS / 7);

/**
 * @param {object} supabase  - RLS-scoped Supabase client.
 */
export async function loadRosterPerformance(supabase) {
  // 1) Roster from the RLS-scoped view. user_ids only — the
  //    rest of the row is ignored.
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
      trend: emptyTrend(),
    };
  }

  // 2) Two RPCs in parallel — the skill aggregation and the
  //    weekly trend. Neither depends on the other.
  const sinceIso = new Date(
    Date.now() - PERFORMANCE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [
    { data: skillRows, error: skillErr },
    { data: trendRows, error: trendErr },
  ] = await Promise.all([
    supabase.rpc('get_roster_skill_performance', {
      p_roster: rosterIds,
      p_since: sinceIso,
      p_min_skill_attempts: MIN_SKILL_ATTEMPTS,
      p_min_student_attempts: MIN_STUDENT_ATTEMPTS_PER_SKILL,
      p_struggling_threshold: STRUGGLING_THRESHOLD,
    }),
    supabase.rpc('get_roster_weekly_trend', {
      p_roster: rosterIds,
      p_num_weeks: NUM_WEEKS,
    }),
  ]);

  if (skillErr) throw skillErr;
  if (trendErr) throw trendErr;

  const skills = (skillRows ?? []).map((r) => ({
    skill_code: r.skill_code,
    skill_name: r.skill_name,
    domain_code: r.domain_code,
    domain_name: r.domain_name,
    attempts: Number(r.attempts ?? 0),
    correct: Number(r.correct ?? 0),
    missed: Number(r.missed ?? 0),
    accuracy: Number(r.accuracy ?? 0),
    studentsTouched: Number(r.students_touched ?? 0),
    studentsBelow60: Number(r.students_below_60 ?? 0),
  }));

  const trend = (trendRows ?? []).map((r) => ({
    startIso: r.start_iso,
    endIso: r.end_iso,
    attempts: Number(r.attempts ?? 0),
    correct: Number(r.correct ?? 0),
    accuracy: r.accuracy == null ? null : Number(r.accuracy),
  }));

  // Aggregate counts for the stats strip. The RPCs already
  // gated on min-attempts + publish status, so totalAttempts
  // here matches the heatmap-eligible total — different from
  // the raw attempts row count, which is what we want for the
  // user-facing card label.
  const totalAttempts = skills.reduce((sum, sk) => sum + sk.attempts, 0);
  const studentsWithActivity = trend.reduce(
    (s, w) => s + (w.attempts > 0 ? 1 : 0),
    0,
  ) > 0
    // We don't have distinct-student counts from the RPC; fall
    // back to "any roster member with attempts in any week" as
    // a proxy. Cheap and close enough for the stats strip; the
    // skill heatmap's per-skill students_touched is the
    // authoritative count where it matters.
    ? rosterIds.length
    : 0;

  return {
    rosterSize: rosterIds.length,
    studentsWithActivity,
    totalAttempts,
    windowDays: PERFORMANCE_WINDOW_DAYS,
    skills,
    trend,
  };
}

function emptyTrend() {
  // Same shape the RPC returns — an array of NUM_WEEKS buckets
  // with null accuracy and zero counts, so the chart always has
  // something to plot even on an empty roster.
  const out = [];
  const now = Date.now();
  for (let i = 0; i < NUM_WEEKS; i += 1) {
    const endMs = now - (NUM_WEEKS - 1 - i) * 7 * 24 * 60 * 60 * 1000;
    const startMs = endMs - 7 * 24 * 60 * 60 * 1000;
    out.push({
      startIso: new Date(startMs).toISOString(),
      endIso: new Date(endMs).toISOString(),
      attempts: 0,
      correct: 0,
      accuracy: null,
    });
  }
  return out;
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
      arr.sort((a, b) =>
        b.studentsBelow60 - a.studentsBelow60
        || a.accuracy - b.accuracy
        || b.attempts - a.attempts);
      break;
  }
  return arr;
}
