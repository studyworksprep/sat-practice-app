'use server';

import { requireRole } from '@/lib/api/auth';
import { actionFail, actionOk, ApiError } from '@/lib/api/response';

const QUESTION_CARD_COLUMNS =
  'id, display_code, question_type, domain_name, skill_name, difficulty, score_band, stem_html';

async function teachingStaffContext() {
  return requireRole(['teacher', 'manager', 'admin']);
}

/** Shared read-only question lookup for the admin and tutor lesson editors. */
export async function searchLessonEditorQuestions(input: {
  q?: string;
  domain?: string;
  skill?: string;
  questionType?: string;
}) {
  let ctx;
  try {
    ctx = await teachingStaffContext();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }

  let query = ctx.supabase
    .from('questions_v2')
    .select(QUESTION_CARD_COLUMNS, { count: 'exact' })
    .eq('is_published', true)
    .eq('is_broken', false);

  const q = (input?.q ?? '').trim();
  if (q) {
    const safe = q.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/[()]/g, '');
    query = query.or(`display_code.ilike.%${safe}%,stem_html.ilike.%${safe}%`);
  }
  if (input?.domain) query = query.eq('domain_name', input.domain);
  if (input?.skill) query = query.eq('skill_name', input.skill);
  if (input?.questionType) query = query.eq('question_type', input.questionType);

  const { data, count, error } = await query
    .order('display_code', { ascending: true, nullsFirst: false })
    .range(0, 24);

  if (error) return actionFail(`Search failed: ${error.message}`);
  return actionOk({ rows: data ?? [], total: count ?? 0 });
}

export async function getLessonEditorQuestion(id: string) {
  let ctx;
  try {
    ctx = await teachingStaffContext();
  } catch (err) {
    if (err instanceof ApiError) return err.toActionResult();
    return actionFail('Unexpected error');
  }
  if (typeof id !== 'string' || !id) return actionFail('id required');

  const { data, error } = await ctx.supabase
    .from('questions_v2')
    .select(QUESTION_CARD_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) return actionFail(`Lookup failed: ${error.message}`);
  return actionOk({ question: data ?? null });
}
