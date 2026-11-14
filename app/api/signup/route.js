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

  // Student codes resolve in two tiers (owner policy 2026-07-16):
  //
  //   1. student_invite_codes — SINGLE-USE invitations, issued by an
  //      admin (sponsored) or by the tutor from their roster (never
  //      sponsored — the student subscribes). Valid exactly once, so a
  //      reused code fails HERE — at code-entry time. The invited email
  //      is the CONTACT POINT, not a lock: students often sign up under
  //      a different address than the family contact (owner decision
  //      2026-07-16), and the Codes tracker records who actually
  //      claimed each code for after-the-fact review.
  //   2. profiles.teacher_invite_code — the tutor's permanent multi-use
  //      code, ROSTER-ONLY, and still refused for Studyworks (exempt)
  //      tutors: their students join by invitation.
  //
  // Sponsorship (free access) is a property of the roster link
  // (teacher_student_assignments.sponsored, migration
  // 20261114011641), never implied by the link itself. Only an
  // admin-issued invitation to a tutor who is still exempt produces a
  // sponsored link; the database guard rejects any other writer.
  let teacherProfileId = null;
  let studentSponsored = false;
  let sponsoredBy = null;
  let linkedTeacher = null;
  let studentInviteId = null;
  if (userType === 'student' && teacherCode?.trim()) {
    const normalized = teacherCode.trim().toUpperCase();

    const { data: invite, error: invErr } = await svc
      .from('student_invite_codes')
      .select('id, email, teacher_id, used_by, sponsored, created_by')
      .eq('code', normalized)
      .maybeSingle();
    if (invErr) {
      return NextResponse.json({ error: 'Could not validate the code. Please try again.' }, { status: 400 });
    }

    if (invite) {
      if (invite.used_by) {
        return NextResponse.json({ error: 'This invitation code has already been used.' }, { status: 400 });
      }
      const { data: teacherProfile, error: tErr } = await svc
        .from('profiles')
        .select('id, email, first_name, subscription_exempt')
        .eq('id', invite.teacher_id)
        .maybeSingle();
      if (tErr || !teacherProfile) {
        return NextResponse.json({ error: 'This invitation is no longer valid — its tutor account was removed.' }, { status: 400 });
      }
      teacherProfileId = teacherProfile.id;
      studentSponsored = invite.sponsored === true && teacherProfile.subscription_exempt === true;
      sponsoredBy = studentSponsored ? invite.created_by ?? null : null;
      linkedTeacher = teacherProfile;
      studentInviteId = invite.id;
    } else {
      const { data: teacherProfile, error: tErr } = await svc
        .from('profiles')
        .select('id, email, first_name, subscription_exempt')
        .eq('teacher_invite_code', normalized)
        .maybeSingle();

      if (tErr || !teacherProfile) {
        return NextResponse.json({ error: 'Invalid teacher code. Please check with your teacher and try again.' }, { status: 400 });
      }
      if (teacherProfile.subscription_exempt === true) {
        return NextResponse.json({
          error: "This tutor's students join by personal invitation. Ask your tutor to send an invitation to your email — or sign up without a code and subscribe.",
        }, { status: 400 });
      }
      teacherProfileId = teacherProfile.id;
      linkedTeacher = teacherProfile;
    }
  }

  // Build user metadata (will be read by handle_new_user trigger)
  const metadata = {
    first_name: firstName.trim(),
    last_name: lastName.trim(),
    user_type: userType,
  };

  // profiles.subscription_exempt marks a Studyworks TUTOR (a redeemed
  // teacher code). Students never carry it any more: their free access
  // lives on the sponsored roster link written below.
  if (teacherCodeExempt) {
    metadata.subscription_exempt = true;
  }

  // Target score, test date, and everything else that shapes a plan
  // are collected by the onboarding intake (/welcome), not at signup
  // (docs/student-onboarding-and-plan-redesign-2026-09.md §2).

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

  // Auto-assign student to teacher if they provided a valid code, and
  // burn the single-use invitation. Both writes surface errors — a
  // silent failure here either strands the student off-roster or
  // leaves a sponsored invitation redeemable twice.
  if (userType === 'student' && teacherProfileId && authData?.user?.id) {
    const { error: rosterErr } = await svc
      .from('teacher_student_assignments')
      .upsert(
        {
          teacher_id: teacherProfileId,
          student_id: authData.user.id,
          sponsored: studentSponsored,
          sponsored_by: sponsoredBy,
        },
        { onConflict: 'teacher_id,student_id' },
      );
    if (rosterErr) {
      console.error(`[signup] failed to roster ${email} to teacher ${teacherProfileId}:`, rosterErr.message);
    }

    if (studentInviteId) {
      const { data: burned, error: burnErr } = await svc
        .from('student_invite_codes')
        .update({ used_by: authData.user.id, used_at: new Date().toISOString() })
        .eq('id', studentInviteId)
        .is('used_by', null)
        .select('id');
      if (burnErr || !burned?.length) {
        console.error(
          `[signup] failed to mark student invitation as used for ${email}:`,
          burnErr?.message ?? 'invitation already claimed (concurrent signup?)',
        );
      }
    }
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
    subscriptionExempt: metadata.subscription_exempt === true || studentSponsored,
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

  // Determine if the new user needs a subscription. A student who joined
  // through a tutor-issued invitation is on that tutor's roster but
  // still subscribes; `joinedTutor` lets the form say so.
  const needsSubscription =
    !metadata.subscription_exempt && !studentSponsored && userType !== 'exploring';

  return NextResponse.json({
    ok: true,
    needsSubscription,
    joinedTutor: Boolean(teacherProfileId),
    emailVerificationRequired: true,
  });
}
