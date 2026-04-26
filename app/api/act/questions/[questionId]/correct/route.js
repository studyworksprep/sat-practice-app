import { NextResponse } from 'next/server';
import { requireServiceRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// POST /api/act/questions/:questionId/correct
// Admin/Manager: update ACT question content & taxonomy fields, flag as broken.
export const POST = legacyApiRoute(async (request, props) => {
  const params = await props.params;
  const questionId = params.questionId;

  const { service: admin } = await requireServiceRole(
    'manager/admin ACT question correction',
    { allowedRoles: ['admin', 'manager'] },
  );

  const body = await request.json().catch(() => ({}));
  const { stimulus_html, stem_html, rationale_html, options, flag_broken, taxonomy } = body || {};

  // Update act_questions fields if provided
  const questionPatch = {};
  if (typeof stimulus_html === 'string') questionPatch.stimulus_html = stimulus_html;
  if (typeof stem_html === 'string') questionPatch.stem_html = stem_html;
  if (typeof rationale_html === 'string') questionPatch.rationale_html = rationale_html;

  // Taxonomy fields live directly on act_questions
  if (taxonomy && typeof taxonomy === 'object') {
    if (taxonomy.difficulty !== undefined) questionPatch.difficulty = Number(taxonomy.difficulty) || null;
    if (typeof taxonomy.section === 'string') questionPatch.section = taxonomy.section;
    if (typeof taxonomy.category_code === 'string') questionPatch.category_code = taxonomy.category_code;
    if (typeof taxonomy.category === 'string') questionPatch.category = taxonomy.category;
    if (typeof taxonomy.subcategory_code === 'string') questionPatch.subcategory_code = taxonomy.subcategory_code;
    if (typeof taxonomy.subcategory === 'string') questionPatch.subcategory = taxonomy.subcategory;
    if (taxonomy.is_modeling !== undefined) questionPatch.is_modeling = Boolean(taxonomy.is_modeling);
  }

  if (Object.keys(questionPatch).length > 0) {
    const { error } = await admin
      .from('act_questions')
      .update(questionPatch)
      .eq('id', questionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Update answer options if provided (keyed by option id)
  if (options && typeof options === 'object') {
    for (const [optionId, contentHtml] of Object.entries(options)) {
      if (typeof contentHtml !== 'string') continue;
      const { error } = await admin
        .from('act_answer_options')
        .update({ content_html: contentHtml })
        .eq('id', optionId)
        .eq('question_id', questionId);
      if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  // Flag/unflag broken
  if (flag_broken !== undefined) {
    const { error } = await admin
      .from('act_questions')
      .update({ is_broken: Boolean(flag_broken) })
      .eq('id', questionId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
});
