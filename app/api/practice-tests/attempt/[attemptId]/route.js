import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';

// GET /api/practice-tests/attempt/[attemptId]
// Returns current module state for the active session.
// Module order: rw/1 → rw/2 → math/1 → math/2
// "Active" = first module with no submitted practice_test_attempt_items
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

  // Which modules have been submitted already?
  const { data: submittedItems } = await supabase
    .from('practice_test_attempt_items')
    .select('subject_code, module_number')
    .eq('practice_test_attempt_id', attemptId);

  const submitted = new Set(
    (submittedItems || []).map((i) => `${i.subject_code}/${i.module_number}`)
  );

  // Determine active module in order
  const MODULE_ORDER = [
    { subject_code: 'rw',   module_number: 1, routeField: null },
    { subject_code: 'rw',   module_number: 2, routeField: 'rw_route_code' },
    { subject_code: 'math', module_number: 1, routeField: null },
    { subject_code: 'math', module_number: 2, routeField: 'm_route_code' },
  ];

  let activeModule = null;
  for (const mod of MODULE_ORDER) {
    const key = `${mod.subject_code}/${mod.module_number}`;
    if (!submitted.has(key)) {
      activeModule = mod;
      break;
    }
  }

  if (!activeModule) {
    // All modules submitted but status not yet 'completed' — treat as done
    return NextResponse.json({ status: 'completed' });
  }

  // Determine route_code for this module
  let route_code = null;
  if (activeModule.module_number === 1) {
    // Module 1 has a single fixed route; find it
    const { data: mod1 } = await supabase
      .from('practice_test_modules')
      .select('route_code, time_limit_seconds')
      .eq('practice_test_id', attempt.practice_test_id)
      .eq('subject_code', activeModule.subject_code)
      .eq('module_number', 1)
      .single();
    route_code = mod1?.route_code ?? null;
    activeModule = { ...activeModule, time_limit_seconds: mod1?.time_limit_seconds ?? null };
  } else {
    // Module 2: route determined by previous submission
    route_code = attempt[activeModule.routeField] ?? null;
    if (!route_code) {
      return NextResponse.json({ error: 'Module 2 route not yet determined' }, { status: 400 });
    }
    const { data: mod2 } = await supabase
      .from('practice_test_modules')
      .select('time_limit_seconds')
      .eq('practice_test_id', attempt.practice_test_id)
      .eq('subject_code', activeModule.subject_code)
      .eq('module_number', 2)
      .eq('route_code', route_code)
      .single();
    activeModule = { ...activeModule, time_limit_seconds: mod2?.time_limit_seconds ?? null };
  }

  // Fetch module id
  const { data: moduleRow } = await supabase
    .from('practice_test_modules')
    .select('id')
    .eq('practice_test_id', attempt.practice_test_id)
    .eq('subject_code', activeModule.subject_code)
    .eq('module_number', activeModule.module_number)
    .eq('route_code', route_code)
    .single();

  if (!moduleRow) {
    return NextResponse.json({ error: 'Module not found in test' }, { status: 404 });
  }

  // Fetch module items (ordered)
  const { data: items } = await supabase
    .from('practice_test_module_items')
    .select('ordinal, question_version_id')
    .eq('practice_test_module_id', moduleRow.id)
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

    // Keep most recent answer per question
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
    subject_code: activeModule.subject_code,
    module_number: activeModule.module_number,
    route_code,
    time_limit_seconds: activeModule.time_limit_seconds,
    questions,
  });
}
