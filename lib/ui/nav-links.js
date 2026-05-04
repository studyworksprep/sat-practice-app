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
  // Notes is the management hub for the three kinds of notes the
  // student keeps: rich-text notes, error-log entries, flashcards.
  // matchPrefix lights the tab on every /notes/* subroute (manage)
  // plus the per-note detail page (/notes/[id]).
  { href: '/notes',             label: 'Notes', matchPrefix: '/notes' },
  // Review is the study hub — Common Errors / Weak Queue drills,
  // SAT countdown, and the three review-mode entry points back
  // into the note kinds. Last in the row so it reads as the
  // "what to do next" destination after the manage surfaces.
  { href: '/review',            label: 'Review' },
];

const BASE_TUTOR_LINKS = [
  { href: '/tutor/dashboard',         label: 'Dashboard' },
  // Roster is the management surface for the tutor's student
  // cohort — searchable / filterable / sortable list with quick-
  // edit affordances on each row. Distinct from Dashboard, which
  // is a "find a student" landing page; Roster is "manage them".
  { href: '/tutor/roster',            label: 'Roster',      matchPrefix: ['/tutor/roster', '/tutor/students'] },
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
