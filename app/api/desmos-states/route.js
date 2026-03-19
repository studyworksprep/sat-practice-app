import { NextResponse } from 'next/server';
import { createClient } from '../../../lib/supabase/server';

const ALLOWED_ROLES = new Set(['teacher', 'manager', 'admin']);
const CAN_SAVE_ROLES = new Set(['manager', 'admin']);

async function getAuthedUser(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !ALLOWED_ROLES.has(profile.role)) return null;
  return { user, profile };
}

// GET /api/desmos-states?questionId=<uuid>
export async function GET(request) {
  const supabase = createClient();
  const auth = await getAuthedUser(supabase);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
    can_save: CAN_SAVE_ROLES.has(auth.profile.role),
  });
}

// POST /api/desmos-states  { questionId, stateJson }
export async function POST(request) {
  const supabase = createClient();
  const auth = await getAuthedUser(supabase);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!CAN_SAVE_ROLES.has(auth.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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
        saved_by: auth.profile.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'question_id' }
    )
    .select('id')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, id: data.id });
}

// DELETE /api/desmos-states  { questionId }
export async function DELETE(request) {
  const supabase = createClient();
  const auth = await getAuthedUser(supabase);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!CAN_SAVE_ROLES.has(auth.profile.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { questionId } = body;
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });

  const { error } = await supabase
    .from('desmos_saved_states')
    .delete()
    .eq('question_id', questionId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
