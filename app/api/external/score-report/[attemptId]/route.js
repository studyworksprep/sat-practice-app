import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';
import { validateExternalApiKey } from '../../../../../lib/externalAuth';
import { computeScaledScore, isHardRoute } from '../../../../../lib/scoreConversion';
import { generateScoreReportPdf } from '../../../../../lib/generateScoreReportPdf';

// GET /api/external/score-report/[attemptId]
// Returns the practice-test score report PDF for a completed attempt.
// Authenticated via x-api-key header.
export async function GET(request, { params }) {
  if (!validateExternalApiKey(request)) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  const { attemptId } = params;
  const supabase = createServiceClient();

  // ── Load attempt ──
  const { data: attempt, error: attErr } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, user_id, status, metadata, started_at, finished_at, composite_score, rw_scaled, math_scaled')
    .eq('id', attemptId)
    .maybeSingle();

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.status !== 'completed') {
    return NextResponse.json({ error: 'Attempt not yet completed' }, { status: 400 });
  }

  // ── Reuse the same results-building logic as the internal results API ──
  const data = await buildResultsPayload(supabase, attempt);

  // ── Generate PDF ──
  const doc = generateScoreReportPdf(data);
  const pdfBuffer = Buffer.from(doc.output('arraybuffer'));

  const filename = `${(data.test_name || 'Practice-Test').replace(/[^a-zA-Z0-9]+/g, '-')}-Score-Report.pdf`;

  return new NextResponse(pdfBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Content-Length': String(pdfBuffer.length),
    },
  });
}

// ── Build the same data payload that the internal results API returns ──
// This is a streamlined version that produces the shape expected by generateScoreReportPdf.
async function buildResultsPayload(supabase, attempt) {
  const subjectRouteField = {
    RW: 'rw_route_code', rw: 'rw_route_code',
    M: 'm_route_code', m: 'm_route_code', math: 'm_route_code', Math: 'm_route_code', MATH: 'm_route_code',
  };

  const { data: allModules } = await supabase
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', attempt.practice_test_id);

  // Reconstruct attempt items from metadata
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

  // Fetch question versions + correct answers + options + taxonomy
  const qvIds = [...new Set(attemptItems.map(i => i.question_version_id))];
  if (!qvIds.length) {
    return { test_name: '', composite: null, sections: {}, domains: [], questions: [], opportunity: [], student: null, teacher: null };
  }

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

  // Build question review
  const questionReview = attemptItems.map(item => {
    const qid = qvToQ[item.question_version_id];
    const correct = correctByQv[item.question_version_id];
    const options = optsByQv[item.question_version_id] || [];
    const tax = taxByQuestion[qid] || {};

    let selectedOptionId = null;
    let responseText = null;
    let isCorrect = false;
    let wasAnswered = false;

    if (item.answer) {
      wasAnswered = true;
      if (item.answer.option_id) {
        selectedOptionId = item.answer.option_id;
        isCorrect = correct?.correct_option_id === selectedOptionId ||
          (correct?.correct_option_ids || []).includes(selectedOptionId);
      } else if (item.answer.text != null) {
        responseText = String(item.answer.text);
        if (correct?.correct_text != null) {
          isCorrect = responseText.trim().toLowerCase() === String(correct.correct_text).trim().toLowerCase();
        } else if (correct?.correct_number != null) {
          isCorrect = parseFloat(responseText) === correct.correct_number;
        }
      }
    }

    return {
      subject_code: item.subject_code,
      module_number: item.module_number,
      ordinal: item.ordinal,
      question_id: qid,
      domain_name: tax.domain_name || null,
      skill_name: tax.skill_name || null,
      skill_code: tax.skill_code || null,
      difficulty: tax.difficulty ?? null,
      score_band: tax.score_band ?? null,
      time_spent_ms: item.answer?.time_spent_ms || null,
      is_correct: isCorrect,
      was_answered: wasAnswered,
      selected_option_id: selectedOptionId,
      response_text: responseText,
      options: options.map(o => ({ id: o.id, label: o.label })),
      correct_answer: correct || null,
    };
  });

  // Build sections & scores
  const sections = {};
  const sectionItems = {};
  for (const q of questionReview) {
    if (!sectionItems[q.subject_code]) sectionItems[q.subject_code] = { byModule: {} };
    if (!sectionItems[q.subject_code].byModule[q.module_number]) {
      sectionItems[q.subject_code].byModule[q.module_number] = { correct: 0, total: 0 };
    }
    sectionItems[q.subject_code].byModule[q.module_number].total++;
    if (q.is_correct) sectionItems[q.subject_code].byModule[q.module_number].correct++;
  }

  // Fetch score conversion lookup
  const { data: lookupRows } = await supabase
    .from('score_conversion')
    .select('test_id, section, module1_correct, module2_correct, scaled_score')
    .eq('test_id', attempt.practice_test_id);

  const subjToSection = {
    RW: 'reading_writing', rw: 'reading_writing',
    M: 'math', m: 'math', math: 'math', Math: 'math', MATH: 'math',
  };

  const lookupBySection = {};
  for (const row of (lookupRows || [])) {
    if (!lookupBySection[row.section]) lookupBySection[row.section] = [];
    lookupBySection[row.section].push(row);
  }

  let composite = null;
  for (const [subj, si] of Object.entries(sectionItems)) {
    const m1 = si.byModule[1] || { correct: 0, total: 0 };
    const m2 = si.byModule[2] || { correct: 0, total: 0 };
    const routeCode = attempt.metadata?.[subjectRouteField[subj]] ||
      allModules?.find(m => m.subject_code === subj && m.module_number === 2)?.route_code;
    const sectionName = subjToSection[subj] || 'math';

    const scaled = computeScaledScore({
      section: sectionName,
      m1Correct: m1.correct,
      m2Correct: m2.correct,
      routeCode,
      lookupRows: lookupBySection[sectionName] || [],
    });

    sections[subj] = {
      scaled,
      correct: m1.correct + m2.correct,
      total: m1.total + m2.total,
      m1Correct: m1.correct, m1Total: m1.total,
      m2Correct: m2.correct, m2Total: m2.total,
      routeCode,
    };
    composite = (composite || 0) + scaled;
  }

  // Build domain breakdown
  const domainAccum = {};
  for (const q of questionReview) {
    const tax = taxByQuestion[q.question_id] || {};
    const dk = `${q.subject_code}/${tax.domain_code || 'unknown'}`;
    if (!domainAccum[dk]) {
      domainAccum[dk] = {
        domain_name: tax.domain_name || 'Unknown',
        domain_code: tax.domain_code || '',
        subject_code: q.subject_code,
        correct: 0, total: 0, skills: {},
      };
    }
    domainAccum[dk].total++;
    if (q.is_correct) domainAccum[dk].correct++;

    const sk = tax.skill_code || tax.skill_name || 'unknown';
    if (!domainAccum[dk].skills[sk]) {
      domainAccum[dk].skills[sk] = { skill_name: tax.skill_name || 'Unknown', skill_code: sk, correct: 0, total: 0 };
    }
    domainAccum[dk].skills[sk].total++;
    if (q.is_correct) domainAccum[dk].skills[sk].correct++;
  }

  const domains = Object.values(domainAccum).map(d => ({
    ...d,
    skills: Object.values(d.skills),
  }));

  // Opportunity index
  const EASE_WEIGHT = { 1: 0.6, 2: 0.8, 3: 1.0, 4: 1.2, 5: 1.4, 6: 1.6, 7: 1.8 };
  const MODULE_WEIGHT_EASY = { 1: 1.0, 2: 0.8 };
  const MODULE_WEIGHT_HARD = { 1: 1.0, 2: 1.0 };

  const { data: learnRows } = await supabase.from('skill_learnability').select('skill_code, learnability');
  const learnMap = {};
  for (const r of (learnRows || [])) learnMap[r.skill_code] = r.learnability;

  const routeBySubject = {};
  for (const [subj, sec] of Object.entries(sections)) {
    routeBySubject[subj] = isHardRoute(sec.routeCode) ? 'hard' : 'easy';
  }

  const oiAccum = {};
  for (const q of questionReview) {
    const tax = taxByQuestion[q.question_id] || {};
    const sc = tax.skill_code;
    if (!sc) continue;
    if (!oiAccum[sc]) {
      oiAccum[sc] = { skill_name: tax.skill_name || '', domain_name: tax.domain_name || '', learnability: learnMap[sc] ?? 5, rawSum: 0, correct: 0, total: 0 };
    }
    oiAccum[sc].total++;
    if (q.is_correct) {
      oiAccum[sc].correct++;
    } else {
      const band = tax.score_band || 4;
      const ease = EASE_WEIGHT[band] ?? 1.6;
      const route = routeBySubject[q.subject_code] || 'easy';
      const modWeight = route === 'hard' ? (MODULE_WEIGHT_HARD[q.module_number] ?? 1.0) : (MODULE_WEIGHT_EASY[q.module_number] ?? 1.0);
      oiAccum[sc].rawSum += ease * modWeight;
    }
  }

  const opportunity = Object.values(oiAccum)
    .map(s => ({
      skill_name: s.skill_name, domain_name: s.domain_name, learnability: s.learnability,
      correct: s.correct, total: s.total,
      opportunity_index: Math.round(((s.learnability / 10) * s.rawSum) * 100) / 100,
    }))
    .filter(s => s.opportunity_index > 0)
    .sort((a, b) => b.opportunity_index - a.opportunity_index);

  // Student & teacher profiles
  const { data: studentProfile } = await supabase
    .from('profiles')
    .select('first_name, last_name, email, high_school, graduation_year, target_sat_score')
    .eq('id', attempt.user_id)
    .maybeSingle();

  const { data: teacherAssignment } = await supabase
    .from('teacher_student_assignments')
    .select('teacher_id')
    .eq('student_id', attempt.user_id)
    .limit(1)
    .maybeSingle();

  let teacherProfile = null;
  if (teacherAssignment?.teacher_id) {
    const { data: tp } = await supabase
      .from('profiles')
      .select('first_name, last_name, email')
      .eq('id', teacherAssignment.teacher_id)
      .maybeSingle();
    teacherProfile = tp;
  }

  const { data: testData } = await supabase
    .from('practice_tests')
    .select('name, code')
    .eq('id', attempt.practice_test_id)
    .maybeSingle();

  return {
    attempt_id: attempt.id,
    practice_test_id: attempt.practice_test_id,
    test_name: testData?.name || '',
    test_code: testData?.code || '',
    status: attempt.status,
    started_at: attempt.started_at,
    completed_at: attempt.finished_at,
    composite,
    sections,
    domains,
    questions: questionReview,
    opportunity,
    student: studentProfile ? {
      name: [studentProfile.first_name, studentProfile.last_name].filter(Boolean).join(' ') || null,
      email: studentProfile.email,
      high_school: studentProfile.high_school || null,
      graduation_year: studentProfile.graduation_year || null,
      target_sat_score: studentProfile.target_sat_score || null,
    } : null,
    teacher: teacherProfile ? {
      name: [teacherProfile.first_name, teacherProfile.last_name].filter(Boolean).join(' ') || null,
      email: teacherProfile.email,
    } : null,
  };
}
