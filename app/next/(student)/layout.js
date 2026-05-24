// Student-tree shared shell. Mounts the AppNav at the top of every
// student-facing page in the new tree (dashboard, practice runner,
// review, history, assignments). See docs/architecture-plan.md
// §3.6 — the new tree owns its own layouts independently of the
// legacy tree, so adding a sticky nav here doesn't touch a single
// legacy page.
//
// requireUser() runs once per request to populate the nav. It also
// double-gates role: an admin or teacher who somehow lands on a
// /next/(student) URL gets redirected to their own tree before
// the nav even renders.

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { requireUser } from '@/lib/api/auth';
import { hasAssignedTutor } from '@/lib/api/hasAssignedTutor';
import { maybeSendWelcomeEmail } from '@/lib/email/maybeSendWelcomeEmail';
import { AppNav } from '@/lib/ui/AppNav';
import { STUDENT_LINKS, tutorLinksForRole } from '@/lib/ui/nav-links';

// Shared-infra surfaces: students use them, but so do teachers /
// managers / admins (e.g. tutors taking a practice test from
// /tutor/training/tests, or managing their own flashcard library).
// The layout's role-redirect would otherwise bounce non-students
// back to /tutor/dashboard the moment they navigated in, and the
// AppNav links would point at student-only surfaces.
//
//  /practice/test/  — per-test instruction + runner + results
//  /flashcards      — flashcard library (per-user, role-agnostic)
const SHARED_INFRA_PREFIXES = ['/practice/test/', '/flashcards'];

function isSharedInfraPath(pathname) {
  if (!pathname) return false;
  return SHARED_INFRA_PREFIXES.some((p) => pathname.startsWith(p));
}

export default async function StudentTreeLayout({ children }) {
  const { user, profile, supabase } = await requireUser();
  const pathname = (await headers()).get('x-pathname') ?? '';
  const sharedInfra = isSharedInfraPath(pathname);

  // Bounce non-students out of this tree. Same gates the individual
  // page.js files apply, but lifted here so the AppNav doesn't
  // momentarily flash as a student before we redirect. Skip for
  // shared-infra paths so tutors taking a practice test from their
  // own training tree aren't bounced mid-launch.
  if (!sharedInfra) {
    if (profile.role === 'admin') redirect('/admin');
    if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  }
  if (profile.role === 'practice') redirect('/subscribe');

  const navUser = {
    email: user.email,
    role: profile.role ?? 'student',
    firstName: profile.first_name ?? null,
  };

  // On shared-infra paths, render the nav appropriate for the user's
  // role — a tutor taking a test through this layout shouldn't see
  // student tabs (Dashboard / Review / Assignments) that point at
  // surfaces they can't use.
  const isTutor = sharedInfra
    && (profile.role === 'teacher' || profile.role === 'manager' || profile.role === 'admin');
  let links = isTutor ? tutorLinksForRole(profile.role) : STUDENT_LINKS;

  // Self-studying students (no tutor on the platform) never see
  // assignments — drop the tab so the nav doesn't advertise an
  // empty surface. Skip the check on shared-infra paths since
  // the nav there isn't STUDENT_LINKS anyway.
  if (!isTutor && profile.role === 'student') {
    const hasTutor = await hasAssignedTutor(supabase, user.id);
    if (!hasTutor) {
      links = links.filter((l) => l.href !== '/assignments');
    }
  }

  // Post-confirmation welcome email. The home page (`/`) was the
  // original hook for this, but the login form does a client-side
  // router.push('/dashboard') after sign-in, so `/` never renders
  // server-side for the newly-confirmed student. Moving the call
  // here means it fires on the first authenticated student-tree
  // page (almost always /dashboard). Idempotent (gated on
  // profiles.welcome_email_sent_at IS NULL with a compare-and-swap
  // stamp) so firing on every render is safe.
  if (profile.role === 'student') {
    await maybeSendWelcomeEmail({ userId: user.id, email: user.email });
  }

  return (
    <>
      <AppNav user={navUser} links={links} />
      {children}
    </>
  );
}
