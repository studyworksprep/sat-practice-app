import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase/server';

export async function POST(request) {
  const body = await request.json();
  const {
    email, password, firstName, lastName, userType,
    highSchool, graduationYear, targetSatScore,
    teacherCode, // used by teachers (registration code) AND students (teacher invite code)
  } = body;

  // Basic validation
  if (!email || !password || !firstName || !lastName || !userType) {
    return NextResponse.json(
      { error: 'Email, password, first name, last name, and user type are required.' },
      { status: 400 },
    );
  }

  if (!['student', 'teacher', 'exploring'].includes(userType)) {
    return NextResponse.json({ error: 'Invalid user type.' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Validate teacher registration code if signing up as teacher
  if (userType === 'teacher') {
    if (!teacherCode) {
      return NextResponse.json({ error: 'Teacher code is required.' }, { status: 400 });
    }

    const { data: codeRow, error: codeErr } = await svc
      .from('teacher_codes')
      .select('id, used_by')
      .eq('code', teacherCode.trim())
      .maybeSingle();

    if (codeErr || !codeRow) {
      return NextResponse.json({ error: 'Invalid teacher code.' }, { status: 400 });
    }
    if (codeRow.used_by) {
      return NextResponse.json({ error: 'This teacher code has already been used.' }, { status: 400 });
    }
  }

  // If student provided a teacher invite code, validate it exists
  let teacherProfileId = null;
  if (userType === 'student' && teacherCode?.trim()) {
    const { data: teacherProfile, error: tErr } = await svc
      .from('profiles')
      .select('id')
      .eq('teacher_invite_code', teacherCode.trim().toUpperCase())
      .maybeSingle();

    if (tErr || !teacherProfile) {
      return NextResponse.json({ error: 'Invalid teacher code. Please check with your teacher and try again.' }, { status: 400 });
    }
    teacherProfileId = teacherProfile.id;
  }

  // Build user metadata (will be read by handle_new_user trigger)
  const metadata = {
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    user_type: userType,
  };

  // Teachers with a valid code and students with a teacher invite code are exempt from billing
  if (userType === 'teacher' || (userType === 'student' && teacherProfileId)) {
    metadata.subscription_exempt = true;
  }

  if (userType === 'student') {
    if (highSchool) metadata.high_school = highSchool.trim();
    if (graduationYear) metadata.graduation_year = String(graduationYear);
    if (targetSatScore) metadata.target_sat_score = String(targetSatScore);
  }

  // Create auth user — the handle_new_user trigger will populate profiles
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: metadata,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // Mark teacher registration code as used
  if (userType === 'teacher' && authData?.user?.id) {
    await svc
      .from('teacher_codes')
      .update({ used_by: authData.user.id, used_at: new Date().toISOString() })
      .eq('code', teacherCode.trim());
  }

  // Auto-assign student to teacher if they provided a valid invite code
  if (userType === 'student' && teacherProfileId && authData?.user?.id) {
    await svc
      .from('teacher_student_assignments')
      .upsert(
        { teacher_id: teacherProfileId, student_id: authData.user.id },
        { onConflict: 'teacher_id,student_id' },
      );
  }

  return NextResponse.json({ ok: true });
}
