import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/act/questions
// Params: sections, categories, subcategories, difficulties, q, limit, offset, hide_broken
export async function GET(request) {
  const { searchParams } = new URL(request.url);

  const sections = (searchParams.get('sections') || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  const categories = (searchParams.get('categories') || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  const subcategories = (searchParams.get('subcategories') || '')
    .split(',').map(s => s.trim()).filter(Boolean);

  const difficulties = (searchParams.get('difficulties') || '')
    .split(',').map(s => parseInt(s.trim(), 10)).filter(n => Number.isFinite(n));

  const hide_broken = searchParams.get('hide_broken') === 'true';
  const modeling = searchParams.get('modeling'); // 'true' = only modeling, 'false' = exclude modeling
  const qText = (searchParams.get('q') || '').trim();

  const limit = Math.min(parseInt(searchParams.get('limit') || '25', 10), 5000);
  const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

  const supabase = await createClient();

  // Auth
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 400 });
  const userId = auth?.user?.id ?? null;

  // Build query
  let q = supabase
    .from('act_questions')
    .select('id, external_id, section, category_code, category, subcategory_code, subcategory, difficulty, question_type, stem_html, stimulus_html, is_broken, is_modeling, source_test', { count: 'exact' })
    .order('section')
    .order('source_test')
    .order('source_ordinal');

  if (sections.length > 0) q = q.in('section', sections);

  // Category/subcategory: OR logic when both present (like SAT domain/topic),
  // so selecting a category picks up all its questions including those without subcategory_code
  if (categories.length > 0 && subcategories.length > 0) {
    const catCsv = categories.map(c => `"${c}"`).join(',');
    const subCsv = subcategories.map(s => `"${s}"`).join(',');
    q = q.or(`category_code.in.(${catCsv}),subcategory_code.in.(${subCsv})`);
  } else if (categories.length > 0) {
    q = q.in('category_code', categories);
  } else if (subcategories.length > 0) {
    q = q.in('subcategory_code', subcategories);
  }
  if (difficulties.length > 0) q = q.in('difficulty', difficulties);
  if (hide_broken) q = q.eq('is_broken', false);
  if (modeling === 'true') q = q.eq('is_modeling', true);
  else if (modeling === 'false') q = q.eq('is_modeling', false);

  // Text search on external_id or stem_html
  if (qText) {
    const safe = qText.replace(/[%_]/g, '\\$&');
    const pattern = `%${safe}%`;
    q = q.or(`external_id.ilike.${pattern},stem_html.ilike.${pattern},stimulus_html.ilike.${pattern}`);
  }

  q = q.range(offset, offset + limit - 1);

  const { data, error, count } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // If user is logged in, fetch their attempt history for these questions
  let attemptMap = {};
  if (userId && data && data.length > 0) {
    const qIds = data.map(r => r.id);
    const { data: attempts } = await supabase
      .from('act_attempts')
      .select('question_id, is_correct, created_at')
      .eq('user_id', userId)
      .in('question_id', qIds)
      .order('created_at', { ascending: false });

    if (attempts) {
      for (const a of attempts) {
        if (!attemptMap[a.question_id]) {
          attemptMap[a.question_id] = { is_done: true, last_is_correct: a.is_correct, attempts_count: 0 };
        }
        attemptMap[a.question_id].attempts_count++;
      }
    }
  }

  const items = (data || []).map((row) => ({
    question_id: row.id,
    external_id: row.external_id,
    section: row.section,
    category_code: row.category_code,
    category: row.category,
    subcategory_code: row.subcategory_code,
    subcategory: row.subcategory,
    difficulty: row.difficulty,
    question_type: row.question_type,
    is_broken: row.is_broken,
    is_modeling: row.is_modeling,
    source_test: row.source_test,
    is_done: attemptMap[row.id]?.is_done ?? false,
    last_is_correct: attemptMap[row.id]?.last_is_correct ?? null,
    attempts_count: attemptMap[row.id]?.attempts_count ?? 0,
  }));

  return NextResponse.json({ items, totalCount: count ?? items.length });
}
