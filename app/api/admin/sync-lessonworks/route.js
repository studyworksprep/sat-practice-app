import { NextResponse } from 'next/server';
import { createClient, createServiceClient } from '../../../../lib/supabase/server';
import { syncStudentsToLessonworks } from '../../../../lib/lessonworksSync';

// POST /api/admin/sync-lessonworks
// Manually trigger a sync of student data to LessonWorks.
// Body: { studentIds?: string[] }  — if omitted, syncs ALL active students with teacher assignments.
// Can also be called via cron (e.g. Vercel Cron) with an Authorization header.
export async function POST(request) {
  // Auth: either admin session or cron secret
  const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '');
  const isCron = cronSecret && cronSecret === process.env.CRON_SECRET;

  if (!isCron) {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle();

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
  }

  const body = await request.json().catch(() => ({}));
  let studentIds = body.studentIds;

  // If no specific students requested, sync all active students assigned to teachers
  if (!studentIds?.length) {
    const svc = createServiceClient();
    const { data: assignments } = await svc
      .from('teacher_student_assignments')
      .select('student_id');

    const uniqueIds = [...new Set((assignments || []).map(a => a.student_id))];

    // Filter to active students only
    if (uniqueIds.length > 0) {
      const { data: activeProfiles } = await svc
        .from('profiles')
        .select('id')
        .in('id', uniqueIds)
        .eq('is_active', true);

      studentIds = (activeProfiles || []).map(p => p.id);
    } else {
      studentIds = [];
    }
  }

  if (!studentIds.length) {
    return NextResponse.json({ message: 'No students to sync', synced: 0 });
  }

  try {
    const includePdf = body.includePdf !== false; // default true
    const result = await syncStudentsToLessonworks(studentIds, { includePdfReports: includePdf });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
