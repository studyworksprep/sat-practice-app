import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../lib/supabase/server';

const ALLOWED_ROLES = new Set(['teacher', 'manager', 'admin']);

async function getAuthedUser(supabase) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, role, first_name, last_name')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || !ALLOWED_ROLES.has(profile.role)) return null;
  return { user, profile };
}

// GET /api/question-notes?questionId=<uuid>
export async function GET(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const questionId = request.nextUrl.searchParams.get('questionId');
  if (!questionId) return NextResponse.json({ error: 'questionId required' }, { status: 400 });

  // Determine which authors this user can see notes from (org scoping)
  const visibleAuthorIds = await getVisibleAuthorIds(auth.profile);

  // Use service client for notes query to resolve all author names
  // (teachers can't read manager profiles through RLS)
  const svc = createServiceClient();
  const { data: notes, error } = await svc
    .from('question_notes')
    .select('id, question_id, author_id, content, created_at, updated_at, profiles:author_id(first_name, last_name, email, role)')
    .eq('question_id', questionId)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Filter to visible notes (admins see all; others see org-scoped)
  const filtered = visibleAuthorIds
    ? (notes || []).filter(n => visibleAuthorIds.has(n.author_id))
    : (notes || []);

  return NextResponse.json({
    notes: filtered.map(n => ({
      id: n.id,
      question_id: n.question_id,
      author_id: n.author_id,
      content: n.content,
      created_at: n.created_at,
      updated_at: n.updated_at,
      author_name: [n.profiles?.first_name, n.profiles?.last_name].filter(Boolean).join(' ') || n.profiles?.email || 'Unknown',
      author_role: n.profiles?.role,
    })),
    is_admin: auth.profile.role === 'admin',
    user_id: auth.profile.id,
  });
}

// POST /api/question-notes  { questionId, content }
export async function POST(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { questionId, content } = body;
  if (!questionId || !content?.trim()) {
    return NextResponse.json({ error: 'questionId and content required' }, { status: 400 });
  }

  const { data, error } = await supabase
    .from('question_notes')
    .insert({ question_id: questionId, author_id: auth.profile.id, content: content.trim() })
    .select('id, question_id, author_id, content, created_at, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    note: {
      ...data,
      author_name: [auth.profile.first_name, auth.profile.last_name].filter(Boolean).join(' ') || auth.profile.email,
      author_role: auth.profile.role,
    },
  });
}

// PATCH /api/question-notes  { noteId, content }
export async function PATCH(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { noteId, content } = body;
  if (!noteId || !content?.trim()) {
    return NextResponse.json({ error: 'noteId and content required' }, { status: 400 });
  }

  // Non-admins can only edit their own notes
  if (auth.profile.role !== 'admin') {
    const { data: existing } = await supabase
      .from('question_notes')
      .select('author_id')
      .eq('id', noteId)
      .single();
    if (!existing || existing.author_id !== auth.profile.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { data, error } = await supabase
    .from('question_notes')
    .update({ content: content.trim(), updated_at: new Date().toISOString() })
    .eq('id', noteId)
    .select('id, content, updated_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ note: data });
}

// DELETE /api/question-notes  { noteId }
export async function DELETE(request) {
  const supabase = await createClient();
  const auth = await getAuthedUser(supabase);
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json();
  const { noteId } = body;
  if (!noteId) return NextResponse.json({ error: 'noteId required' }, { status: 400 });

  // Non-admins can only delete their own notes
  if (auth.profile.role !== 'admin') {
    const { data: existing } = await supabase
      .from('question_notes')
      .select('author_id')
      .eq('id', noteId)
      .single();
    if (!existing || existing.author_id !== auth.profile.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const { error } = await supabase
    .from('question_notes')
    .delete()
    .eq('id', noteId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

/**
 * Determine which note authors are visible to the current user.
 * - Admins: null (see all)
 * - Managers: themselves + their assigned teachers + all admins
 * - Teachers: themselves + their manager (if any) + sibling teachers under same manager + all admins
 * - Teachers with no manager: only themselves + admins
 */
async function getVisibleAuthorIds(profile) {
  if (profile.role === 'admin') return null; // see all

  const svc = createServiceClient();
  const ids = new Set([profile.id]);

  // Always include admins
  const { data: admins } = await svc.from('profiles').select('id').eq('role', 'admin');
  for (const a of (admins || [])) ids.add(a.id);

  if (profile.role === 'manager') {
    // Manager sees notes from their assigned teachers
    const { data: assignments } = await svc
      .from('manager_teacher_assignments')
      .select('teacher_id')
      .eq('manager_id', profile.id);
    for (const a of (assignments || [])) ids.add(a.teacher_id);
  } else if (profile.role === 'teacher') {
    // Teacher sees notes from their manager + sibling teachers under same manager
    const { data: myManagers } = await svc
      .from('manager_teacher_assignments')
      .select('manager_id')
      .eq('teacher_id', profile.id);

    for (const m of (myManagers || [])) {
      ids.add(m.manager_id);
      // Get sibling teachers under same manager
      const { data: siblings } = await svc
        .from('manager_teacher_assignments')
        .select('teacher_id')
        .eq('manager_id', m.manager_id);
      for (const s of (siblings || [])) ids.add(s.teacher_id);
    }
  }

  return ids;
}
