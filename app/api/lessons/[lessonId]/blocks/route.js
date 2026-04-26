import { NextResponse } from 'next/server';
import { createClient } from '../../../../../lib/supabase/server';
import { validateLessonBlocks } from '../../../../../lib/lesson/lesson-validation.mjs';

// GET /api/lessons/[lessonId]/blocks — get ordered blocks
export async function GET(request, props) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { lessonId } = params;

    const { data: blocks, error } = await supabase
      .from('lesson_blocks')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order');

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ blocks: blocks || [] });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/lessons/[lessonId]/blocks — replace all blocks (full save)
// Body: { blocks: [{ block_type, content, sort_order }, ...] }
export async function PUT(request, props) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { lessonId } = params;
    const body = await request.json();
    const { blocks } = body;

    if (!Array.isArray(blocks)) {
      return NextResponse.json({ error: 'blocks must be an array' }, { status: 400 });
    }

    const validationInput = blocks.map((block, index) => ({
      ...block,
      id: block?.id ?? block?.content?.id ?? `index:${index}`,
    }));
    const validation = validateLessonBlocks(validationInput);
    if (!validation.ok) {
      return NextResponse.json({
        error: 'Lesson block validation failed',
        validation,
      }, { status: 400 });
    }

    // Verify the user can edit this lesson (author or admin)
    const { data: lesson } = await supabase
      .from('lessons')
      .select('author_id')
      .eq('id', lessonId)
      .maybeSingle();

    if (!lesson) return NextResponse.json({ error: 'Lesson not found' }, { status: 404 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (lesson.author_id !== user.id && profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Delete existing blocks
    await supabase.from('lesson_blocks').delete().eq('lesson_id', lessonId);

    // Insert new blocks
    if (blocks.length > 0) {
      const rows = blocks.map((b, i) => ({
        lesson_id: lessonId,
        sort_order: b.sort_order !== undefined ? b.sort_order : i,
        block_type: b.block_type,
        content: b.content || {},
      }));

      const { error: insertErr } = await supabase.from('lesson_blocks').insert(rows).select('id');
      if (insertErr) return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    // Update lesson's updated_at
    await supabase.from('lessons').update({ updated_at: new Date().toISOString() }).eq('id', lessonId);

    // Return the saved blocks with their new IDs
    const { data: saved } = await supabase
      .from('lesson_blocks')
      .select('*')
      .eq('lesson_id', lessonId)
      .order('sort_order');

    return NextResponse.json({ ok: true, blocks: saved || [], validationWarnings: validation.warnings });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
