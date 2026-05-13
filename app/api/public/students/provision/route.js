// POST /api/public/students/provision
//
// Service-to-service provisioning endpoint called from LessonWorks
// when an admin/tutor clicks "Link to Studyworks" (or "Sync practice
// data" with no existing link) on the LessonWorks student-detail
// page. Either returns the existing Studyworks profile id (if this
// LessonWorks student has been provisioned before) or creates a new
// profile + auth user and returns the new id.
//
// Idempotency. Keyed strictly on lessonworks_student_id (a unique
// partial index on profiles.lessonworks_student_id enforces it at
// the DB level — see migration 20240101000043_profiles_lessonworks_link
// .sql). A repeat call with the same id is a cheap SELECT and 200.
//
// Identity model. The LessonWorks `email` payload field is the
// *student's* email address — per the integration decision in PR
// #46 (LessonWorks) + commit replacing parent_email (Studyworks),
// LessonWorks stopped sending parent billing emails through this
// channel. When LessonWorks supplies a student email, we use it as
// auth.users.email so the student can later log in / reset their
// password with that address; handle_new_user mirrors it into
// profiles.email. When LessonWorks doesn't have a student email
// (common for younger students whose record only carries a parent),
// we fall back to a per-LessonWorks-id synth address
// (lw-<uuid>@provisioned.studyworks.local). The synth keeps retries
// idempotent at the auth layer and never collides between siblings.
//
// Claim path. If the LessonWorks-side admin has used the search
// endpoint and picked an existing Studyworks profile to claim, the
// helper sends that profile's UUID as claim_existing_studyworks_id
// and we stamp the LessonWorks link onto that row instead of
// creating a new auth user.
//
// Auth. Single shared `EXTERNAL_API_KEY` env var, same secret the
// existing GET /api/public/students/[studentId]/practice-data
// route uses (lib/externalAuth.js). Not multi-tenant.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateExternalApiKey } from '@/lib/externalAuth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Synth auth address — used only when LessonWorks doesn't supply a
// student email. Stable per LessonWorks student so a double-
// provision (race / retry) lands on the same auth row instead of
// stranding orphans.
function synthAuthEmail(lessonworksStudentId) {
  return `lw-${lessonworksStudentId}@provisioned.studyworks.local`;
}

// Detect a Supabase auth "email already in use" error so we can
// translate it into a clean 409 with operator-friendly text. The
// search endpoint should have surfaced any pre-existing account
// with this email — if we got here, either the admin chose "Create
// new" despite a viable candidate or the search arm missed
// (typo, normalization gap). Either way the answer is the same:
// stop, go through search again.
function isDuplicateEmailError(err) {
  const msg = (err?.message ?? '').toLowerCase();
  return msg.includes('already registered')
      || msg.includes('already exists')
      || msg.includes('duplicate')
      || err?.code === 'email_exists';
}

export async function POST(request) {
  if (!validateExternalApiKey(request)) {
    return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const lessonworksStudentId = String(body?.lessonworks_student_id ?? '').trim();
  const firstName            = String(body?.first_name             ?? '').trim();
  const lastName             = String(body?.last_name              ?? '').trim();
  const organizationId       = String(body?.organization_id        ?? '').trim();
  const email                = body?.email == null ? null : String(body.email).trim() || null;
  const gradeLevel           = body?.grade_level == null ? null : String(body.grade_level).trim() || null;
  const claimExistingId      = String(body?.claim_existing_studyworks_id ?? '').trim();

  if (!lessonworksStudentId) {
    return NextResponse.json({ error: 'lessonworks_student_id is required' }, { status: 400 });
  }
  if (!firstName || !lastName) {
    return NextResponse.json({ error: 'first_name and last_name are required' }, { status: 400 });
  }
  if (!organizationId) {
    return NextResponse.json({ error: 'organization_id is required' }, { status: 400 });
  }

  const svc = createServiceClient();

  // Idempotency check. The unique partial index on
  // profiles.lessonworks_student_id guarantees at most one row,
  // and the SELECT path is the hot one for repeat callers — we
  // want zero side effects when the student is already linked.
  const { data: existing, error: lookupErr } = await svc
    .from('profiles')
    .select('id, lessonworks_organization_id')
    .eq('lessonworks_student_id', lessonworksStudentId)
    .maybeSingle();
  if (lookupErr) {
    return NextResponse.json({ error: `Lookup failed: ${lookupErr.message}` }, { status: 500 });
  }
  if (existing) {
    if (organizationId && existing.lessonworks_organization_id == null) {
      await svc
        .from('profiles')
        .update({ lessonworks_organization_id: organizationId })
        .eq('id', existing.id);
    } else if (
      organizationId
      && existing.lessonworks_organization_id
      && existing.lessonworks_organization_id !== organizationId
    ) {
      return NextResponse.json(
        { error: 'lessonworks_student_id already linked to a different organization' },
        { status: 409 },
      );
    }
    return NextResponse.json({ student_id: existing.id, created: false }, { status: 200 });
  }

  // Claim path. The caller has already used the search endpoint
  // and identified an existing Studyworks-native profile that
  // should carry the LessonWorks link. Stamp the link directly
  // onto that profile and return; never create a new auth user
  // in this branch. The profile is guarded so we don't silently
  // steal a profile that's already linked to a different LW
  // student — that's a 409 the operator has to resolve.
  if (claimExistingId) {
    const { data: target, error: tgtErr } = await svc
      .from('profiles')
      .select('id, role, lessonworks_student_id, lessonworks_organization_id')
      .eq('id', claimExistingId)
      .maybeSingle();
    if (tgtErr) {
      return NextResponse.json({ error: `Claim lookup failed: ${tgtErr.message}` }, { status: 500 });
    }
    if (!target) {
      return NextResponse.json({ error: 'claim_existing_studyworks_id not found' }, { status: 404 });
    }
    if (target.role !== 'student') {
      return NextResponse.json({ error: 'claim target is not a student profile' }, { status: 400 });
    }
    if (
      target.lessonworks_student_id
      && target.lessonworks_student_id !== lessonworksStudentId
    ) {
      return NextResponse.json(
        { error: 'claim target is already linked to a different LessonWorks student' },
        { status: 409 },
      );
    }
    const { error: stampErr } = await svc
      .from('profiles')
      .update({
        lessonworks_student_id: lessonworksStudentId,
        lessonworks_organization_id: organizationId,
      })
      .eq('id', claimExistingId);
    if (stampErr) {
      return NextResponse.json({ error: `Claim failed: ${stampErr.message}` }, { status: 500 });
    }
    return NextResponse.json({ student_id: claimExistingId, created: false, claimed: true }, { status: 200 });
  }

  // Create-new path. Use the student's email as the auth address
  // when LessonWorks supplied one (the student can later log in /
  // reset password with this address). Fall back to the per-LW-id
  // synth when null. email_confirm: true marks the address verified
  // because the LessonWorks admin who initiated the link has
  // already done that work — the student doesn't need to click a
  // verification link before they can use the account.
  const authEmail = email || synthAuthEmail(lessonworksStudentId);
  const password = crypto.randomBytes(24).toString('base64url');
  const { data: authData, error: authErr } = await svc.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      user_type: 'student',
    },
  });
  if (authErr || !authData?.user?.id) {
    if (isDuplicateEmailError(authErr)) {
      return NextResponse.json(
        {
          error:
            'A Studyworks account with this email already exists. Use the search flow to claim it instead of creating a new one.',
        },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: `Failed to create auth user: ${authErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }
  const newProfileId = authData.user.id;

  // handle_new_user trigger fires and seeds profiles with
  // role='student', email=authEmail (either the real student email
  // or the synth). Nothing to overwrite — the trigger's mirror is
  // the correct end-state. Just stamp the LessonWorks link.
  // grade_level isn't a profiles column today; drop it on the floor
  // (LessonWorks already holds it locally).
  const { error: updateErr } = await svc
    .from('profiles')
    .update({
      lessonworks_student_id: lessonworksStudentId,
      lessonworks_organization_id: organizationId,
    })
    .eq('id', newProfileId);
  if (updateErr) {
    // Roll the auth user back so a partial-create can't strand an
    // orphan in auth.users that the next provision call will
    // collide with on the synth or student email.
    await svc.auth.admin.deleteUser(newProfileId);
    return NextResponse.json(
      { error: `Failed to finalize profile: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ student_id: newProfileId, created: true }, { status: 201 });
}
