import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/lessons/[lessonId]/progress — get student's progress on this lesson
export const GET = legacyApiRoute(async (request, props) => {
  // Auth happens outside the try/catch so a 401 from requireUser propagates
  // to legacyApiRoute as a 401 (instead of being caught and remapped to 500).
  const { user, supabase } = await requireUser();
  const params = await props.params;
  try {
    const { lessonId } = params;

    const { data: progress } = await supabase
      .from('lesson_progress')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('student_id', user.id)
      .maybeSingle();

    return NextResponse.json({ progress: progress || null });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});

// POST /api/lessons/[lessonId]/progress — update progress
// Body: { block_id, check_answer?: { selected, correct } , mark_complete?: boolean }
export const POST = legacyApiRoute(async (request, props) => {
  // Auth happens outside the try/catch so a 401 from requireUser propagates
  // to legacyApiRoute as a 401 (instead of being caught and remapped to 500).
  const { user, supabase } = await requireUser();
  const params = await props.params;
  try {
    const { lessonId } = params;
    const body = await request.json();
    const { block_id, check_answer, mark_complete } = body;

    // Get or create progress row
    let { data: progress } = await supabase
      .from('lesson_progress')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('student_id', user.id)
      .maybeSingle();

    if (!progress) {
      const { data: created, error: createErr } = await supabase
        .from('lesson_progress')
        .insert({
          lesson_id: lessonId,
          student_id: user.id,
          completed_blocks: [],
          check_answers: {},
        })
        .select('*')
        .single();

      if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 });
      progress = created;
    }

    const updates = {};

    // Mark a block as completed
    if (block_id) {
      const completedSet = new Set(progress.completed_blocks || []);
      completedSet.add(block_id);
      updates.completed_blocks = [...completedSet];
    }

    // Record a knowledge check answer
    if (block_id && check_answer) {
      const answers = { ...(progress.check_answers || {}) };
      answers[block_id] = check_answer;
      updates.check_answers = answers;
    }

    // Mark the whole lesson complete
    if (mark_complete) {
      updates.completed_at = new Date().toISOString();
    }

    if (Object.keys(updates).length > 0) {
      const { error: updateErr } = await supabase
        .from('lesson_progress')
        .update(updates)
        .eq('lesson_id', lessonId)
        .eq('student_id', user.id);

      if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Return updated progress
    const { data: updated } = await supabase
      .from('lesson_progress')
      .select('*')
      .eq('lesson_id', lessonId)
      .eq('student_id', user.id)
      .maybeSingle();

    return NextResponse.json({ progress: updated });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});
