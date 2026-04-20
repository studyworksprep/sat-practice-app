import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';
import { validateExternalApiKey } from '../../../../../lib/externalAuth';
import { computeMastery } from '../../../../../lib/mastery';
import { computeTestScores } from '../../../../../lib/testScoreHelper';

const DOMAIN_COLS = 'domain_ini, domain_cas, domain_eoi, domain_sec, domain_alg, domain_atm, domain_pam, domain_geo';

// GET /api/external/student-summary/[studentId]
// Service-to-service endpoint for Lessonworks to fetch student performance data.
// Authenticated via x-api-key header (shared secret).
export async function GET(request, props) {
  const params = await props.params;
  if (!validateExternalApiKey(request)) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  const { studentId } = params;
  const supabase = createServiceClient();

  // Verify student exists
  const { data: student } = await supabase
    .from('profiles')
    .select('id, first_name, last_name')
    .eq('id', studentId)
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  // ── Parallel: fetch all data at once ──
  const [
    { data: allAttempts },
    { data: completedTests },
    { data: officialScores },
    { data: assignStudentRows },
  ] = await Promise.all([
    supabase
      .from('attempts')
      .select('id, question_id, is_correct, created_at')
      .eq('user_id', studentId)
      .eq('source', 'practice')
      .order('created_at', { ascending: true })
      .limit(5000),
    supabase
      .from('practice_test_attempts')
      .select('id, practice_test_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
      .eq('user_id', studentId)
      .eq('status', 'completed')
      .order('finished_at', { ascending: false })
      .limit(10),
    supabase
      .from('sat_official_scores')
      .select(`id, test_date, rw_score, math_score, composite_score, created_at, ${DOMAIN_COLS}`)
      .eq('student_id', studentId)
      .order('test_date', { ascending: false }),
    supabase
      .from('question_assignment_students')
      .select('assignment_id, question_assignments(id, title, question_ids, completed_at)')
      .eq('student_id', studentId),
  ]);

  // ── Taxonomy map for attempted questions ──
  const taxMap = {};
  const allQids = [...new Set((allAttempts || []).map(a => a.question_id))];
  if (allQids.length > 0) {
    const { data: taxRows } = await supabase
      .from('question_taxonomy')
      .select('question_id, domain_code, domain_name, skill_name, difficulty, score_band')
      .in('question_id', allQids);
    for (const t of (taxRows || [])) taxMap[t.question_id] = t;
  }

  // ── First attempt per question ──
  const firstAttemptMap = new Map();
  for (const a of (allAttempts || [])) {
    if (!firstAttemptMap.has(a.question_id)) {
      firstAttemptMap.set(a.question_id, a);
    }
  }
  const firstAttempts = [...firstAttemptMap.values()];

  // ── 1. Assignment completion ──
  const assignmentCompletion = await computeAssignmentCompletion(
    supabase, studentId, assignStudentRows || []
  );

  // ── 2. Practice test scores ──
  const testScores = await computeTestScores(supabase, completedTests);
  const practiceTests = testScores.map(t => ({
    testName: t.test_name,
    finishedAt: t.finished_at,
    composite: t.composite,
    rwScaled: t.sections?.RW?.scaled ?? t.sections?.rw?.scaled ?? null,
    mathScaled: t.sections?.M?.scaled ?? t.sections?.m?.scaled ?? t.sections?.MATH?.scaled ?? null,
  }));

  // ── 3. Domain and skill mastery ──
  const domainAttempts = {};
  const skillAttempts = {};
  for (const att of firstAttempts) {
    const tax = taxMap[att.question_id];
    const domain = tax?.domain_name || 'Unknown';
    const skill = tax?.skill_name || 'Unknown';
    const key = `${domain}::${skill}`;

    if (!domainAttempts[domain]) domainAttempts[domain] = { attempts: [], correct: 0 };
    domainAttempts[domain].attempts.push(att);
    if (att.is_correct) domainAttempts[domain].correct++;

    if (!skillAttempts[key]) skillAttempts[key] = { domain, skill, attempts: [], correct: 0 };
    skillAttempts[key].attempts.push(att);
    if (att.is_correct) skillAttempts[key].correct++;
  }

  const domains = Object.entries(domainAttempts).map(([domain, d]) => ({
    domain,
    mastery: computeMastery(d.attempts, taxMap),
    attempted: d.attempts.length,
    correct: d.correct,
  })).sort((a, b) => a.domain.localeCompare(b.domain));

  const skills = Object.values(skillAttempts).map(s => ({
    skill: s.skill,
    domain: s.domain,
    mastery: computeMastery(s.attempts, taxMap),
    attempted: s.attempts.length,
    correct: s.correct,
  })).sort((a, b) => a.skill.localeCompare(b.skill));

  // ── 4. Official SAT scores ──
  const official = (officialScores || []).map(s => ({
    testDate: s.test_date,
    composite: s.composite_score,
    rwScore: s.rw_score,
    mathScore: s.math_score,
    domainBands: {
      informationAndIdeas: s.domain_ini,
      craftAndStructure: s.domain_cas,
      expressionOfIdeas: s.domain_eoi,
      standardEnglishConventions: s.domain_sec,
      algebra: s.domain_alg,
      advancedMath: s.domain_atm,
      problemSolvingAndDataAnalysis: s.domain_pam,
      geometryAndTrigonometry: s.domain_geo,
    },
  }));

  return NextResponse.json({
    studentId: student.id,
    studentName: `${student.first_name} ${student.last_name}`,
    assignmentCompletion,
    practiceTests,
    mastery: { domains, skills },
    officialScores: official,
  });
}

async function computeAssignmentCompletion(supabase, studentId, assignStudentRows) {
  const validRows = assignStudentRows.filter(r => r.question_assignments);
  if (!validRows.length) return { totalQuestions: 0, completedQuestions: 0, completionPct: null };

  const allQids = [];
  for (const row of validRows) {
    for (const qid of (row.question_assignments.question_ids || [])) {
      if (!allQids.includes(qid)) allQids.push(qid);
    }
  }

  const { data: statusRows } = allQids.length > 0
    ? await supabase
        .from('question_status')
        .select('question_id, is_done')
        .eq('user_id', studentId)
        .in('question_id', allQids)
    : { data: [] };

  const doneSet = new Set();
  for (const r of (statusRows || [])) {
    if (r.is_done) doneSet.add(r.question_id);
  }

  let totalQuestions = 0;
  let completedQuestions = 0;
  for (const row of validRows) {
    const qids = row.question_assignments.question_ids || [];
    totalQuestions += qids.length;
    completedQuestions += qids.filter(qid => doneSet.has(qid)).length;
  }

  return {
    totalQuestions,
    completedQuestions,
    completionPct: totalQuestions > 0 ? Math.round((completedQuestions / totalQuestions) * 100 * 10) / 10 : null,
  };
}
