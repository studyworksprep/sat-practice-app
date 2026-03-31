import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../lib/supabase/server';

// POST /api/act/questions/bulk-import
// Body: { questions: [ { section, stem_html, options: [...], ... } ] }
// Inserts questions + answer options into the database.
export async function POST(request) {
  const userId = request.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const admin = createServiceClient();
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();
  if (!profile || (profile.role !== 'admin' && profile.role !== 'manager')) {
    return NextResponse.json({ error: 'Only admins and managers can import questions' }, { status: 403 });
  }

  const { questions } = await request.json().catch(() => ({}));
  if (!Array.isArray(questions) || questions.length === 0) {
    return NextResponse.json({ error: 'questions array is required and must not be empty' }, { status: 400 });
  }

  // Validate each question has the minimum required fields
  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.section || !q.stem_html) {
      return NextResponse.json({
        error: `Question ${i + 1} is missing required fields (section, stem_html)`,
      }, { status: 400 });
    }
    if (!Array.isArray(q.options) || q.options.length < 2) {
      return NextResponse.json({
        error: `Question ${i + 1} must have at least 2 answer options`,
      }, { status: 400 });
    }
    const hasCorrect = q.options.some(o => o.is_correct);
    if (!hasCorrect) {
      return NextResponse.json({
        error: `Question ${i + 1} has no correct answer marked`,
      }, { status: 400 });
    }
  }

  try {
    const insertedIds = [];

    // Insert in batches to avoid payload limits
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];

      // Build external_id if source_test + ordinal are present
      const external_id = q.source_test && q.source_ordinal
        ? `${q.source_test}-${String(q.source_ordinal).padStart(3, '0')}`
        : null;

      // Insert the question
      const questionRow = {
        section: q.section,
        category_code: q.category_code || null,
        category: q.category || q.category_code || 'Uncategorized',
        subcategory_code: q.subcategory_code || null,
        subcategory: q.subcategory || null,
        is_modeling: q.is_modeling || false,
        difficulty: q.difficulty || null,
        question_type: 'mcq',
        stimulus_html: q.stimulus_html || null,
        stem_html: q.stem_html,
        rationale_html: q.rationale_html || null,
        source_test: q.source_test || null,
        source_ordinal: q.source_ordinal || null,
        highlight_ref: q.highlight_ref != null ? q.highlight_ref : null,
        is_broken: false,
      };
      if (external_id) questionRow.external_id = external_id;

      const { data: inserted, error: qError } = await admin
        .from('act_questions')
        .insert(questionRow)
        .select('id')
        .single();

      if (qError) {
        return NextResponse.json({
          error: `Failed to insert question ${i + 1}: ${qError.message}`,
        }, { status: 400 });
      }

      const questionId = inserted.id;
      insertedIds.push(questionId);

      // Insert answer options
      const optionRows = q.options.map((o) => ({
        question_id: questionId,
        ordinal: o.ordinal,
        label: o.label,
        content_html: o.content_html || '',
        is_correct: o.is_correct || false,
      }));

      const { error: oError } = await admin
        .from('act_answer_options')
        .insert(optionRows);

      if (oError) {
        return NextResponse.json({
          error: `Failed to insert options for question ${i + 1}: ${oError.message}`,
        }, { status: 400 });
      }
    }

    return NextResponse.json({ ok: true, inserted: insertedIds.length, ids: insertedIds });
  } catch (e) {
    console.error('bulk-import error:', e);
    return NextResponse.json({ error: e.message || 'Failed to import questions' }, { status: 500 });
  }
}
