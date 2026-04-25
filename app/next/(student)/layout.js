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
import { requireUser } from '@/lib/api/auth';
import { AppNav } from '@/lib/ui/AppNav';

const STUDENT_LINKS = [
  { href: '/dashboard',         label: 'Dashboard' },
  // "Practice" now covers both the session generator (question
  // bank filter) and the per-test runner — unified under one tab.
  // matchPrefix is a string instead of a function because the
  // layout is a Server Component and can't pass functions across
  // the boundary into the client AppNav. The client treats
  // matchPrefix as "highlight this link for any URL under that
  // prefix", so /practice/test/... and /practice/history both
  // keep the Practice tab active.
  { href: '/practice/start',    label: 'Practice', matchPrefix: '/practice' },
  { href: '/assignments',       label: 'Assignments' },
  { href: '/review',            label: 'Review' },
];

export default async function StudentTreeLayout({ children }) {
  const { user, profile, supabase } = await requireUser();

  // Bounce non-students out of this tree. Same gates the individual
  // page.js files apply, but lifted here so the AppNav doesn't
  // momentarily flash as a student before we redirect.
  if (profile.role === 'admin') redirect('/admin');
  if (profile.role === 'teacher' || profile.role === 'manager') redirect('/tutor/dashboard');
  if (profile.role === 'practice') redirect('/subscribe');

  // First name for the nav greeting. Best-effort; fall back to the
  // raw email if the row is missing or the column was never set.
  // The default profile fetch in requireUser doesn't include
  // first_name to keep the auth payload minimal.
  const { data: nameRow } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', user.id)
    .maybeSingle();

  const navUser = {
    email: user.email,
    role: profile.role ?? 'student',
    firstName: nameRow?.first_name ?? null,
  };

  return (
    <>
      <AppNav user={navUser} links={STUDENT_LINKS} />
      {children}
    </>
  );
}
