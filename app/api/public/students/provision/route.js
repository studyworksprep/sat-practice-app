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
// Sibling email handling. The LessonWorks contract says `email` is
// the parent billing address — multiple LessonWorks students can
// legitimately share one. To avoid two siblings colliding on
// auth.users.email_key, the auth user gets a synthesized address
// derived from lessonworks_student_id (lw-<uuid>@provisioned
// .studyworks.local). The real parent email is stored on
// profiles.email as the display value; auth.users.email stays the
// synth. Net effect: provisioned siblings each get their own
// distinct Studyworks profile, both display the parent email, and
// the parent can still sign up Studyworks-native with the real
// address later without conflicting with these accounts.
//
// Auth. Single shared `EXTERNAL_API_KEY` env var, same secret the
// existing GET /api/public/students/[studentId]/practice-data
// route uses (lib/externalAuth.js). Not multi-tenant.

import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/server';
import { validateExternalApiKey } from '@/lib/externalAuth';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Auth email synth — kept stable per LessonWorks student so a
// double-provision (race condition / retry) lands on the same auth
// row. The handle_new_user trigger will populate profiles from
// auth.users on first create; we then overwrite profiles.email
// with the real parent address and stamp the LessonWorks link.
function synthAuthEmail(lessonworksStudentId) {
  return `lw-${lessonworksStudentId}@provisioned.studyworks.local`;
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
    // Quietly catch up the organization_id if the row pre-dated us
    // tracking it (a backfilled row, for example, can have a known
    // lessonworks_student_id but a null org). Never overwrites an
    // already-populated value to a different value — that case is
    // surfaced as an error so it can be investigated rather than
    // silently rewritten.
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

  // Create the auth user. Synth email avoids the sibling-on-same-
  // parent-email collision on auth.users.email_key. email_confirm:
  // true so the synth doesn't sit in a "needs verification" state
  // the parent can never satisfy; a real login flow will require
  // a separate password-reset/invite anyway.
  const authEmail = synthAuthEmail(lessonworksStudentId);
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
    return NextResponse.json(
      { error: `Failed to create auth user: ${authErr?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }
  const newProfileId = authData.user.id;

  // handle_new_user trigger fires here and seeds profiles with
  // role='student', email=authEmail. Overwrite the synth email
  // with the real parent address (when present) and stamp the
  // LessonWorks linkage. grade_level isn't a profiles column today
  // — drop it on the floor for now (LessonWorks already holds it
  // locally); revisit if Studyworks ever needs to read it.
  const profileUpdate = {
    email: email ?? null,
    lessonworks_student_id: lessonworksStudentId,
    lessonworks_organization_id: organizationId,
  };
  const { error: updateErr } = await svc
    .from('profiles')
    .update(profileUpdate)
    .eq('id', newProfileId);
  if (updateErr) {
    // Roll the auth user back so a partial-create can't strand an
    // orphan in auth.users that the next provision call will
    // collide with on the synth email.
    await svc.auth.admin.deleteUser(newProfileId);
    return NextResponse.json(
      { error: `Failed to finalize profile: ${updateErr.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ student_id: newProfileId, created: true }, { status: 201 });
}
