import { createServiceClient } from './supabase/server';
import { logger } from './api/logger';
import { computeMastery } from './mastery';
import { computeTestScores } from './testScoreHelper';
import { generateScoreReportPdf } from './generateScoreReportPdf';
import { loadTestResults } from './practice-test/load-test-results';

const LESSONWORKS_SYNC_URL = 'https://www.lessonworks.net/api/integrations/studyworks/sync';

// SAT math domains (by domain_name)
const MATH_DOMAINS = new Set([
  'Algebra', 'Advanced Math',
  'Problem-Solving and Data Analysis', 'Geometry and Trigonometry',
]);

// Everything else is reading_writing
function domainCategory(domainName) {
  return MATH_DOMAINS.has(domainName) ? 'math' : 'reading_writing';
}

function masteryLevel(pct) {
  if (pct == null) return null;
  if (pct >= 85) return 'advanced';
  if (pct >= 65) return 'proficient';
  if (pct >= 40) return 'approaching';
  return 'developing';
}

/**
 * Sync one or more students' data to LessonWorks.
 *
 * @param {string[]} studentIds — array of Studyworks user UUIDs to sync
 * @param {Object} [options]
 * @param {boolean} [options.includePdfReports=true] — include base64 PDF reports
 * @param {number}  [options.testLimit=10] — max practice tests per student
 * @returns {Object} the LessonWorks response body
 */
export async function syncStudentsToLessonworks(studentIds, options = {}) {
  const { includePdfReports = true, testLimit = 10 } = options;
  const apiKey = process.env.LESSONWORKS_SYNC_KEY;
  if (!apiKey) throw new Error('LESSONWORKS_SYNC_KEY not configured');

  // Raw service client (not requireServiceRole): the nightly Vercel
  // cron invokes this with no user session, so the wrapper's
  // authenticated-caller requirement can't be met. Emit the same
  // audit event for parity.
  logger.info(
    { event: 'service_role_bypass', reason: 'lessonworks nightly sync', user_id: null, caller_role: 'cron' },
    'service_role_bypass',
  );
  const supabase = createServiceClient();
  const students = [];

  for (const studentId of studentIds) {
    const studentPayload = await buildStudentPayload(supabase, studentId, { includePdfReports, testLimit });
    if (studentPayload) students.push(studentPayload);
  }

  if (!students.length) return { synced: 0, total: 0, results: [] };

  const res = await fetch(LESSONWORKS_SYNC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ students }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LessonWorks sync failed (${res.status}): ${text}`);
  }

  return res.json();
}

/**
 * Build the full sync payload for a single student.
 */
export async function buildStudentPayload(supabase, studentId, { includePdfReports, testLimit }) {
  // ── Parallel fetch all data ──
  const [
    { data: allAttempts },
    { data: completedTests },
    { data: assignStudentRows },
    { data: studentProfile },
    { data: officialScores },
  ] = await Promise.all([
    supabase
      .from('attempts')
      .select('id, question_id, is_correct, created_at, time_spent_ms, source')
      .eq('user_id', studentId)
      .order('created_at', { ascending: true })
      .limit(10000),
    supabase
      .from('practice_test_attempts_v2')
      .select('id, practice_test_id, status, started_at, finished_at, composite_score, rw_scaled, math_scaled')
      .eq('user_id', studentId)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(testLimit),
    supabase
      .from('assignment_students_v2')
      .select('assignment_id, assignments_v2(id, question_ids)')
      .eq('student_id', studentId)
      .eq('test_type', 'sat'),
    supabase
      .from('profiles')
      .select('target_sat_score')
      .eq('id', studentId)
      .maybeSingle(),
    supabase
      .from('sat_official_scores')
      .select('id, test_date, rw_score, math_score, composite_score, test_type')
      .eq('student_id', studentId)
      .order('test_date', { ascending: false }),
  ]);

  if (!allAttempts && !completedTests) return null;

  // ── Practice stats ──
  //
  // total_questions_done is a count of distinct questions the
  // student has answered in practice mode. Was previously computed
  // off question_status.is_done — a v1-keyed legacy table that
  // v2-era practice attempts don't populate, so the field
  // undercounted any student whose practice ran through the new
  // tree (same root-cause as the v2 taxonomy fix at d3503f8).
  // attempts is the v2-aware source of truth; dedupe distinct
  // question_ids out of the source='practice' subset.
  const practiceAttempts = (allAttempts || []).filter(a => a.source === 'practice');
  const totalQuestionsDone = new Set(practiceAttempts.map(a => a.question_id)).size;
  const practiceStats = computePracticeStats(
    practiceAttempts,
    assignStudentRows || [],
    allAttempts || [],
    totalQuestionsDone,
  );

  // ── Taxonomy map for mastery ──
  //
  // attempts.question_id is exclusively v2-keyed after migration
  // 20260621170000 backfilled the column from question_id_map.
  // A single questions_v2 IN suffices.
  const practiceFirstAttempts = dedupeFirstAttempts(practiceAttempts);
  const allQids = [...new Set(practiceFirstAttempts.map(a => a.question_id))];
  const taxMap = {};
  if (allQids.length > 0) {
    const { data: v2Rows } = await supabase
      .from('questions_v2')
      .select('id, domain_code, domain_name, skill_name, difficulty, score_band')
      .in('id', allQids);
    for (const t of (v2Rows || [])) {
      taxMap[t.id] = {
        question_id: t.id,
        domain_code: t.domain_code,
        domain_name: t.domain_name,
        skill_name: t.skill_name,
        difficulty: t.difficulty,
        score_band: t.score_band,
      };
    }
  }

  // ── Domain mastery ──
  const domainMastery = computeDomainMastery(practiceFirstAttempts, taxMap);

  // ── Practice tests ──
  const testScores = await computeTestScores(supabase, completedTests);
  const practiceTests = [];
  for (const t of testScores) {
    const entry = {
      external_test_id: t.attempt_id,
      test_date: t.finished_at ? t.finished_at.slice(0, 10) : null,
      total_score: t.composite,
      math_score: t.sections?.M?.scaled ?? t.sections?.m?.scaled ?? t.sections?.MATH?.scaled ?? null,
      rw_score: t.sections?.RW?.scaled ?? t.sections?.rw?.scaled ?? null,
      test_type: 'practice',
      metadata: {},
    };

    if (includePdfReports) {
      try {
        // Shared loader the in-app results page uses. Service role
        // bypasses RLS on every read inside; viewerUserId is the
        // student so the watermark attributes to the test's owner.
        const result = await loadTestResults({
          supabase,
          attemptId: t.attempt_id,
          viewerUserId: studentId,
          viewerRole: 'admin',
        });
        if (result.ok) {
          const doc = generateScoreReportPdf(result.props.pdfData);
          const arrayBuf = doc.output('arraybuffer');
          entry.report_pdf_base64 = Buffer.from(arrayBuf).toString('base64');
          entry.report_pdf_filename = `report_${entry.test_date || 'unknown'}.pdf`;
        }
      } catch {
        // PDF generation failed for this test — skip PDF, still send scores
      }
    }

    practiceTests.push(entry);
  }

  // ── Official SAT scores ──
  for (const s of (officialScores || [])) {
    const type = s.test_type === 'PSAT' ? 'psat' : 'official';
    practiceTests.push({
      external_test_id: `official_${s.id}`,
      test_date: s.test_date,
      total_score: s.composite_score,
      math_score: s.math_score,
      rw_score: s.rw_score,
      test_type: type,
      metadata: {},
    });
  }

  // ── Assignment completion stats (await the promise) ──
  const assignStats = await practiceStats;

  return {
    external_student_id: studentId,
    target_score: studentProfile?.target_sat_score ? Number(studentProfile.target_sat_score) : null,
    practice_stats: assignStats,
    practice_tests: practiceTests,
    domain_mastery: domainMastery,
  };
}

/**
 * Compute practice_stats fields.
 */
async function computePracticeStats(practiceAttempts, assignStudentRows, allAttempts, totalQuestionsDone) {
  // Sessions: group attempts by 2-hour gaps
  let sessionCount = 0;
  let lastTs = 0;
  const SESSION_GAP = 2 * 60 * 60 * 1000;
  for (const a of practiceAttempts) {
    const ts = new Date(a.created_at).getTime();
    if (ts - lastTs > SESSION_GAP) sessionCount++;
    lastTs = ts;
  }

  // Total practice time (from time_spent_ms)
  let totalMs = 0;
  for (const a of practiceAttempts) {
    if (a.time_spent_ms) totalMs += a.time_spent_ms;
  }

  // Streaks: consecutive calendar days with practice
  const daySet = new Set();
  for (const a of practiceAttempts) {
    daySet.add(new Date(a.created_at).toISOString().slice(0, 10));
  }
  const sortedDays = [...daySet].sort();
  let currentStreak = 0;
  let longestStreak = 0;
  let streak = 0;
  let prevDate = null;
  for (const day of sortedDays) {
    const d = new Date(day);
    if (prevDate && (d - prevDate) === 86400000) {
      streak++;
    } else {
      streak = 1;
    }
    if (streak > longestStreak) longestStreak = streak;
    prevDate = d;
  }
  // Current streak: count backwards from today
  const today = new Date().toISOString().slice(0, 10);
  currentStreak = 0;
  let checkDate = new Date(today);
  while (daySet.has(checkDate.toISOString().slice(0, 10))) {
    currentStreak++;
    checkDate.setDate(checkDate.getDate() - 1);
  }

  // Assignment completion
  const validRows = (assignStudentRows || []).filter(r => r.question_assignments);
  let assignmentsTotal = 0;
  let assignmentsCompleted = 0;

  if (validRows.length > 0) {
    const allQids = [];
    for (const row of validRows) {
      for (const qid of (row.question_assignments.question_ids || [])) {
        if (!allQids.includes(qid)) allQids.push(qid);
      }
    }
    assignmentsTotal = allQids.length;

    // "Done" for an assigned question = the student has attempted
    // it at least once, regardless of source (practice, test, or
    // review all count). Was previously a question_status.is_done
    // lookup — v1-keyed table that v2-era attempts don't update,
    // so the count was systematically low for any cohort that
    // straddled the next-tree cutover. attempts is v2-aware and
    // we already have the full set loaded, so the membership test
    // is in-memory.
    if (allQids.length > 0) {
      const attemptedSet = new Set(allAttempts.map((a) => a.question_id));
      let doneCount = 0;
      for (const qid of allQids) {
        if (attemptedSet.has(qid)) doneCount += 1;
      }
      assignmentsCompleted = doneCount;
    }
  }

  const lastPractice = practiceAttempts.length > 0
    ? practiceAttempts[practiceAttempts.length - 1].created_at
    : null;

  return {
    total_questions_done: totalQuestionsDone,
    assignments_total: assignmentsTotal,
    assignments_completed: assignmentsCompleted,
    assignments_completion_pct: assignmentsTotal > 0
      ? Math.round((assignmentsCompleted / assignmentsTotal) * 1000) / 10
      : null,
    practice_sessions_total: sessionCount,
    practice_minutes_total: Math.round(totalMs / 60000),
    streak_current: currentStreak,
    streak_longest: longestStreak,
    last_practice_at: lastPractice,
  };
}

/**
 * De-duplicate to first attempt per question.
 */
function dedupeFirstAttempts(attempts) {
  const seen = new Map();
  for (const a of attempts) {
    if (!seen.has(a.question_id)) seen.set(a.question_id, a);
  }
  return [...seen.values()];
}

/**
 * Compute domain mastery in the format LessonWorks expects.
 */
function computeDomainMastery(firstAttempts, taxMap) {
  const domainBuckets = {};
  for (const att of firstAttempts) {
    const tax = taxMap[att.question_id];
    const domain = tax?.domain_name || 'Unknown';
    if (!domainBuckets[domain]) domainBuckets[domain] = { attempts: [], correct: 0, lastAt: null };
    domainBuckets[domain].attempts.push(att);
    if (att.is_correct) domainBuckets[domain].correct++;
    const ts = att.created_at;
    if (!domainBuckets[domain].lastAt || ts > domainBuckets[domain].lastAt) {
      domainBuckets[domain].lastAt = ts;
    }
  }

  return Object.entries(domainBuckets).map(([domain, d]) => {
    const pct = computeMastery(d.attempts, taxMap);
    return {
      domain_name: domain,
      domain_category: domainCategory(domain),
      mastery_level: masteryLevel(pct),
      mastery_percent: pct,
      questions_attempted: d.attempts.length,
      questions_correct: d.correct,
      last_activity_at: d.lastAt,
    };
  }).sort((a, b) => a.domain_name.localeCompare(b.domain_name));
}

