import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/teacher/lessons — list teacher's lessons with assignment counts
export const GET = legacyApiRoute(async () => {
  const { supabase, user, profile } = await requireRole(['teacher', 'manager', 'admin']);
  try {
    // Get teacher's lessons
    let query = supabase
      .from('lessons')
      .select('id, title, description, visibility, status, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (profile.role !== 'admin') {
      query = query.eq('author_id', user.id);
    }

    const { data: lessons, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Enrich with block count, topic tags, and assignment info
    const enriched = [];
    for (const lesson of lessons || []) {
      const [blocksRes, topicsRes, assignmentsRes] = await Promise.all([
        supabase.from('lesson_blocks').select('id', { count: 'exact', head: true }).eq('lesson_id', lesson.id),
        supabase.from('lesson_topics').select('domain_name, skill_code').eq('lesson_id', lesson.id),
        supabase.from('lesson_assignments').select('id').eq('lesson_id', lesson.id).eq('teacher_id', user.id),
      ]);

      // Count total assigned students
      let studentCount = 0;
      const assignmentIds = (assignmentsRes.data || []).map(a => a.id);
      if (assignmentIds.length > 0) {
        const { count } = await supabase
          .from('lesson_assignment_students')
          .select('*', { count: 'exact', head: true })
          .in('assignment_id', assignmentIds);
        studentCount = count || 0;
      }

      enriched.push({
        ...lesson,
        block_count: blocksRes.count || 0,
        topics: topicsRes.data || [],
        assignment_count: assignmentIds.length,
        student_count: studentCount,
      });
    }

    return NextResponse.json({ lessons: enriched });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
});
