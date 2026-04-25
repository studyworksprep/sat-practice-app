// Tutor-tree shared shell. Mirrors the student layout's role —
// mounts the AppNav at the top of every tutor-facing new-tree
// page (dashboard, student detail, assignments, training) and
// keeps the role gate in one place so individual page.js files
// don't need to re-check it.
//
// Admins land here too: they need to see their teachers' and
// managers' views during test drives, so the layout accepts
// teacher / manager / admin. Students / practice-only users
// bounce to their own tree.

import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/api/auth';
import { AppNav } from '@/lib/ui/AppNav';

// Teacher-facing items every tutor / manager / admin sees.
const BASE_TUTOR_LINKS = [
  { href: '/tutor/dashboard',         label: 'Dashboard' },
  { href: '/tutor/assignments',       label: 'Assignments' },
  // Training reuses the student practice runner with a tutor
  // scope — launches from /tutor/training/start.
  { href: '/tutor/training/start',    label: 'Training', matchPrefix: '/tutor/training' },
];

// Items added for managers + admins. The Teachers tab is the
// manager's roster of tutors — equivalent in shape to the
// tutor's roster of students, but one layer up.
const MANAGER_LINKS = [
  { href: '/tutor/teachers',          label: 'Teachers', matchPrefix: '/tutor/teachers' },
];

function linksForRole(role) {
  if (role === 'manager' || role === 'admin') {
    return [...BASE_TUTOR_LINKS, ...MANAGER_LINKS];
  }
  return BASE_TUTOR_LINKS;
}

export default async function TutorTreeLayout({ children }) {
  const { user, profile, supabase } = await requireUser();

  if (profile.role === 'student' || profile.role === 'practice') redirect('/dashboard');
  if (!['teacher', 'manager', 'admin'].includes(profile.role)) redirect('/');

  // Same name-for-greeting query the student layout uses.
  const { data: nameRow } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', user.id)
    .maybeSingle();

  const navUser = {
    email: user.email,
    role: profile.role,
    firstName: nameRow?.first_name ?? null,
  };

  return (
    <>
      <AppNav user={navUser} links={linksForRole(profile.role)} />
      {children}
    </>
  );
}
