// Shared AppNav link sets for the next-tree layouts.
//
// The student tree and tutor tree each render their own AppNav,
// but a few surfaces (the practice-test instruction page, runner,
// and results) are shared infra under the (student) route group.
// When a tutor takes a test there, the (student) layout needs to
// render TUTOR-style nav so the buttons link back into the tutor
// surfaces instead of /dashboard, /review, etc.

export const STUDENT_LINKS = [
  { href: '/dashboard',         label: 'Dashboard' },
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
  // Per-user private notes (rich text + math). The matchPrefix
  // keeps the tab lit on the per-note detail page (/notes/[id]).
  { href: '/notes',             label: 'Notes', matchPrefix: '/notes' },
];

const BASE_TUTOR_LINKS = [
  { href: '/tutor/dashboard',         label: 'Dashboard' },
  { href: '/tutor/assignments',       label: 'Assignments' },
  { href: '/tutor/performance',       label: 'Performance' },
  // The Train context is the teacher's own SAT practice and
  // review — kept separate from the rosters they teach. The
  // matchPrefix lights up for everything under /tutor/training,
  // including the practice runner + assignment + review subpages,
  // and also the shared-infra /practice/test/* surfaces a tutor
  // reaches via /tutor/training/tests → "Launch test".
  { href: '/tutor/training',          label: 'Train', matchPrefix: ['/tutor/training', '/practice/test', '/flashcards'] },
];

const MANAGER_LINKS = [
  { href: '/tutor/teachers',          label: 'Teachers', matchPrefix: '/tutor/teachers' },
];

export function tutorLinksForRole(role) {
  if (role === 'manager' || role === 'admin') {
    return [...BASE_TUTOR_LINKS, ...MANAGER_LINKS];
  }
  return BASE_TUTOR_LINKS;
}

// Admin AppNav. The legacy AdminDashboard had seven tabs in a
// single client component; the new tree breaks each tab into
// its own Server Component page. matchPrefix lets a tab stay
// active while the user drills into a per-row detail page
// (e.g. /admin/users/[userId] keeps the Users tab lit).
export const ADMIN_LINKS = [
  { href: '/admin',             label: 'Overview' },
  { href: '/admin/users',       label: 'Users',       matchPrefix: '/admin/users' },
  { href: '/admin/questions',   label: 'Questions',   matchPrefix: ['/admin/questions', '/admin/content'] },
  { href: '/admin/performance', label: 'Performance', matchPrefix: '/admin/performance' },
];
