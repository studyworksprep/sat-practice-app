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

  // Fetch attempt — filter by both id and user_id so this works regardless
  // of whether a RLS SELECT policy exists for this table.
  const { data: attempt, error: attErr } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, user_id, status, metadata, started_at, finished_at')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });

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
    .order('module_number', { ascending: true });

  if (modErr || !allModules?.length) {
    return NextResponse.json({ error: 'No modules found for this test' }, { status: 404 });
  }

  // Derive unique subject codes — RW first, Math second (DB stores 'RW' and 'MATH')
  const allSubjects = new Set(allModules.map((m) => m.subject_code));
  const SUBJECT_PRIORITY = ['RW', 'rw', 'M', 'm', 'math', 'Math', 'MATH'];
  const sortedSubjects = [
    ...SUBJECT_PRIORITY.filter((s) => allSubjects.has(s)),
    ...[...allSubjects].filter((s) => !SUBJECT_PRIORITY.includes(s)).sort(),
  ];

  // Name-based route field mapping (matches DB column semantics)
  const subjectRouteField = { RW: 'rw_route_code', rw: 'rw_route_code', M: 'm_route_code', m: 'm_route_code', math: 'm_route_code', Math: 'm_route_code', MATH: 'm_route_code' };

  // Build the module progression order from actual subject codes
  const MODULE_ORDER = sortedSubjects.flatMap((subj) => [
    { subject_code: subj, module_number: 1 },
    { subject_code: subj, module_number: 2 },
  ]);

  // Which modules have already been submitted?
  // Primary: metadata.submitted_modules — written by submit-module, no RLS concerns.
  // Secondary: practice_test_attempt_items — fallback for attempts created before this fix.
  const submittedFromMeta = Array.isArray(attempt.metadata?.submitted_modules)
    ? attempt.metadata.submitted_modules
    : [];

  const { data: submittedItems } = await supabase
    .from('practice_test_attempt_items')
    .select('subject_code, module_number')
    .eq('practice_test_attempt_id', attemptId);

  const submitted = new Set([
    ...submittedFromMeta,
    ...(submittedItems || []).map((i) => `${i.subject_code}/${i.module_number}`),
  ]);

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
    // Module 2: route is stored in the attempt metadata after module 1 was submitted
    const metaKey = subjectRouteField[activeSpec.subject_code];
    const route_code = metaKey ? (attempt.metadata?.[metaKey] ?? null) : null;
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
    return {
      ordinal: item.ordinal,
      question_version_id: item.question_version_id,
      question_id: v.question_id,
      question_type: v.question_type,
      stimulus_html: v.stimulus_html && v.stimulus_html !== 'NULL' ? v.stimulus_html : null,
      stem_html: v.stem_html,
      options: optionsByVersion[item.question_version_id] || [],
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
