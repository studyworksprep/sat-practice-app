import { NextResponse } from 'next/server';
import { createServiceClient } from '../../../lib/supabase/server';
import { rateLimit } from '../../../lib/api/rateLimit';
import {
  sendAdminSignupNotification,
  sendTeacherNewStudentNotification,
} from '../../../lib/email/signupNotifications';
import crypto from 'crypto';

function generateInviteCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  return Array.from(bytes, b => chars[b % chars.length]).join('');
}

export async function POST(request) {
  // Unauthenticated route that creates real auth users and validates
  // invite codes — rate-limit per IP so it can't be used for account
  // spam or teacher-code brute forcing. 10 signups/hour per IP is
  // far above any legitimate household/classroom rate.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    ?? 'unknown';
  const rl = await rateLimit(`signup:${ip}`, {
    limit: 10,
    windowMs: 3_600_000,
  });
  if (!rl.ok) {
    return NextResponse.json(
      { error: 'Too many signup attempts. Please try again later.' },
      { status: 429 },
    );
  }

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

  // Teacher registration code — the Studyworks-tutor marker (owner
  // policy, 2026-07-16). An admin-issued teacher_codes row identifies a
  // Studyworks tutor: one tutor per code, used_by/used_at tracked, and a
  // valid code grants subscription_exempt=true (free access for as long
  // as they use the app). A teacher signing up WITHOUT a code is an
  // outside tutor — role=teacher, no exemption — and the proxy routes
  // them to the teacher subscription plan.
  //
  // A code that IS provided but invalid or already used still errors:
  // silently downgrading a mistyped Studyworks invitation into a paid
  // signup would be worse than asking the tutor to re-check their email.
  let teacherCodeExempt = false;
  if (userType === 'teacher' && teacherCode?.trim()) {
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
    teacherCodeExempt = true;
  }

  // If student provided a teacher invite code, validate it exists
  // and check if the teacher is exempt (Studyworks teacher)
  let teacherProfileId = null;
  let studentTeacherExempt = false;
  let linkedTeacher = null;
  if (userType === 'student' && teacherCode?.trim()) {
    const { data: teacherProfile, error: tErr } = await svc
      .from('profiles')
      .select('id, email, first_name, subscription_exempt')
      .eq('teacher_invite_code', teacherCode.trim().toUpperCase())
      .maybeSingle();

    if (tErr || !teacherProfile) {
      return NextResponse.json({ error: 'Invalid teacher code. Please check with your teacher and try again.' }, { status: 400 });
    }
    teacherProfileId = teacherProfile.id;
    studentTeacherExempt = teacherProfile.subscription_exempt === true;
    linkedTeacher = teacherProfile;
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
    const { createClient } = await import('../../../lib/supabase/server');
    const anonClient = await createClient();
    await anonClient.auth.resend({ type: 'signup', email });
  }

  // Mark the redeemed Studyworks code as used (one tutor per code) and
  // auto-generate a student invite code for EVERY teacher — outside
  // tutors invite students too; their students just don't inherit an
  // exemption (see studentTeacherExempt above).
  if (userType === 'teacher' && authData?.user?.id) {
    if (teacherCodeExempt) {
      // `.is('used_by', null)` re-asserts one-tutor-per-code at write
      // time (the pre-createUser check can race a concurrent signup).
      // These writes used to be fire-and-forget; a failure here means a
      // Studyworks code stays redeemable, so it must at least be loud.
      const { data: stamped, error: stampErr } = await svc
        .from('teacher_codes')
        .update({ used_by: authData.user.id, used_at: new Date().toISOString() })
        .eq('code', teacherCode.trim())
        .is('used_by', null)
        .select('id');
      if (stampErr || !stamped?.length) {
        console.error(
          `[signup] failed to mark teacher code as used for ${email}:`,
          stampErr?.message ?? 'code already claimed (concurrent signup?)',
        );
      }
    }

    const inviteCode = generateInviteCode();
    const { error: inviteErr } = await svc
      .from('profiles')
      .update({ teacher_invite_code: inviteCode })
      .eq('id', authData.user.id);
    if (inviteErr) {
      console.error(`[signup] failed to set teacher_invite_code for ${email}:`, inviteErr.message);
    }
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

  // Fire internal signup notifications (soft failure — never blocks the
  // signup response if email infra is down or unconfigured).
  const origin = request.headers.get('origin') || undefined;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || origin;
  await sendAdminSignupNotification({
    email,
    firstName: metadata.first_name,
    lastName: metadata.last_name,
    userType,
    highSchool: metadata.high_school,
    graduationYear: metadata.graduation_year,
    targetSatScore: metadata.target_sat_score,
    teacherCode: teacherCode?.trim() || null,
    teacherEmail: linkedTeacher?.email || null,
    subscriptionExempt: metadata.subscription_exempt === true,
  });

  if (linkedTeacher?.email) {
    await sendTeacherNewStudentNotification({
      teacherEmail: linkedTeacher.email,
      teacherFirstName: linkedTeacher.first_name,
      studentEmail: email,
      studentFirstName: metadata.first_name,
      studentLastName: metadata.last_name,
      highSchool: metadata.high_school,
      graduationYear: metadata.graduation_year,
      targetSatScore: metadata.target_sat_score,
      siteUrl,
    });
  }

  // Determine if the new user needs a subscription
  const needsSubscription = !metadata.subscription_exempt && userType !== 'exploring';

  return NextResponse.json({ ok: true, needsSubscription, emailVerificationRequired: true });
}
