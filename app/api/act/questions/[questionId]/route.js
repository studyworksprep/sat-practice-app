import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/act/questions/:questionId
export const GET = legacyApiRoute(async (_request, props) => {
  const params = await props.params;
  const questionId = params.questionId;
  const { user, supabase } = await requireUser();
  const userId = user.id;

  const [questionResult, optionsResult] = await Promise.all([
    supabase
      .from('act_questions')
      .select('id, external_id, section, category_code, category, subcategory_code, subcategory, difficulty, question_type, stimulus_html, stem_html, rationale_html, is_broken, is_modeling, source_test, source_ordinal, highlight_ref')
      .eq('id', questionId)
      .maybeSingle(),
    supabase
      .from('act_answer_options')
      .select('id, ordinal, label, content_html, is_correct')
      .eq('question_id', questionId)
      .order('ordinal', { ascending: true }),
  ]);

  const { data: question, error: qErr } = questionResult;
  if (qErr) return NextResponse.json({ error: qErr.message }, { status: 400 });
  if (!question) return NextResponse.json({ error: 'Question not found' }, { status: 404 });

  const { data: options, error: optErr } = optionsResult;
  if (optErr) return NextResponse.json({ error: optErr.message }, { status: 400 });

  // Fetch user's most recent attempt (if any)
  const { data: lastAttempt } = await supabase
    .from('act_attempts')
    .select('id, selected_option_id, is_correct, created_at')
    .eq('user_id', userId)
    .eq('question_id', questionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const is_done = !!lastAttempt;

  // Only reveal correct answers after the user has answered
  const safeOptions = (options || []).map(o => ({
    id: o.id,
    ordinal: o.ordinal,
    label: o.label,
    content_html: o.content_html,
    is_correct: is_done ? o.is_correct : undefined,
  }));

  // Find correct option id for post-answer reveal
  const correctOption = is_done ? (options || []).find(o => o.is_correct) : null;

  return NextResponse.json({
    question_id: question.id,
    external_id: question.external_id,
    section: question.section,
    category_code: question.category_code,
    category: question.category,
    subcategory_code: question.subcategory_code,
    subcategory: question.subcategory,
    difficulty: question.difficulty,
    question_type: question.question_type,
    stimulus_html: question.stimulus_html,
    stem_html: question.stem_html,
    rationale_html: question.rationale_html,
    is_broken: question.is_broken,
    is_modeling: question.is_modeling,
    source_test: question.source_test,
    options: safeOptions,
    status: lastAttempt ? {
      is_done: true,
      last_is_correct: lastAttempt.is_correct,
      last_selected_option_id: lastAttempt.selected_option_id,
    } : null,
    correct_option_id: correctOption?.id ?? null,
  });
});
