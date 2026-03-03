import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';

// POST /api/practice-tests/attempt/[attemptId]/submit-module
// Body: { subject_code, module_number, route_code, answers: [{question_version_id, question_id, selected_option_id?, response_text?}] }
// Grades answers, records attempt_items, applies routing rules, advances attempt state.
export async function POST(request, { params }) {
  const { attemptId } = params;
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { subject_code, module_number, route_code, answers = [] } = body;

  if (!subject_code || !module_number || !route_code) {
    return NextResponse.json({ error: 'subject_code, module_number, route_code required' }, { status: 400 });
  }

  // Verify attempt ownership — filter by user_id explicitly so this works
  // regardless of whether a RLS SELECT policy exists for this table.
  const { data: attempt, error: attErr } = await supabase
    .from('practice_test_attempts')
    .select('id, practice_test_id, user_id, status, metadata')
    .eq('id', attemptId)
    .eq('user_id', user.id)
    .maybeSingle();

  if (attErr) return NextResponse.json({ error: attErr.message }, { status: 500 });
  if (!attempt) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (attempt.status === 'completed') return NextResponse.json({ error: 'Already completed' }, { status: 400 });

  // Fetch ALL modules for this test — avoids .single() failures and gives us
  // everything needed for the module row lookup, ordering, and route-field mapping
  const { data: allModules, error: modErr } = await supabase
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', attempt.practice_test_id)
    .order('subject_code', { ascending: true })
    .order('module_number', { ascending: true });

  if (modErr || !allModules?.length) {
    return NextResponse.json({ error: 'No modules found for this test' }, { status: 404 });
  }

  // Derive unique subject codes — RW first, Math second (DB stores 'RW' and 'M')
  const allSubjects = new Set(allModules.map((m) => m.subject_code));
  const SUBJECT_PRIORITY = ['RW', 'rw', 'M', 'm', 'math', 'Math'];
  const sortedSubjects = [
    ...SUBJECT_PRIORITY.filter((s) => allSubjects.has(s)),
    ...[...allSubjects].filter((s) => !SUBJECT_PRIORITY.includes(s)).sort(),
  ];

  // Name-based route field mapping (matches DB column semantics)
  const subjectRouteField = { RW: 'rw_route_code', rw: 'rw_route_code', M: 'm_route_code', m: 'm_route_code', math: 'm_route_code', Math: 'm_route_code' };

  // Find the module row without .single()
  const moduleRow = allModules.find(
    (m) =>
      m.subject_code === subject_code &&
      m.module_number === module_number &&
      m.route_code === route_code
  ) ?? null;

  if (!moduleRow) return NextResponse.json({ error: 'Module not found' }, { status: 404 });

  const { data: moduleItems } = await supabase
    .from('practice_test_module_items')
    .select('ordinal, question_version_id')
    .eq('practice_test_module_id', moduleRow.id)
    .order('ordinal', { ascending: true });

  // Build answer lookup by question_version_id
  const answerByVersion = {};
  for (const a of answers) {
    answerByVersion[a.question_version_id] = a;
  }

  // Fetch correct answers for all question versions in this module
  const versionIds = (moduleItems || []).map((i) => i.question_version_id);
  const { data: correctAnswers } = await supabase
    .from('correct_answers')
    .select('question_version_id, answer_type, correct_option_id, correct_option_ids, correct_text, correct_number, numeric_tolerance')
    .in('question_version_id', versionIds);

  const correctByVersion = {};
  for (const ca of correctAnswers || []) correctByVersion[ca.question_version_id] = ca;

  // Get question_id for each version
  const { data: versions } = await supabase
    .from('question_versions')
    .select('id, question_id')
    .in('id', versionIds);

  const versionToQid = {};
  for (const v of versions || []) versionToQid[v.id] = v.question_id;

  // Grade answers and insert into attempts table
  let correctCount = 0;
  const now = new Date().toISOString();

  for (const item of moduleItems || []) {
    const ans = answerByVersion[item.question_version_id];
    if (!ans || (!ans.selected_option_id && !ans.response_text)) continue;

    const ca = correctByVersion[item.question_version_id];
    const questionId = ans.question_id || versionToQid[item.question_version_id];
    if (!questionId) continue;

    let is_correct = false;
    if (ca) {
      if (ca.answer_type === 'mcq' || ca.answer_type === 'single') {
        is_correct = ca.correct_option_id === ans.selected_option_id;
      } else if (ca.answer_type === 'multi') {
        const userSet = new Set([ans.selected_option_id].filter(Boolean));
        const corrSet = new Set(ca.correct_option_ids || []);
        is_correct = userSet.size === corrSet.size && [...userSet].every((id) => corrSet.has(id));
      } else if (ca.answer_type === 'text') {
        const norm = (s) => (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
        is_correct = norm(ca.correct_text) === norm(ans.response_text);
      } else if (ca.answer_type === 'number') {
        const parsed = parseFloat(ans.response_text);
        if (!isNaN(parsed)) {
          const tol = parseFloat(ca.numeric_tolerance) || 0;
          is_correct = Math.abs(parsed - parseFloat(ca.correct_number)) <= tol;
        }
      }
    }

    if (is_correct) correctCount += 1;

    await supabase.from('attempts').insert({
      user_id: user.id,
      question_id: questionId,
      is_correct,
      selected_option_id: ans.selected_option_id || null,
      response_text: ans.response_text || null,
      created_at: now,
    });
  }

  // Insert practice_test_attempt_items for every question in this module
  const attemptItemRows = (moduleItems || []).map((item) => ({
    practice_test_attempt_id: attemptId,
    subject_code,
    module_number,
    route_code,
    ordinal: item.ordinal,
    question_version_id: item.question_version_id,
  }));

  if (attemptItemRows.length > 0) {
    await supabase.from('practice_test_attempt_items').insert(attemptItemRows);
  }

  // Apply routing rules if this was module 1
  let nextRouteCode = null;
  if (module_number === 1) {
    const { data: rules } = await supabase
      .from('practice_test_routing_rules')
      .select('metric, operator, threshold, to_route_code')
      .eq('practice_test_id', attempt.practice_test_id)
      .eq('subject_code', subject_code)
      .eq('from_module_number', 1);

    for (const rule of rules || []) {
      const metricValue = correctCount; // currently only 'correct_count' metric is supported
      const t = parseFloat(rule.threshold);
      let matches = false;
      if (rule.operator === '>=') matches = metricValue >= t;
      else if (rule.operator === '>') matches = metricValue > t;
      else if (rule.operator === '<=') matches = metricValue <= t;
      else if (rule.operator === '<') matches = metricValue < t;
      else if (rule.operator === '==' || rule.operator === '=') matches = metricValue === t;
      if (matches) { nextRouteCode = rule.to_route_code; break; }
    }

    // If no routing rule matched, fall back to first available module-2 route for this subject
    if (!nextRouteCode) {
      const fallback = allModules.find(
        (m) => m.subject_code === subject_code && m.module_number === 2
      );
      nextRouteCode = fallback?.route_code ?? null;
    }

  }

  // Always record the submitted module + route code in metadata.
  // This is the primary source for tracking progress (immune to RLS issues on
  // practice_test_attempt_items which has no user_id column).
  const currentMeta = attempt.metadata || {};
  const submittedMods = Array.isArray(currentMeta.submitted_modules) ? currentMeta.submitted_modules : [];
  const moduleKey = `${subject_code}/${module_number}`;
  let metaUpdate = {
    ...currentMeta,
    submitted_modules: submittedMods.includes(moduleKey)
      ? submittedMods
      : [...submittedMods, moduleKey],
  };
  if (module_number === 1) {
    const metaKey = subjectRouteField[subject_code];
    if (metaKey && nextRouteCode) metaUpdate = { ...metaUpdate, [metaKey]: nextRouteCode };
  }
  await supabase
    .from('practice_test_attempts')
    .update({ metadata: metaUpdate })
    .eq('id', attemptId);

  // Determine if this was the last module (final subject, module 2)
  const lastSubject = sortedSubjects.at(-1);
  const isLast = subject_code === lastSubject && module_number === 2;

  if (isLast) {
    await supabase
      .from('practice_test_attempts')
      .update({ status: 'completed', finished_at: now })
      .eq('id', attemptId);
    return NextResponse.json({ is_complete: true });
  }

  // Determine next module from the dynamic order
  const MODULE_ORDER = sortedSubjects.flatMap((subj) => [
    { subject_code: subj, module_number: 1 },
    { subject_code: subj, module_number: 2 },
  ]);
  const currentIdx = MODULE_ORDER.findIndex(
    (m) => m.subject_code === subject_code && m.module_number === module_number
  );
  const next = MODULE_ORDER[currentIdx + 1];

  return NextResponse.json({
    is_complete: false,
    next_subject: next?.subject_code,
    next_module_number: next?.module_number,
    next_route_code: nextRouteCode,
    correct_count: correctCount,
    total_count: (moduleItems || []).length,
  });
}
