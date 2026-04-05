import { createServiceClient } from './supabase/server';
import { computeMastery } from './mastery';
import { computeTestScores } from './testScoreHelper';
import { generateScoreReportPdf } from './generateScoreReportPdf';
import { computeScaledScore, isHardRoute } from './scoreConversion';

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
  ] = await Promise.all([
    supabase
      .from('attempts')
      .select('id, question_id, is_correct, created_at, time_spent_ms, source')
      .eq('user_id', studentId)
      .order('created_at', { ascending: true })
      .limit(10000),
    supabase
      .from('practice_test_attempts')
      .select('id, practice_test_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
      .eq('user_id', studentId)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(testLimit),
    supabase
      .from('question_assignment_students')
      .select('assignment_id, question_assignments(id, question_ids)')
      .eq('student_id', studentId),
  ]);

  if (!allAttempts && !completedTests) return null;

  // ── Practice stats ──
  const practiceAttempts = (allAttempts || []).filter(a => a.source === 'practice');
  const practiceStats = computePracticeStats(practiceAttempts, assignStudentRows || [], supabase, studentId);

  // ── Taxonomy map for mastery ──
  const practiceFirstAttempts = dedupeFirstAttempts(practiceAttempts);
  const allQids = [...new Set(practiceFirstAttempts.map(a => a.question_id))];
  const taxMap = {};
  if (allQids.length > 0) {
    const { data: taxRows } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_name, difficulty, score_band')
      .in('question_id', allQids);
    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
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
        const pdfData = await buildResultsForPdf(supabase, t.attempt_id);
        if (pdfData) {
          const doc = generateScoreReportPdf(pdfData);
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

  // ── Assignment completion stats (await the promise) ──
  const assignStats = await practiceStats;

  return {
    external_student_id: studentId,
    practice_stats: assignStats,
    practice_tests: practiceTests,
    domain_mastery: domainMastery,
  };
}

/**
 * Compute practice_stats fields.
 */
async function computePracticeStats(practiceAttempts, assignStudentRows, supabase, studentId) {
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

    if (allQids.length > 0) {
      const { data: statusRows } = await supabase
        .from('question_status')
        .select('question_id, is_done')
        .eq('user_id', studentId)
        .in('question_id', allQids);
      const doneSet = new Set();
      for (const r of (statusRows || [])) {
        if (r.is_done) doneSet.add(r.question_id);
      }
      assignmentsCompleted = doneSet.size;
    }
  }

  const lastPractice = practiceAttempts.length > 0
    ? practiceAttempts[practiceAttempts.length - 1].created_at
    : null;

  return {
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

/**
 * Build the results payload needed to generate a score report PDF.
 * Simplified version — fetches attempt and rebuilds the data structure.
 */
async function buildResultsForPdf(supabase, attemptId) {
  const { data: attempt } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, user_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
    .eq('id', attemptId)
    .maybeSingle();

  if (!attempt || attempt.status !== 'completed') return null;

  // Use cached scores if available for a lightweight payload
  const { data: testData } = await supabase
    .from('practice_tests')
    .select('name, code')
    .eq('id', attempt.practice_test_id)
    .maybeSingle();

  const subjectRouteField = {
    RW: 'rw_route_code', rw: 'rw_route_code',
    M: 'm_route_code', m: 'm_route_code', math: 'm_route_code', Math: 'm_route_code', MATH: 'm_route_code',
  };

  const { data: allModules } = await supabase
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', attempt.practice_test_id);

  // Reconstruct attempt items
  const attemptItems = [];
  for (const key of attempt.metadata?.submitted_modules || []) {
    const slash = key.lastIndexOf('/');
    const subj = key.slice(0, slash);
    const modNum = parseInt(key.slice(slash + 1), 10);
    const routeCode = modNum === 1
      ? allModules?.find(m => m.subject_code === subj && m.module_number === 1)?.route_code
      : attempt.metadata?.[subjectRouteField[subj]];
    const mod = allModules?.find(m => m.subject_code === subj && m.module_number === modNum && m.route_code === routeCode);
    if (!mod) continue;

    const answers = attempt.metadata?.[`answers_${key.replace('/', '_')}`] || {};
    const { data: moduleItems } = await supabase
      .from('practice_test_module_items')
      .select('ordinal, question_version_id')
      .eq('practice_test_module_id', mod.id)
      .order('ordinal');

    for (const item of (moduleItems || [])) {
      attemptItems.push({
        subject_code: subj,
        module_number: modNum,
        route_code: routeCode,
        ordinal: item.ordinal,
        question_version_id: item.question_version_id,
        answer: answers[String(item.ordinal)] || null,
      });
    }
  }

  const qvIds = [...new Set(attemptItems.map(i => i.question_version_id))];
  if (!qvIds.length) return null;

  const [{ data: qvRows }, { data: correctRows }, { data: optionRows }] = await Promise.all([
    supabase.from('question_versions').select('id, question_id').in('id', qvIds),
    supabase.from('correct_answers').select('question_version_id, correct_option_id, correct_option_ids, correct_text, correct_number').in('question_version_id', qvIds),
    supabase.from('answer_options').select('id, question_version_id, label, ordinal').in('question_version_id', qvIds).order('ordinal'),
  ]);

  const qvToQ = {};
  for (const qv of (qvRows || [])) qvToQ[qv.id] = qv.question_id;
  const correctByQv = {};
  for (const c of (correctRows || [])) correctByQv[c.question_version_id] = c;
  const optsByQv = {};
  for (const o of (optionRows || [])) {
    if (!optsByQv[o.question_version_id]) optsByQv[o.question_version_id] = [];
    optsByQv[o.question_version_id].push(o);
  }

  const questionIds = [...new Set(Object.values(qvToQ))];
  const { data: taxRows } = await supabase
    .from('question_taxonomy')
    .select('question_id, domain_code, domain_name, skill_code, skill_name, difficulty, score_band')
    .in('question_id', questionIds);
  const taxByQuestion = {};
  for (const t of (taxRows || [])) taxByQuestion[t.question_id] = t;

  const questionReview = attemptItems.map(item => {
    const qid = qvToQ[item.question_version_id];
    const correct = correctByQv[item.question_version_id];
    const options = optsByQv[item.question_version_id] || [];
    const tax = taxByQuestion[qid] || {};

    let selectedOptionId = null, responseText = null, isCorrect = false, wasAnswered = false;
    if (item.answer) {
      wasAnswered = true;
      if (item.answer.option_id) {
        selectedOptionId = item.answer.option_id;
        isCorrect = correct?.correct_option_id === selectedOptionId ||
          (correct?.correct_option_ids || []).includes(selectedOptionId);
      } else if (item.answer.text != null) {
        responseText = String(item.answer.text);
        if (correct?.correct_text != null) isCorrect = responseText.trim().toLowerCase() === String(correct.correct_text).trim().toLowerCase();
        else if (correct?.correct_number != null) isCorrect = parseFloat(responseText) === correct.correct_number;
      }
    }

    return {
      subject_code: item.subject_code, module_number: item.module_number, ordinal: item.ordinal,
      question_id: qid, domain_name: tax.domain_name || null, skill_name: tax.skill_name || null,
      skill_code: tax.skill_code || null, difficulty: tax.difficulty ?? null, score_band: tax.score_band ?? null,
      time_spent_ms: item.answer?.time_spent_ms || null, is_correct: isCorrect, was_answered: wasAnswered,
      selected_option_id: selectedOptionId, response_text: responseText,
      options: options.map(o => ({ id: o.id, label: o.label })), correct_answer: correct || null,
    };
  });

  // Build sections
  const subjToSection = { RW: 'reading_writing', rw: 'reading_writing', M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math' };
  const sectionItems = {};
  for (const q of questionReview) {
    if (!sectionItems[q.subject_code]) sectionItems[q.subject_code] = { byModule: {} };
    if (!sectionItems[q.subject_code].byModule[q.module_number]) sectionItems[q.subject_code].byModule[q.module_number] = { correct: 0, total: 0 };
    sectionItems[q.subject_code].byModule[q.module_number].total++;
    if (q.is_correct) sectionItems[q.subject_code].byModule[q.module_number].correct++;
  }

  const { data: lookupRows } = await supabase
    .from('score_conversion')
    .select('test_id, section, module1_correct, module2_correct, scaled_score')
    .eq('test_id', attempt.practice_test_id);
  const lookupBySection = {};
  for (const row of (lookupRows || [])) {
    if (!lookupBySection[row.section]) lookupBySection[row.section] = [];
    lookupBySection[row.section].push(row);
  }

  const sections = {};
  let composite = null;
  for (const [subj, si] of Object.entries(sectionItems)) {
    const m1 = si.byModule[1] || { correct: 0, total: 0 };
    const m2 = si.byModule[2] || { correct: 0, total: 0 };
    const routeCode = attempt.metadata?.[subjectRouteField[subj]] ||
      allModules?.find(m => m.subject_code === subj && m.module_number === 2)?.route_code;
    const sectionName = subjToSection[subj] || 'math';
    const scaled = computeScaledScore({ section: sectionName, m1Correct: m1.correct, m2Correct: m2.correct, routeCode, lookupRows: lookupBySection[sectionName] || [] });
    sections[subj] = { scaled, correct: m1.correct + m2.correct, total: m1.total + m2.total, m1Correct: m1.correct, m1Total: m1.total, m2Correct: m2.correct, m2Total: m2.total, routeCode };
    composite = (composite || 0) + scaled;
  }

  // Domain breakdown
  const domainAccum = {};
  for (const q of questionReview) {
    const tax = taxByQuestion[q.question_id] || {};
    const dk = `${q.subject_code}/${tax.domain_code || 'unknown'}`;
    if (!domainAccum[dk]) domainAccum[dk] = { domain_name: tax.domain_name || 'Unknown', domain_code: tax.domain_code || '', subject_code: q.subject_code, correct: 0, total: 0, skills: {} };
    domainAccum[dk].total++;
    if (q.is_correct) domainAccum[dk].correct++;
    const sk = tax.skill_code || tax.skill_name || 'unknown';
    if (!domainAccum[dk].skills[sk]) domainAccum[dk].skills[sk] = { skill_name: tax.skill_name || 'Unknown', skill_code: sk, correct: 0, total: 0 };
    domainAccum[dk].skills[sk].total++;
    if (q.is_correct) domainAccum[dk].skills[sk].correct++;
  }
  const domains = Object.values(domainAccum).map(d => ({ ...d, skills: Object.values(d.skills) }));

  // Opportunity index
  const EASE_WEIGHT = { 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2, 5: 1.4, 6: 1.6, 7: 1.8 };
  const MODULE_WEIGHT_EASY = { 1: 1.0, 2: 0.8 };
  const MODULE_WEIGHT_HARD = { 1: 1.0, 2: 1.0 };
  const { data: learnRows } = await supabase.from('skill_learnability').select('skill_code, learnability');
  const learnMap = {};
  for (const r of (learnRows || [])) learnMap[r.skill_code] = r.learnability;
  const routeBySubject = {};
  for (const [subj, sec] of Object.entries(sections)) routeBySubject[subj] = isHardRoute(sec.routeCode) ? 'hard' : 'easy';

  const oiAccum = {};
  for (const q of questionReview) {
    const tax = taxByQuestion[q.question_id] || {};
    const sc = tax.skill_code;
    if (!sc) continue;
    if (!oiAccum[sc]) oiAccum[sc] = { skill_name: tax.skill_name || '', domain_name: tax.domain_name || '', learnability: learnMap[sc] ?? 5, rawSum: 0, correct: 0, total: 0 };
    oiAccum[sc].total++;
    if (q.is_correct) { oiAccum[sc].correct++; }
    else {
      const band = tax.score_band || 4;
      const ease = EASE_WEIGHT[band] ?? 1.6;
      const route = routeBySubject[q.subject_code] || 'easy';
      const modWeight = route === 'hard' ? (MODULE_WEIGHT_HARD[q.module_number] ?? 1.0) : (MODULE_WEIGHT_EASY[q.module_number] ?? 1.0);
      oiAccum[sc].rawSum += ease * modWeight;
    }
  }
  const opportunity = Object.values(oiAccum)
    .map(s => ({ skill_name: s.skill_name, domain_name: s.domain_name, learnability: s.learnability, correct: s.correct, total: s.total, opportunity_index: Math.round(((s.learnability / 10) * s.rawSum) * 100) / 100 }))
    .filter(s => s.opportunity_index > 0).sort((a, b) => b.opportunity_index - a.opportunity_index);

  // Student & teacher profiles
  const { data: studentProfile } = await supabase.from('profiles').select('first_name, last_name, email, high_school, graduation_year, target_sat_score').eq('id', attempt.user_id).maybeSingle();
  const { data: teacherAssignment } = await supabase.from('teacher_student_assignments').select('teacher_id').eq('student_id', attempt.user_id).limit(1).maybeSingle();
  let teacherProfile = null;
  if (teacherAssignment?.teacher_id) {
    const { data: tp } = await supabase.from('profiles').select('first_name, last_name, email').eq('id', teacherAssignment.teacher_id).maybeSingle();
    teacherProfile = tp;
  }

  return {
    attempt_id: attempt.id, practice_test_id: attempt.practice_test_id,
    test_name: testData?.name || '', test_code: testData?.code || '',
    status: attempt.status, started_at: attempt.started_at, completed_at: attempt.finished_at,
    composite, sections, domains, questions: questionReview, opportunity,
    student: studentProfile ? { name: [studentProfile.first_name, studentProfile.last_name].filter(Boolean).join(' ') || null, email: studentProfile.email, high_school: studentProfile.high_school || null, graduation_year: studentProfile.graduation_year || null, target_sat_score: studentProfile.target_sat_score || null } : null,
    teacher: teacherProfile ? { name: [teacherProfile.first_name, teacherProfile.last_name].filter(Boolean).join(' ') || null, email: teacherProfile.email } : null,
  };
}
