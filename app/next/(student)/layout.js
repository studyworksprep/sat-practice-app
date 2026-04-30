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
import { AppNav } from '@/lib/ui/AppNav';
import { STUDENT_LINKS, tutorLinksForRole } from '@/lib/ui/nav-links';

// Practice-test surfaces (instruction page, runner, per-module review,
// results) are shared infra: students take their tests here, but so do
// teachers and managers via /tutor/training/tests → "Launch test". The
// layout's role-redirect would otherwise bounce non-students back to
// /tutor/dashboard the moment they navigated in, and the AppNav links
// would point at student-only surfaces.
const SHARED_INFRA_PREFIXES = ['/practice/test/'];

function isSharedInfraPath(pathname) {
  if (!pathname) return false;
  return SHARED_INFRA_PREFIXES.some((p) => pathname.startsWith(p));
}

export default async function StudentTreeLayout({ children }) {
  const { user, profile } = await requireUser();
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
  const links = isTutor ? tutorLinksForRole(profile.role) : STUDENT_LINKS;

  return (
    <>
      <AppNav user={navUser} links={links} />
      {children}
    </>
  );
}
