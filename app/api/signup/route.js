import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase/server';
import crypto from 'crypto';

function generateInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

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
  let teacherCodeExempt = false;
  if (userType === 'teacher') {
    if (!teacherCode) {
      return NextResponse.json({ error: 'Teacher code is required.' }, { status: 400 });
    }

    const { data: codeRow, error: codeErr } = await svc
      .from('teacher_codes')
      .select('id, used_by, exempt')
      .eq('code', teacherCode.trim())
      .maybeSingle();

    if (codeErr || !codeRow) {
      return NextResponse.json({ error: 'Invalid teacher code.' }, { status: 400 });
    }
    if (codeRow.used_by) {
      return NextResponse.json({ error: 'This teacher code has already been used.' }, { status: 400 });
    }
    teacherCodeExempt = codeRow.exempt === true;
  }

  // If student provided a teacher invite code, validate it exists
  // and check if the teacher is exempt (Studyworks teacher)
  let teacherProfileId = null;
  let studentTeacherExempt = false;
  if (userType === 'student' && teacherCode?.trim()) {
    const { data: teacherProfile, error: tErr } = await svc
      .from('profiles')
      .select('id, subscription_exempt')
      .eq('teacher_invite_code', teacherCode.trim().toUpperCase())
      .maybeSingle();

    if (tErr || !teacherProfile) {
      return NextResponse.json({ error: 'Invalid teacher code. Please check with your teacher and try again.' }, { status: 400 });
    }
    teacherProfileId = teacherProfile.id;
    studentTeacherExempt = teacherProfile.subscription_exempt === true;
  }

  // Build user metadata (will be read by handle_new_user trigger)
  const metadata = {
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    user_type: userType,
  };

  // Only grant exemption if the teacher code is from Studyworks (exempt=true)
  // or the student's teacher is exempt
  if (teacherCodeExempt || studentTeacherExempt) {
    metadata.subscription_exempt = true;
  }

  if (userType === 'student') {
    if (highSchool) metadata.high_school = highSchool.trim();
    if (graduationYear) metadata.graduation_year = String(graduationYear);
    if (targetSatScore) metadata.target_sat_score = String(targetSatScore);
  }

  // Create auth user — email_confirm: false requires email verification
  const { data: authData, error: authError } = await svc.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
    user_metadata: metadata,
  });

  if (authError) {
    return NextResponse.json({ error: authError.message }, { status: 400 });
  }

  // admin.createUser doesn't send a verification email automatically.
  // Use a regular (anon) client signUp call to trigger the email.
  // Since the user already exists, this will just resend the confirmation.
  {
    const { createClient } = await import('../../../lib/supabase/server.js');
    const anonClient = createClient();
    await anonClient.auth.resend({ type: 'signup', email });
  }

  // Mark teacher registration code as used + auto-generate invite code
  if (userType === 'teacher' && authData?.user?.id) {
    await svc
      .from('teacher_codes')
      .update({ used_by: authData.user.id, used_at: new Date().toISOString() })
      .eq('code', teacherCode.trim());

    // Auto-generate a teacher invite code so students can connect
    const inviteCode = generateInviteCode();
    await svc
      .from('profiles')
      .update({ teacher_invite_code: inviteCode })
      .eq('id', authData.user.id);
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

  // Determine if the new user needs a subscription
  const needsSubscription = !metadata.subscription_exempt && userType !== 'exploring';

  return NextResponse.json({ ok: true, needsSubscription, emailVerificationRequired: true });
}
