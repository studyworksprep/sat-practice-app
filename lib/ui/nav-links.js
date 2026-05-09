// Shared AppNav link sets for the next-tree layouts.
//
// The student tree and tutor tree each render their own AppNav,
// but a few surfaces (the practice-test instruction page, runner,
// and results) are shared infra under the (student) route group.
// When a tutor takes a test there, the (student) layout needs to
// render TUTOR-style nav so the buttons link back into the tutor
// surfaces instead of /dashboard, /review, etc.
//
// Admin navigation: admins need access to *all three* roles' tools
// — admin platform tools (Operate), tutor/manager surfaces (Teach),
// and the student-side practice runner (Train) for dogfooding +
// content review. Rather than swap navs as the admin moves between
// route groups (which made "Dashboard" mean different things on
// different pages), the admin nav is one unified union exposed by
// `adminLinks()`. All three layouts ((admin), (tutor), (student)
// shared-infra) render this same union for role === 'admin', so the
// nav is identical regardless of which subtree the page lives under.
//
// Visual: { kind: 'divider' } sentinels split the union into three
// clusters in the AppNav (Operate · Teach · Train).

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

// ── Admin navigation: three clusters joined by dividers ──────────
// Each cluster is a flat list of nav links; dividers are emitted
// between clusters by adminLinks() below.

const OPERATE_LINKS = [
  { href: '/admin',             label: 'Overview' },
  { href: '/admin/users',       label: 'Users',       matchPrefix: '/admin/users' },
  // Questions tab also lights up for /admin/content (drafts, score
  // curves, thresholds) and for /tutor/review/<id> in case a stray
  // cross-tree link bounces the admin into the tutor question
  // detail page — the tab still reads as "you are in Questions".
  { href: '/admin/questions',   label: 'Questions',   matchPrefix: ['/admin/questions', '/admin/content', '/tutor/review'] },
  { href: '/admin/lessons',     label: 'Lessons',     matchPrefix: '/admin/lessons' },
  { href: '/admin/performance', label: 'Performance', matchPrefix: '/admin/performance' },
];

// Teach cluster: the tutor/manager surfaces an admin needs day-to-
// day. /tutor/dashboard and /tutor/performance are intentionally
// omitted — the admin already has /admin (Overview) and
// /admin/performance (cohort-wide) for those purposes — but both
// remain reachable via direct URL or by drilling into a teacher
// from /tutor/teachers/[id].
const TEACH_LINKS_FOR_ADMIN = [
  { href: '/tutor/roster',      label: 'Roster',      matchPrefix: ['/tutor/roster', '/tutor/students'] },
  { href: '/tutor/assignments', label: 'Assignments', matchPrefix: '/tutor/assignments' },
  { href: '/tutor/teachers',    label: 'Teachers',    matchPrefix: '/tutor/teachers' },
];

const TRAIN_LINKS_FOR_ADMIN = [
  { href: '/tutor/training',    label: 'Train',       matchPrefix: ['/tutor/training', '/practice/test', '/flashcards'] },
];

// Build the admin nav union. Dividers are { kind: 'divider' }
// sentinels — AppNav renders them as a thin vertical hairline
// between clusters and skips matchPrefix logic on them.
export function adminLinks() {
  return [
    ...OPERATE_LINKS,
    { kind: 'divider' },
    ...TEACH_LINKS_FOR_ADMIN,
    { kind: 'divider' },
    ...TRAIN_LINKS_FOR_ADMIN,
  ];
}

export function tutorLinksForRole(role) {
  // Admins get the unified admin nav (Operate · Teach · Train) on
  // every tree. Keeps "Dashboard" pointing at /admin instead of
  // silently rebinding to /tutor/dashboard when an admin drills
  // into a tutor surface.
  if (role === 'admin') return adminLinks();
  if (role === 'manager') {
    return [...BASE_TUTOR_LINKS, ...MANAGER_LINKS];
  }
  return BASE_TUTOR_LINKS;
}
