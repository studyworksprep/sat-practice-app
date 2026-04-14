import { NextResponse } from 'next/server';
import { createClient } from '../../../../lib/supabase/server';

// GET /api/lessons/[lessonId] — get a single lesson with blocks and topics
export async function GET(request, props) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { lessonId } = params;

    const [lessonRes, blocksRes, topicsRes] = await Promise.all([
      supabase.from('lessons').select('*').eq('id', lessonId).maybeSingle(),
      supabase.from('lesson_blocks').select('*').eq('lesson_id', lessonId).order('sort_order'),
      supabase.from('lesson_topics').select('domain_name, skill_code').eq('lesson_id', lessonId),
    ]);

    if (lessonRes.error) return NextResponse.json({ error: lessonRes.error.message }, { status: 500 });
    if (!lessonRes.data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Get author name
    const { data: author } = await supabase
      .from('profiles')
      .select('first_name, last_name')
      .eq('id', lessonRes.data.author_id)
      .maybeSingle();

    const authorName = author
      ? [author.first_name, author.last_name].filter(Boolean).join(' ') || 'Unknown'
      : 'Unknown';

    return NextResponse.json({
      lesson: {
        ...lessonRes.data,
        author_name: authorName,
        blocks: blocksRes.data || [],
        topics: topicsRes.data || [],
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// PUT /api/lessons/[lessonId] — update lesson metadata + topics
export async function PUT(request, props) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { lessonId } = params;
    const body = await request.json();
    const { title, description, visibility, status: lessonStatus, topics } = body;

    const updates = { updated_at: new Date().toISOString() };
    if (title !== undefined) updates.title = title.trim();
    if (description !== undefined) updates.description = description;
    if (visibility !== undefined) updates.visibility = visibility;
    if (lessonStatus !== undefined) updates.status = lessonStatus;

    const { error } = await supabase
      .from('lessons')
      .update(updates)
      .eq('id', lessonId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Replace topics if provided
    if (topics !== undefined && Array.isArray(topics)) {
      await supabase.from('lesson_topics').delete().eq('lesson_id', lessonId);
      if (topics.length > 0) {
        const topicRows = topics.map(t => ({
          lesson_id: lessonId,
          domain_name: t.domain_name,
          skill_code: t.skill_code || null,
        }));
        await supabase.from('lesson_topics').insert(topicRows);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

// DELETE /api/lessons/[lessonId] — delete a lesson
export async function DELETE(request, props) {
  const params = await props.params;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { lessonId } = params;

    const { error } = await supabase.from('lessons').delete().eq('id', lessonId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
