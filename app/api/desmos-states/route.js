import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

const CAN_SAVE_ROLES = new Set(['manager', 'admin']);

// GET /api/desmos-states?questionId=<uuid>
export const GET = legacyApiRoute(async (request) => {
  const { supabase, profile } = await requireRole(['teacher', 'manager', 'admin']);

  const questionId = request.nextUrl.searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });

  const { data, error } = await supabase
    .from('desmos_saved_states')
    .select('id, question_id, state_json, saved_by, created_at, updated_at')
    .eq('question_id', questionId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    state: data || null,
    can_save: CAN_SAVE_ROLES.has(profile.role),
  });
});

// POST /api/desmos-states  { questionId, stateJson }
export const POST = legacyApiRoute(async (request) => {
  const { supabase, profile } = await requireRole(['manager', 'admin']);

  const body = await request.json();
  const { questionId, stateJson } = body;
  if (!questionId || !stateJson) {
    return NextResponse.json({ error: 'questionId and stateJson required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('desmos_saved_states')
    .upsert(
      {
        question_id: questionId,
        state_json: stateJson,
        saved_by: profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'question_id' }
    )
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
});

// DELETE /api/desmos-states  { questionId }
export const DELETE = legacyApiRoute(async (request) => {
  const { supabase } = await requireRole(['manager', 'admin']);

  const body = await request.json();
  const { questionId } = body;
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });

  const { error } = await supabase
    .from('desmos_saved_states')
    .delete()
    .eq('question_id', questionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
});
