import { NextResponse } from 'next/server';
import { requireRole, requireUser } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/lessons — browse the content library
// Query params: domain, skill, search, status, author_id
export const GET = legacyApiRoute(async (request) => {
  // Auth happens outside the try/catch so a 401 from requireUser propagates
  // to legacyApiRoute as a 401 (instead of being caught and remapped to 500).
  const { user, profile, supabase } = await requireUser();
  try {
    const { searchParams } = new URL(request.url);
    const domain = searchParams.get('domain');
    const skill = searchParams.get('skill');
    const search = searchParams.get('search');
    const status = searchParams.get('status');
    const authorId = searchParams.get('author_id');
    const assigned = searchParams.get('assigned'); // "me" to get only assigned lessons

    const isTeacher = profile && ['teacher', 'manager', 'admin'].includes(profile.role);

    let query = supabase
      .from('lessons')
      .select('id, title, description, visibility, status, author_id, created_at, updated_at')
      .order('updated_at', { ascending: false });

    // Filter by status (teachers can see drafts of their own)
    if (status) {
      query = query.eq('status', status);
    }

    if (authorId) {
      query = query.eq('author_id', authorId);
    }

    if (search) {
      query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    }

    const { data: lessons, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // If filtering by domain/skill, get matching lesson IDs from lesson_topics
    let filteredIds = null;
    if (domain || skill) {
      let topicQuery = supabase.from('lesson_topics').select('lesson_id');
      if (domain) topicQuery = topicQuery.eq('domain_name', domain);
      if (skill) topicQuery = topicQuery.eq('skill_code', skill);
      const { data: topicRows } = await topicQuery;
      filteredIds = new Set((topicRows || []).map(r => r.lesson_id));
    }

    // If "assigned=me", get lesson IDs assigned to this student
    let assignedIds = null;
    if (assigned === 'me') {
      const { data: myAssignments } = await supabase
        .from('lesson_assignment_students')
        .select('assignment_id')
        .eq('student_id', user.id);
      if (myAssignments && myAssignments.length > 0) {
        const assignmentIds = myAssignments.map(a => a.assignment_id);
        const { data: assignmentRows } = await supabase
          .from('lesson_assignments')
          .select('lesson_id')
          .in('id', assignmentIds);
        assignedIds = new Set((assignmentRows || []).map(r => r.lesson_id));
      } else {
        assignedIds = new Set();
      }
    }

    // Get topics for all returned lessons
    const lessonIds = (lessons || []).map(l => l.id);
    let topicsMap = {};
    if (lessonIds.length > 0) {
      const { data: allTopics } = await supabase
        .from('lesson_topics')
        .select('lesson_id, domain_name, skill_code')
        .in('lesson_id', lessonIds);
      for (const t of allTopics || []) {
        if (!topicsMap[t.lesson_id]) topicsMap[t.lesson_id] = [];
        topicsMap[t.lesson_id].push({ domain_name: t.domain_name, skill_code: t.skill_code });
      }
    }

    // Get author names
    const authorIds = [...new Set((lessons || []).map(l => l.author_id))];
    let authorMap = {};
    if (authorIds.length > 0) {
      const { data: authors } = await supabase
        .from('profiles')
        .select('id, first_name, last_name')
        .in('id', authorIds);
      for (const a of authors || []) {
        authorMap[a.id] = [a.first_name, a.last_name].filter(Boolean).join(' ') || 'Unknown';
      }
    }

    // Get student progress if not a teacher
    let progressMap = {};
    if (!isTeacher && lessonIds.length > 0) {
      const { data: progressRows } = await supabase
        .from('lesson_progress')
        .select('lesson_id, completed_at, started_at')
        .eq('student_id', user.id)
        .in('lesson_id', lessonIds);
      for (const p of progressRows || []) {
        progressMap[p.lesson_id] = p.completed_at ? 'completed' : 'in_progress';
      }
    }

    let result = (lessons || []).map(l => ({
      ...l,
      author_name: authorMap[l.author_id] || 'Unknown',
      topics: topicsMap[l.id] || [],
      progress: progressMap[l.id] || null,
    }));

    // Apply topic filter
    if (filteredIds) {
      result = result.filter(l => filteredIds.has(l.id));
    }

    // Apply assigned filter
    if (assignedIds !== null) {
      result = result.filter(l => assignedIds.has(l.id));
    }

    return NextResponse.json({ lessons: result });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});

// POST /api/lessons — create a new lesson (teacher+)
export const POST = legacyApiRoute(async (request) => {
  const { user, supabase } = await requireRole(['teacher', 'manager', 'admin']);
  try {
    const body = await request.json();
    const { title, description, visibility, status: lessonStatus, topics } = body;

    if (!title || !title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const { data: lesson, error } = await supabase
      .from('lessons')
      .insert({
        author_id: user.id,
        title: title.trim(),
        description: description || null,
        visibility: visibility || 'shared',
        status: lessonStatus || 'draft',
      })
      .select('id')
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Insert topics if provided
    if (topics && Array.isArray(topics) && topics.length > 0) {
      const topicRows = topics.map(t => ({
        lesson_id: lesson.id,
        domain_name: t.domain_name,
        skill_code: t.skill_code || null,
      }));
      await supabase.from('lesson_topics').insert(topicRows);
    }

    return NextResponse.json({ ok: true, id: lesson.id });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});
