import { NextResponse } from 'next/server';
import { createClient } from '../../../../../../lib/supabase/server';

async function verifyTeacherAccess(supabase, userId, studentId) {
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', userId)
    .maybeSingle();

  if (profile?.role !== 'teacher' && profile?.role !== 'manager' && profile?.role !== 'admin') return false;

  if (profile.role === 'teacher' || profile.role === 'manager') {
    const { data: assignment } = await supabase
      .from('teacher_student_assignments')
      .select('teacher_id')
      .eq('teacher_id', userId)
      .eq('student_id', studentId)
      .maybeSingle();

    if (!assignment) {
      const { data: classes } = await supabase.from('classes').select('id').eq('teacher_id', userId);
      const classIds = (classes || []).map(c => c.id);
      if (classIds.length) {
        const { data: enrollment } = await supabase
          .from('class_enrollments')
          .select('student_id')
          .in('class_id', classIds)
          .eq('student_id', studentId)
          .maybeSingle();
        if (!enrollment) return false;
      } else {
        return false;
      }
    }
  }
  return true;
}

// GET /api/teacher/student/[studentId]/scores
export async function GET(_request, { params }) {
  const { studentId } = params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await verifyTeacherAccess(supabase, user.id, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const DOMAIN_COLS = 'domain_ini, domain_cas, domain_eoi, domain_sec, domain_alg, domain_atm, domain_pam, domain_geo';

  const { data: scores } = await supabase
    .from('sat_official_scores')
    .select(`id, test_date, rw_score, math_score, composite_score, created_at, test_type, ${DOMAIN_COLS}`)
    .eq('student_id', studentId)
    .order('test_date', { ascending: false });

  return NextResponse.json({ scores: scores || [] });
}

// POST /api/teacher/student/[studentId]/scores
export async function POST(request, { params }) {
  const { studentId } = params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await verifyTeacherAccess(supabase, user.id, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const { test_date, rw_score, math_score, test_type,
    domain_ini, domain_cas, domain_eoi, domain_sec,
    domain_alg, domain_atm, domain_pam, domain_geo } = body;

  if (!test_date || rw_score == null || math_score == null) {
    return NextResponse.json({ error: 'test_date, rw_score, and math_score are required' }, { status: 400 });
  }

  const rw = Number(rw_score);
  const math = Number(math_score);
  if (rw < 200 || rw > 800 || math < 200 || math > 800) {
    return NextResponse.json({ error: 'Scores must be between 200 and 800' }, { status: 400 });
  }

  const composite = rw + math;
  const parseDomain = (v) => { const n = parseInt(v, 10); return n >= 1 && n <= 7 ? n : null; };

  const validTestTypes = ['SAT', 'PSAT'];
  const row = {
    student_id: studentId,
    test_date,
    rw_score: rw,
    math_score: math,
    composite_score: composite,
    created_by: user.id,
    test_type: validTestTypes.includes(test_type) ? test_type : 'SAT',
    domain_ini: parseDomain(domain_ini),
    domain_cas: parseDomain(domain_cas),
    domain_eoi: parseDomain(domain_eoi),
    domain_sec: parseDomain(domain_sec),
    domain_alg: parseDomain(domain_alg),
    domain_atm: parseDomain(domain_atm),
    domain_pam: parseDomain(domain_pam),
    domain_geo: parseDomain(domain_geo),
  };

  const DOMAIN_COLS = 'domain_ini, domain_cas, domain_eoi, domain_sec, domain_alg, domain_atm, domain_pam, domain_geo';
  const { data, error } = await supabase
    .from('sat_official_scores')
    .insert(row)
    .select(`id, test_date, rw_score, math_score, composite_score, created_at, test_type, ${DOMAIN_COLS}`)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ score: data });
}

// DELETE /api/teacher/student/[studentId]/scores
export async function DELETE(request, { params }) {
  const { studentId } = params;
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!(await verifyTeacherAccess(supabase, user.id, studentId))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 });

  const { error } = await supabase
    .from('sat_official_scores')
    .delete()
    .eq('id', id)
    .eq('student_id', studentId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
