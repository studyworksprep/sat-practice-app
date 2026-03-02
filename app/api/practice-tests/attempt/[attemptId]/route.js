import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

// GET /api/practice-tests/attempt/[attemptId]
// Returns current module state for the active session.
// "Active" = first module (in subject/module order) with no submitted practice_test_attempt_items.
// Fetches all practice_test_modules in one query to avoid .single() failures
// and redundant round-trips.
export async function GET(_request, { params }) {
  const { attemptId } = params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // Fetch attempt
  const { data: attempt, error: attErr } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, user_id, status, rw_route_code, m_route_code, started_at, completed_at')
    .eq('id', attemptId)
    .single();

  if (attErr || !attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.user_id !== user.id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (attempt.status === 'completed') {
    return NextResponse.json({ status: 'completed' });
  }

  // Fetch ALL modules for this test at once — avoids .single() failures and
  // the separate redundant "fetch module id" query
  const { data: allModules, error: modErr } = await supabase
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code, time_limit_seconds')
    .eq('practice_test_id', attempt.practice_test_id)
    .order('subject_code', { ascending: true })
    .order('module_number', { ascending: true })
    .order('created_at', { ascending: true });

  if (modErr || !allModules?.length) {
    return NextResponse.json({ error: 'No modules found for this test' }, { status: 404 });
  }

  // Derive unique subject codes from actual DB data (sorted for consistent ordering)
  const sortedSubjects = [...new Set(allModules.map((m) => m.subject_code))].sort();

  // Map subject → which route field on practice_test_attempts
  // First subject alphabetically → rw_route_code, second → m_route_code
  const subjectRouteField = {};
  if (sortedSubjects[0]) subjectRouteField[sortedSubjects[0]] = 'rw_route_code';
  if (sortedSubjects[1]) subjectRouteField[sortedSubjects[1]] = 'm_route_code';

  // Build the module progression order from actual subject codes
  const MODULE_ORDER = sortedSubjects.flatMap((subj) => [
    { subject_code: subj, module_number: 1 },
    { subject_code: subj, module_number: 2 },
  ]);

  // Which modules have already been submitted?
  const { data: submittedItems } = await supabase
    .from('practice_test_attempt_items')
    .select('subject_code, module_number')
    .eq('practice_test_attempt_id', attemptId);

  const submitted = new Set(
    (submittedItems || []).map((i) => `${i.subject_code}/${i.module_number}`)
  );

  // Find the first module in order that hasn't been submitted
  let activeSpec = null;
  for (const mod of MODULE_ORDER) {
    if (!submitted.has(`${mod.subject_code}/${mod.module_number}`)) {
      activeSpec = mod;
      break;
    }
  }

  if (!activeSpec) {
    return NextResponse.json({ status: 'completed' });
  }

  // Determine route_code for the active module
  let activeModuleRow = null;
  if (activeSpec.module_number === 1) {
    // Module 1: take the first row for this subject+module_number (no route ambiguity)
    activeModuleRow = allModules.find(
      (m) => m.subject_code === activeSpec.subject_code && m.module_number === 1
    ) ?? null;
  } else {
    // Module 2: route is stored in the attempt after module 1 was submitted
    const routeField = subjectRouteField[activeSpec.subject_code];
    const route_code = routeField ? attempt[routeField] : null;
    if (!route_code) {
      return NextResponse.json({ error: 'Module 2 route not yet determined' }, { status: 400 });
    }
    activeModuleRow = allModules.find(
      (m) =>
        m.subject_code === activeSpec.subject_code &&
        m.module_number === 2 &&
        m.route_code === route_code
    ) ?? null;
  }

  if (!activeModuleRow) {
    return NextResponse.json({ error: 'Module not found in test' }, { status: 404 });
  }

  // Fetch module items (ordered)
  const { data: items } = await supabase
    .from('practice_test_module_items')
    .select('ordinal, question_version_id')
    .eq('practice_test_module_id', activeModuleRow.id)
    .order('ordinal', { ascending: true });

  const versionIds = (items || []).map((i) => i.question_version_id);

  if (!versionIds.length) {
    return NextResponse.json({ error: 'No questions in module' }, { status: 404 });
  }

  // Fetch question version content
  const { data: versions } = await supabase
    .from('question_versions')
    .select('id, question_id, stimulus_html, stem_html, question_type')
    .in('id', versionIds);

  // Fetch answer options
  const { data: options } = await supabase
    .from('answer_options')
    .select('id, question_version_id, ordinal, label, content_html')
    .in('question_version_id', versionIds)
    .order('ordinal', { ascending: true });

  // Fetch saved answers (from existing attempts) for resume
  const questionIds = (versions || []).map((v) => v.question_id);
  let savedAnswers = {};
  if (questionIds.length > 0) {
    const { data: existingAttempts } = await supabase
      .from('attempts')
      .select('question_id, selected_option_id, response_text, created_at')
      .eq('user_id', user.id)
      .in('question_id', questionIds)
      .order('created_at', { ascending: false });

    for (const a of existingAttempts || []) {
      if (!savedAnswers[a.question_id]) {
        savedAnswers[a.question_id] = {
          selected_option_id: a.selected_option_id,
          response_text: a.response_text,
        };
      }
    }
  }

  // Assemble questions array
  const versionMap = {};
  for (const v of versions || []) versionMap[v.id] = v;

  const optionsByVersion = {};
  for (const o of options || []) {
    if (!optionsByVersion[o.question_version_id]) optionsByVersion[o.question_version_id] = [];
    optionsByVersion[o.question_version_id].push(o);
  }

  const questions = (items || []).map((item) => {
    const v = versionMap[item.question_version_id] || {};
    const saved = savedAnswers[v.question_id] || null;
    return {
      ordinal: item.ordinal,
      question_version_id: item.question_version_id,
      question_id: v.question_id,
      question_type: v.question_type,
      stimulus_html: v.stimulus_html || null,
      stem_html: v.stem_html,
      options: optionsByVersion[item.question_version_id] || [],
      saved_answer: saved,
    };
  });

  return NextResponse.json({
    attempt_id: attemptId,
    practice_test_id: attempt.practice_test_id,
    subject_code: activeModuleRow.subject_code,
    module_number: activeModuleRow.module_number,
    route_code: activeModuleRow.route_code,
    time_limit_seconds: activeModuleRow.time_limit_seconds,
    questions,
  });
}
