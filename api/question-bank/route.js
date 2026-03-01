import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// GET /api/question-bank
// Query params:
// program, domain_name, skill_name, difficulty, score_band, question_type, status
// sort: difficulty|score_band|topic
// page (1-based), page_size
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const supabase = createClient();

  // Auth is optional (used only for per-user status badges + status filter)
  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user ?? null;

  const program = searchParams.get('program') || 'SAT';
  const domain_name = searchParams.get('domain_name') || null;
  const skill_name = searchParams.get('skill_name') || null;
  const difficulty = searchParams.get('difficulty') || null; // 1-3
  const score_band = searchParams.get('score_band') || null; // 1-7
  const question_type = searchParams.get('question_type') || null; // mcq|spr

  // Optional status filter (meaningful only if logged in)
  const status = searchParams.get('status') || null;

  const sort = searchParams.get('sort') || 'difficulty';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('page_size') || '25', 10)));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  try {
    // Base: taxonomy for sorting/filtering fields
    // Join: current question_version for question_type
    // Optional join: question_status for this user (badges + filtering)
    let q = supabase
      .from('question_taxonomy')
      .select(
        `
          question_id,
          program,
          domain_code,
          domain_name,
          skill_code,
          skill_name,
          difficulty,
          score_band,
          question_versions!inner(question_type, is_current),
          question_status(user_id, question_id, is_done, marked_for_review, last_is_correct)
        `,
        { count: 'exact' }
      )
      .eq('program', program)
      .eq('question_versions.is_current', true);

    if (domain_name) q = q.eq('domain_name', domain_name);
    if (skill_name) q = q.eq('skill_name', skill_name);
    if (difficulty) q = q.eq('difficulty', Number(difficulty));
    if (score_band) q = q.eq('score_band', Number(score_band));
    if (question_type) q = q.eq('question_versions.question_type', question_type);

    // If logged in, restrict embedded status rows to this user
    if (user) q = q.eq('question_status.user_id', user.id);

    // Optional status filter
    if (status && user) {
      if (status === 'unattempted') {
        // includes null status rows and explicit false
        q = q.or('question_status.is_done.is.null,question_status.is_done.eq.false');
      } else if (status === 'done') {
        q = q.eq('question_status.is_done', true);
      } else if (status === 'marked') {
        q = q.eq('question_status.marked_for_review', true);
      } else if (status === 'correct') {
        q = q.eq('question_status.last_is_correct', true);
      } else if (status === 'incorrect') {
        q = q.eq('question_status.last_is_correct', false);
      }
    }

    // Sorting
    if (sort === 'score_band') {
      q = q.order('score_band', { ascending: true, nullsFirst: false })
           .order('difficulty', { ascending: true })
           .order('skill_name', { ascending: true, nullsFirst: false });
    } else if (sort === 'topic') {
      q = q.order('skill_name', { ascending: true, nullsFirst: false })
           .order('difficulty', { ascending: true })
           .order('score_band', { ascending: true, nullsFirst: false });
    } else {
      // difficulty default
      q = q.order('difficulty', { ascending: true })
           .order('score_band', { ascending: true, nullsFirst: false })
           .order('skill_name', { ascending: true, nullsFirst: false });
    }

    // Pagination
    q = q.range(from, to);

    const { data, error, count } = await q;
    if (error) throw error;

    const items = (data || []).map((r) => {
      const qv = Array.isArray(r.question_versions) ? r.question_versions[0] : null;
      const st = Array.isArray(r.question_status) ? r.question_status[0] : null;

      return {
        question_id: r.question_id,
        program: r.program,
        domain_code: r.domain_code,
        domain_name: r.domain_name,
        skill_code: r.skill_code,
        skill_name: r.skill_name,
        difficulty: r.difficulty,
        score_band: r.score_band,
        question_type: qv?.question_type ?? null,

        // user-specific (null/false if not authed)
        is_done: st?.is_done ?? false,
        marked_for_review: st?.marked_for_review ?? false,
        last_is_correct: st?.last_is_correct ?? null,
      };
    });

    return NextResponse.json({
      page,
      page_size: pageSize,
      total: count ?? 0,
      items,
      first_question_id: items?.[0]?.question_id ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 400 });
  }
}
