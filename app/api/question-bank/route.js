import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const supabase = createClient();

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  const program = searchParams.get('program') || 'SAT';
  const domain_name = searchParams.get('domain_name') || null;
  const skill_name = searchParams.get('skill_name') || null;
  const difficulty = searchParams.get('difficulty') || null;
  const score_band = searchParams.get('score_band') || null;
  const question_type = searchParams.get('question_type') || null;
  const status = searchParams.get('status') || null;

  const sort = searchParams.get('sort') || 'difficulty';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '25', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    // 1️⃣ Base query: taxonomy only
    let taxonomyQuery = supabase
      .from('question_taxonomy')
      .select('*', { count: 'exact' })
      .eq('program', program);

    if (domain_name) taxonomyQuery = taxonomyQuery.eq('domain_name', domain_name);
    if (skill_name) taxonomyQuery = taxonomyQuery.eq('skill_name', skill_name);
    if (difficulty) taxonomyQuery = taxonomyQuery.eq('difficulty', Number(difficulty));
    if (score_band) taxonomyQuery = taxonomyQuery.eq('score_band', Number(score_band));

    if (sort === 'score_band') {
      taxonomyQuery = taxonomyQuery.order('score_band').order('difficulty');
    } else if (sort === 'topic') {
      taxonomyQuery = taxonomyQuery.order('skill_name').order('difficulty');
    } else {
      taxonomyQuery = taxonomyQuery.order('difficulty').order('score_band');
    }

    taxonomyQuery = taxonomyQuery.range(from, to);

    const { data: taxonomyRows, count, error } = await taxonomyQuery;
    if (error) throw error;

    const questionIds = taxonomyRows.map(r => r.question_id);

    if (questionIds.length === 0) {
      return NextResponse.json({
        total: count ?? 0,
        page,
        page_size: pageSize,
        items: [],
        first_question_id: null,
      });
    }

    // 2️⃣ Fetch current versions
    let versionsQuery = supabase
      .from('question_versions')
      .select('question_id, question_type')
      .in('question_id', questionIds)
      .eq('is_current', true);

    if (question_type) {
      versionsQuery = versionsQuery.eq('question_type', question_type);
    }

    const { data: versions } = await versionsQuery;

    const versionMap = new Map();
    (versions || []).forEach(v => {
      versionMap.set(v.question_id, v.question_type);
    });

    // 3️⃣ Fetch user status (if logged in)
    let statusMap = new Map();

    if (user) {
      const { data: statuses } = await supabase
        .from('question_status')
        .select('question_id, is_done, marked_for_review, last_is_correct')
        .eq('user_id', user.id)
        .in('question_id', questionIds);

      (statuses || []).forEach(s => {
        statusMap.set(s.question_id, s);
      });
    }

    // 4️⃣ Merge
    const items = taxonomyRows
      .filter(row => versionMap.has(row.question_id))
      .map(row => {
        const st = statusMap.get(row.question_id);

        return {
          question_id: row.question_id,
          domain_code: row.domain_code,
          domain_name: row.domain_name,
          skill_code: row.skill_code,
          skill_name: row.skill_name,
          difficulty: row.difficulty,
          score_band: row.score_band,
          question_type: versionMap.get(row.question_id) ?? null,
          is_done: st?.is_done ?? false,
          marked_for_review: st?.marked_for_review ?? false,
          last_is_correct: st?.last_is_correct ?? null,
        };
      });

    return NextResponse.json({
      total: count ?? 0,
      page,
      page_size: pageSize,
      items,
      first_question_id: items?.[0]?.question_id ?? null,
    });

  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
