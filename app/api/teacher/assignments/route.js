import { NextResponse } from 'next/server';
import { requireRole } from '@/lib/api/auth';
import { legacyApiRoute } from '@/lib/api/response';

// GET /api/teacher/assignments — list teacher's student assignments with details
export const GET = legacyApiRoute(async () => {
  const { supabase, user } = await requireRole(['teacher', 'manager', 'admin']);

  // Get assignments
  const { data: assignments } = await supabase
    .from('teacher_student_assignments')
    .select('teacher_id, student_id, created_at')
    .eq('teacher_id', user.id);

  if (!assignments?.length) {
    return NextResponse.json({ assignments: [] });
  }

  const studentIds = assignments.map(a => a.student_id);

  // Get student profiles and their recent activity in parallel
  const [studentsRes, activityRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, email, first_name, last_name, target_sat_score, graduation_year, high_school, is_active')
      .in('id', studentIds),
    supabase
      .from('attempts')
      .select('user_id, created_at')
      .in('user_id', studentIds)
      .order('created_at', { ascending: false })
      .limit(1000),
  ]);

  const studentMap = {};
  for (const s of studentsRes.data || []) studentMap[s.id] = s;

  // Last activity per student
  const lastActivity = {};
  for (const a of activityRes.data || []) {
    if (!lastActivity[a.user_id]) lastActivity[a.user_id] = a.created_at;
  }

  // Activity count per student (last 7 days)
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const weeklyActivity = {};
  for (const a of activityRes.data || []) {
    if (a.created_at >= sevenDaysAgo) {
      weeklyActivity[a.user_id] = (weeklyActivity[a.user_id] || 0) + 1;
    }
  }

  const enriched = assignments.map(a => {
    const student = studentMap[a.student_id] || {};
    return {
      student_id: a.student_id,
      assigned_at: a.created_at,
      email: student.email,
      first_name: student.first_name,
      last_name: student.last_name,
      target_sat_score: student.target_sat_score,
      graduation_year: student.graduation_year,
      high_school: student.high_school,
      is_active: student.is_active !== false,
      last_activity: lastActivity[a.student_id] || null,
      weekly_attempts: weeklyActivity[a.student_id] || 0,
    };
  });

  // Sort by last activity (most recent first), inactive at bottom
  enriched.sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
    if (!a.last_activity && !b.last_activity) return 0;
    if (!a.last_activity) return 1;
    if (!b.last_activity) return -1;
    return new Date(b.last_activity) - new Date(a.last_activity);
  });

  return NextResponse.json({ assignments: enriched });
});

// POST /api/teacher/assignments — admin-only: assign a student to a teacher
export const POST = legacyApiRoute(async (request) => {
  const { supabase, user } = await requireRole(['admin']);

  const body = await request.json().catch(() => ({}));
  const { student_email, teacher_id } = body;

  if (!student_email) {
    return NextResponse.json({ error: 'student_email required' }, { status: 400 });
  }

  const targetTeacherId = teacher_id || user.id;

  // Find the student by email
  const { data: student } = await supabase
    .from('profiles')
    .select('id, email, role')
    .eq('email', student_email.trim().toLowerCase())
    .maybeSingle();

  if (!student) {
    return NextResponse.json({ error: 'No student found with that email' }, { status: 404 });
  }

  // Check if already assigned
  const { data: existing } = await supabase
    .from('teacher_student_assignments')
    .select('student_id')
    .eq('teacher_id', targetTeacherId)
    .eq('student_id', student.id)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ error: 'Student is already assigned' }, { status: 409 });
  }

  const { error } = await supabase
    .from('teacher_student_assignments')
    .insert({ teacher_id: targetTeacherId, student_id: student.id });

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true, student_id: student.id, email: student.email });
});

// DELETE /api/teacher/assignments — admin-only: remove a student from a teacher
export const DELETE = legacyApiRoute(async (request) => {
  const { supabase, user } = await requireRole(['admin']);

  const body = await request.json().catch(() => ({}));
  const { student_id, teacher_id } = body;

  if (!student_id) return NextResponse.json({ error: 'student_id required' }, { status: 400 });

  const targetTeacherId = teacher_id || user.id;

  const { error } = await supabase
    .from('teacher_student_assignments')
    .delete()
    .eq('teacher_id', targetTeacherId)
    .eq('student_id', student_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({ ok: true });
});
