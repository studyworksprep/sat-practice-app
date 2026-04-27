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
  // Split in Phase 3: "Practice" is the self-guided session
  // generator (question bank filter → session runner) and
  // "Practice tests" is the full-length SAT-simulation hub.
  // matchPrefix highlights the link for any URL under that prefix;
  // the Practice-tests tab gets a more specific prefix so it
  // doesn't also light up for /practice/start.
  // "Practice" owns self-guided sessions; matchPrefix picks up the
  // session runner (/practice/s/...) + history too.
  { href: '/practice/start',    label: 'Practice',       matchPrefix: ['/practice/start', '/practice/s', '/practice/history', '/practice/review'] },
  // "Practice tests" owns full-length simulations. The launch hub
  // lives at the plural /practice/tests; the per-test instruction
  // page and the runner/results live under the singular
  // /practice/test — both need to keep this tab highlighted.
  { href: '/practice/tests',    label: 'Practice tests', matchPrefix: ['/practice/tests', '/practice/test'] },
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
