import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../../../../lib/supabase/server';
import { validateExternalApiKey } from '../../../../../../lib/externalAuth';
import { buildStudentPayload } from '../../../../../../lib/lessonworksSync';

// GET /api/public/students/[studentId]/practice-data
// Returns practice_stats, practice_tests, and domain_mastery for a student.
// Same payload format as the push sync to LessonWorks.
// Authenticated via x-api-key header.
export async function GET(request, { params }) {
  if (!validateExternalApiKey(request)) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  const { studentId } = params;
  const supabase = createServiceClient();

  // Verify student exists
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('id', studentId)
    .maybeSingle();

  if (!profile) {
    return NextResponse.json({ error: 'Student not found' }, { status: 404 });
  }

  const payload = await buildStudentPayload(supabase, studentId, {
    includePdfReports: false,
    testLimit: 10,
  });

  if (!payload) {
    return NextResponse.json({ error: 'No data found for student' }, { status: 404 });
  }

  // Return just the data sections (without external_student_id wrapper)
  return NextResponse.json({
    target_score: payload.target_score,
    practice_stats: payload.practice_stats,
    practice_tests: payload.practice_tests,
    domain_mastery: payload.domain_mastery,
  });
}
