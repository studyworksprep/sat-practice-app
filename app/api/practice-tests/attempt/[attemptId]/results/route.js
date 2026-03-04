import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';
import { toScaledScore } from '../../../../../../lib/scoreConversion';

// GET /api/practice-tests/attempt/[attemptId]/results
// Returns full results including scores, domain breakdown, and question review.
export async function GET(_request, { params }) {
  const { attemptId } = params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: attempt, error: attErr } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, user_id, status, metadata, started_at, finished_at')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  // Fetch all attempt items
  const { data: storedItems } = await supabase
    .from('practice_test_attempt_items')
    .select('subject_code, module_number, route_code, ordinal, question_version_id')
    .eq('practice_test_attempt_id', attemptId)
    .order('subject_code')
    .order('module_number')
    .order('ordinal');

  let attemptItems = storedItems || [];

  // Fallback: if the attempt_items table was empty (e.g. table didn't exist when
  // the test was submitted), reconstruct items from metadata + module definitions.
  if (attemptItems.length === 0 && attempt.metadata?.submitted_modules?.length) {
    const subjectRouteField = { RW: 'rw_route_code', rw: 'rw_route_code', M: 'm_route_code', m: 'm_route_code', math: 'm_route_code', Math: 'm_route_code', MATH: 'm_route_code' };

    const { data: allModules } = await supabase
      .from('practice_test_modules')
      .select('id, subject_code, module_number, route_code')
      .eq('practice_test_id', attempt.practice_test_id);

    for (const key of attempt.metadata.submitted_modules) {
      const slash = key.lastIndexOf('/');
      const subj = key.slice(0, slash);
      const modNum = parseInt(key.slice(slash + 1), 10);

      const routeCode =
        modNum === 1
          ? allModules?.find((m) => m.subject_code === subj && m.module_number === 1)?.route_code
          : attempt.metadata?.[subjectRouteField[subj]];

      const modRow = allModules?.find(
        (m) => m.subject_code === subj && m.module_number === modNum && m.route_code === routeCode
      );
      if (!modRow) continue;

      const { data: modItems } = await supabase
        .from('practice_test_module_items')
        .select('ordinal, question_version_id')
        .eq('practice_test_module_id', modRow.id)
        .order('ordinal', { ascending: true });

      for (const item of modItems || []) {
        attemptItems.push({
          subject_code: subj,
          module_number: modNum,
          route_code: routeCode,
          ordinal: item.ordinal,
          question_version_id: item.question_version_id,
        });
      }
    }
  }

  const versionIds = [...new Set(attemptItems.map((i) => i.question_version_id))];

  if (!versionIds.length) {
    return NextResponse.json({ error: 'No attempt items found' }, { status: 404 });
  }

  // Fetch question versions (content)
  const { data: versions } = await supabase
    .from('question_versions')
    .select('id, question_id, stimulus_html, stem_html, question_type, rationale_html')
    .in('id', versionIds);

  const versionMap = {};
  for (const v of versions || []) versionMap[v.id] = v;

  const questionIds = [...new Set((versions || []).map((v) => v.question_id))];

  // Fetch answer options
  const { data: options } = await supabase
    .from('answer_options')
    .select('id, question_version_id, ordinal, label, content_html')
    .in('question_version_id', versionIds)
    .order('ordinal', { ascending: true });

  const optionsByVersion = {};
  for (const o of options || []) {
    if (!optionsByVersion[o.question_version_id]) optionsByVersion[o.question_version_id] = [];
    optionsByVersion[o.question_version_id].push(o);
  }

  // Fetch correct answers
  const { data: correctAnswers } = await supabase
    .from('correct_answers')
    .select('question_version_id, answer_type, correct_option_id, correct_option_ids, correct_text')
    .in('question_version_id', versionIds);

  const correctByVersion = {};
  for (const ca of correctAnswers || []) correctByVersion[ca.question_version_id] = ca;

  // Fetch user's attempts for these questions
  const { data: userAttempts } = await supabase
    .from('attempts')
    .select('question_id, is_correct, selected_option_id, response_text, created_at')
    .eq('user_id', user.id)
    .in('question_id', questionIds)
    .order('created_at', { ascending: false });

  const latestAttempt = {};
  for (const a of userAttempts || []) {
    if (!latestAttempt[a.question_id]) latestAttempt[a.question_id] = a;
  }

  // Fetch taxonomy for domain/skill breakdown
  const { data: taxonomy } = await supabase
    .from('question_taxonomy')
    .select('question_id, domain_name, domain_code, skill_name, skill_code')
    .in('question_id', questionIds);

  const taxByQuestion = {};
  for (const t of taxonomy || []) taxByQuestion[t.question_id] = t;

  // --- Aggregate scores ---
  const sectionStats = {}; // subject_code → { correct, total }
  const domainStats = {};  // domain_name → { correct, total, skill_name }
  const questionReview = [];

  for (const item of attemptItems || []) {
    const version = versionMap[item.question_version_id];
    if (!version) continue;
    const qid = version.question_id;
    const attempt_rec = latestAttempt[qid];
    const is_correct = attempt_rec?.is_correct ?? false;
    const was_answered = !!attempt_rec;
    const tax = taxByQuestion[qid] || {};
    const ca = correctByVersion[item.question_version_id];

    // Section stats
    const subj = item.subject_code;
    if (!sectionStats[subj]) sectionStats[subj] = { correct: 0, total: 0 };
    sectionStats[subj].total += 1;
    if (is_correct) sectionStats[subj].correct += 1;

    // Domain stats
    const domainKey = tax.domain_name || 'Unknown';
    if (!domainStats[domainKey]) {
      domainStats[domainKey] = {
        domain_name: domainKey,
        domain_code: tax.domain_code || null,
        subject_code: subj,
        correct: 0,
        total: 0,
        skills: {},
      };
    }
    domainStats[domainKey].total += 1;
    if (is_correct) domainStats[domainKey].correct += 1;

    const skillKey = tax.skill_name || 'Unknown';
    if (!domainStats[domainKey].skills[skillKey]) {
      domainStats[domainKey].skills[skillKey] = { correct: 0, total: 0, skill_code: tax.skill_code || null };
    }
    domainStats[domainKey].skills[skillKey].total += 1;
    if (is_correct) domainStats[domainKey].skills[skillKey].correct += 1;

    // Question review entry
    questionReview.push({
      subject_code: item.subject_code,
      module_number: item.module_number,
      ordinal: item.ordinal,
      question_version_id: item.question_version_id,
      question_id: qid,
      question_type: version.question_type,
      stimulus_html: version.stimulus_html || null,
      stem_html: version.stem_html,
      options: optionsByVersion[item.question_version_id] || [],
      correct_answer: ca || null,
      was_answered,
      is_correct,
      selected_option_id: attempt_rec?.selected_option_id || null,
      response_text: attempt_rec?.response_text || null,
      domain_name: tax.domain_name || null,
      skill_name: tax.skill_name || null,
      rationale_html: version.rationale_html || null,
    });
  }

  // Build section scores
  const sections = {};
  for (const [subj, stats] of Object.entries(sectionStats)) {
    sections[subj] = {
      ...stats,
      scaled: toScaledScore(stats.correct, stats.total),
    };
  }

  const composite = Object.values(sections).reduce((s, sec) => s + sec.scaled, 0);

  // Flatten domain stats
  const domains = Object.values(domainStats).map((d) => ({
    ...d,
    skills: Object.entries(d.skills).map(([skill_name, s]) => ({ skill_name, ...s })),
  }));

  // Fetch practice test name
  const { data: testData } = await supabase
    .from('practice_tests')
    .select('name, code')
    .eq('id', attempt.practice_test_id)
    .single();

  return NextResponse.json({
    attempt_id: attemptId,
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
  });
}
