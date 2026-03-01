import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

// POST /api/status { question_id, patch: { marked_for_review?, notes?, is_done? } }
export async function POST(request) {
  const body = await request.json().catch(() => ({}));
  const { question_id, patch } = body || {};
  if (!question_id) return NextResponse.json({ error: 'question_id required' }, { status: 400 });

  const supabase = createClient();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  const user = auth.user;

  const safePatch = {};
  if (patch && typeof patch === 'object') {
    if (typeof patch.marked_for_review === 'boolean') safePatch.marked_for_review = patch.marked_for_review;
    if (typeof patch.is_broken === 'boolean') safePatch.is_broken = patch.is_broken;
    if (typeof patch.is_done === 'boolean') safePatch.is_done = patch.is_done;
    if (typeof patch.notes === 'string') safePatch.notes = patch.notes;
  }

  const { error } = await supabase
    .from('question_status')
    .upsert({
      user_id: user.id,
      question_id,
      ...safePatch,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id,question_id' });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
}
