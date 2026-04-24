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

const TUTOR_LINKS = [
  { href: '/tutor/dashboard',         label: 'Dashboard' },
  { href: '/tutor/assignments',       label: 'Assignments' },
  // Training reuses the student practice runner with a tutor
  // scope — launches from /tutor/training/start.
  { href: '/tutor/training/start',    label: 'Training', matchPrefix: '/tutor/training' },
];

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
      <AppNav user={navUser} links={TUTOR_LINKS} />
      {children}
    </>
  );
}
