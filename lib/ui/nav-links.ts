// Shared navigation config for the route-group layouts — the single
// source of truth for both chromes:
//
//   - AppNav (legacy top bar): consumes the flat link lists
//     (STUDENT_LINKS, tutorLinksForRole) exactly as it always has.
//   - AppSidebar (Phase 6.1 shell, behind the `sidebar_shell` flag):
//     consumes the sectioned variants (studentSections,
//     tutorSectionsForRole), which group the same links under titled
//     clusters and add icons.
//
// The student tree and tutor tree each render their own chrome, but a
// few surfaces (the practice-test instruction page, runner, and
// results) are shared infra under the (student) route group. When a
// tutor takes a test there, the (student) layout needs to render
// TUTOR-style nav so the buttons link back into the tutor surfaces
// instead of /dashboard, /review, etc.
//
// Admin navigation: admins need access to *all three* roles' tools
// — admin platform tools (Operate), tutor/manager surfaces (Teach),
// and the student-side practice runner (Train) for dogfooding +
// content review. Rather than swap navs as the admin moves between
// route groups (which made "Dashboard" mean different things on
// different pages), the admin nav is one unified union exposed by
// `adminLinks()` / the 'admin' branch of the section builders. All
// three layouts render this same union for role === 'admin', so the
// nav is identical regardless of which subtree the page lives under.
//
// Icons are string keys, not component references — this module is
// imported by `node --test` (lib/ui/nav-links.test.mjs), which can
// strip TS types but cannot parse the JSX in lib/ui/icons.jsx.
// AppSidebar owns the key → component map.

export type NavIconName =
  | 'today'
  | 'dashboard'
  | 'practice'
  | 'test'
  | 'inbox'
  | 'notes'
  | 'review'
  | 'learn'
  | 'help'
  | 'roster'
  | 'performance'
  | 'train'
  | 'teachers'
  | 'users'
  | 'questions'
  | 'lessons';

export interface NavLink {
  href: string;
  label: string;
  /** Extra pathname prefixes that light this link up (the layouts are
   *  Server Components, so matchers must be serializable strings). */
  matchPrefix?: string | readonly string[];
  /** Sidebar icon key (resolved by AppSidebar). AppNav ignores it. */
  icon?: NavIconName;
}

export interface NavDivider {
  kind: 'divider';
}

export type NavItem = NavLink | NavDivider;

/** A titled cluster of links in the sidebar. `title: null` renders
 *  the links without a heading (used for standalone anchors like
 *  Dashboard and Help). */
export interface NavSection {
  title: string | null;
  links: readonly NavLink[];
}

// ── Individual links ─────────────────────────────────────────────
// Defined once and composed into both the flat lists (AppNav) and
// the sections (AppSidebar) so a route change edits one place.

// Today is the study plan's daily surface (§2.3) and the sidebar's
// anchor item. Sidebar-only, like Learn — the flag-off AppNav must stay
// byte-identical to the pre-sidebar chrome — and only offered when the
// student actually has an active plan (studentSections's hasPlan).
const STUDENT_TODAY: NavLink = {
  href: '/today', label: 'Today', icon: 'today',
};
const STUDENT_DASHBOARD: NavLink = {
  href: '/dashboard', label: 'Dashboard', icon: 'dashboard',
};
// "Practice" owns self-guided sessions; matchPrefix picks up the
// session runner (/practice/s/...) + history too.
const STUDENT_PRACTICE: NavLink = {
  href: '/practice/start', label: 'Practice', icon: 'practice',
  matchPrefix: ['/practice/start', '/practice/s', '/practice/history', '/practice/review'],
};
// "Practice tests" owns full-length simulations. The launch hub
// lives at the plural /practice/tests; the per-test instruction
// page and the runner/results live under the singular
// /practice/test — both need to keep this tab highlighted.
const STUDENT_TESTS: NavLink = {
  href: '/practice/tests', label: 'Practice tests', icon: 'test',
  matchPrefix: ['/practice/tests', '/practice/test'],
};
const STUDENT_ASSIGNMENTS: NavLink = {
  href: '/assignments', label: 'Assignments', icon: 'inbox',
};
// Notes is the management hub for the three kinds of notes the
// student keeps: rich-text notes, error-log entries, flashcards.
// matchPrefix lights the tab on every /notes/* subroute (manage)
// plus the per-note detail page (/notes/[id]).
const STUDENT_NOTES: NavLink = {
  href: '/notes', label: 'Notes', icon: 'notes', matchPrefix: '/notes',
};
// Review is the study hub — Common Errors / Weak Queue drills,
// SAT countdown, and the three review-mode entry points back
// into the note kinds.
const STUDENT_REVIEW: NavLink = {
  href: '/review', label: 'Review', icon: 'review',
};
// Learn is the lesson library. Sidebar-only for now — it has never
// had a top-nav tab, and the flag-off AppNav must stay byte-identical
// to the pre-sidebar chrome.
const STUDENT_LEARN: NavLink = {
  href: '/learn', label: 'Learn', icon: 'learn', matchPrefix: '/learn',
};
// Help is the new-student onboarding hub. Last so it doesn't
// displace the daily-driver tabs above, but always present so a
// stuck student is one click away from a guide.
const STUDENT_HELP: NavLink = {
  href: '/help', label: 'Help', icon: 'help', matchPrefix: '/help',
};

export const STUDENT_LINKS: readonly NavLink[] = [
  STUDENT_DASHBOARD,
  STUDENT_PRACTICE,
  STUDENT_TESTS,
  STUDENT_ASSIGNMENTS,
  STUDENT_NOTES,
  STUDENT_REVIEW,
  STUDENT_HELP,
];

const TUTOR_DASHBOARD: NavLink = {
  href: '/tutor/dashboard', label: 'Dashboard', icon: 'dashboard',
};
// Roster is the management surface for the tutor's student cohort —
// searchable / filterable / sortable list with quick-edit affordances
// on each row. Distinct from Dashboard, which is a "find a student"
// landing page; Roster is "manage them".
const TUTOR_ROSTER: NavLink = {
  href: '/tutor/roster', label: 'Roster', icon: 'roster',
  matchPrefix: ['/tutor/roster', '/tutor/students'],
};
const TUTOR_ASSIGNMENTS: NavLink = {
  href: '/tutor/assignments', label: 'Assignments', icon: 'inbox',
  matchPrefix: '/tutor/assignments',
};
// Lesson packs — sidebar-only. The surface has existed at
// /tutor/lesson-packs since the rebuild but never had a top-nav tab
// (upgrade plan §6.1 calls it "currently orphaned off-nav").
const TUTOR_LESSON_PACKS: NavLink = {
  href: '/tutor/lesson-packs', label: 'Lesson packs', icon: 'lessons',
  matchPrefix: '/tutor/lesson-packs',
};
const TUTOR_PERFORMANCE: NavLink = {
  href: '/tutor/performance', label: 'Performance', icon: 'performance',
};
// The Train context is the teacher's own SAT practice and review —
// kept separate from the rosters they teach. The matchPrefix lights
// up for everything under /tutor/training, including the practice
// runner + assignment + review subpages, and also the shared-infra
// /practice/test/* surfaces a tutor reaches via /tutor/training/tests
// → "Launch test".
const TUTOR_TRAIN: NavLink = {
  href: '/tutor/training', label: 'Train', icon: 'train',
  matchPrefix: ['/tutor/training', '/practice/test', '/flashcards'],
};
const MANAGER_TEACHERS: NavLink = {
  href: '/tutor/teachers', label: 'Teachers', icon: 'teachers',
  matchPrefix: '/tutor/teachers',
};

const BASE_TUTOR_LINKS: readonly NavLink[] = [
  TUTOR_DASHBOARD,
  TUTOR_ROSTER,
  TUTOR_ASSIGNMENTS,
  TUTOR_PERFORMANCE,
  TUTOR_TRAIN,
];

// ── Admin navigation: three clusters ─────────────────────────────
// The top bar joins them with dividers; the sidebar renders them as
// titled sections.

const ADMIN_OVERVIEW: NavLink = {
  href: '/admin', label: 'Overview', icon: 'dashboard',
};
const ADMIN_USERS: NavLink = {
  href: '/admin/users', label: 'Users', icon: 'users',
  matchPrefix: '/admin/users',
};
// Questions tab also lights up for /admin/content (drafts, score
// curves, thresholds) and for /tutor/review/<id> in case a stray
// cross-tree link bounces the admin into the tutor question detail
// page — the tab still reads as "you are in Questions".
const ADMIN_QUESTIONS: NavLink = {
  href: '/admin/questions', label: 'Questions', icon: 'questions',
  matchPrefix: ['/admin/questions', '/admin/content', '/tutor/review'],
};
const ADMIN_LESSONS: NavLink = {
  href: '/admin/lessons', label: 'Lessons', icon: 'lessons',
  matchPrefix: '/admin/lessons',
};
const ADMIN_PERFORMANCE: NavLink = {
  href: '/admin/performance', label: 'Performance', icon: 'performance',
  matchPrefix: '/admin/performance',
};

const OPERATE_LINKS: readonly NavLink[] = [
  ADMIN_OVERVIEW,
  ADMIN_USERS,
  ADMIN_QUESTIONS,
  ADMIN_LESSONS,
  ADMIN_PERFORMANCE,
];

// Teach cluster: the tutor/manager surfaces an admin needs day-to-
// day. /tutor/dashboard and /tutor/performance are intentionally
// omitted — the admin already has /admin (Overview) and
// /admin/performance (cohort-wide) for those purposes — but both
// remain reachable via direct URL or by drilling into a teacher
// from /tutor/teachers/[id].
const TEACH_LINKS_FOR_ADMIN: readonly NavLink[] = [
  TUTOR_ROSTER,
  TUTOR_ASSIGNMENTS,
  { ...MANAGER_TEACHERS, icon: 'teachers' },
];

const TRAIN_LINKS_FOR_ADMIN: readonly NavLink[] = [TUTOR_TRAIN];

/** Admin top-bar union. Dividers are { kind: 'divider' } sentinels —
 *  AppNav renders them as a thin vertical hairline between clusters
 *  and skips matchPrefix logic on them. */
export function adminLinks(): NavItem[] {
  return [
    ...OPERATE_LINKS,
    { kind: 'divider' },
    ...TEACH_LINKS_FOR_ADMIN,
    { kind: 'divider' },
    ...TRAIN_LINKS_FOR_ADMIN,
  ];
}

/** Top-bar links for the tutor tree (AppNav). Admins get the unified
 *  admin nav (Operate · Teach · Train) on every tree — keeps
 *  "Dashboard" pointing at /admin instead of silently rebinding to
 *  /tutor/dashboard when an admin drills into a tutor surface. */
export function tutorLinksForRole(role: string): NavItem[] {
  if (role === 'admin') return adminLinks();
  if (role === 'manager') {
    return [...BASE_TUTOR_LINKS, MANAGER_TEACHERS];
  }
  return [...BASE_TUTOR_LINKS];
}

// ── Sidebar sections (Phase 6.1) ─────────────────────────────────
// Same links, grouped. Section titles follow the upgrade plan §6.1
// structure, mapped onto the surfaces that exist today ("Today" joins
// the top of the student list when Phase 2.3 ships it).

/** Student sidebar. `hasTutor: false` drops the Assignments link —
 *  self-studying students never see assignments (mirrors the AppNav
 *  behavior in app/(student)/layout.js). `hasPlan: true` puts Today at
 *  the top as the anchor item (§2.3); without an active plan the link
 *  would open an empty surface, so it stays hidden. */
export function studentSections(
  { hasTutor = true, hasPlan = false }: { hasTutor?: boolean; hasPlan?: boolean } = {},
): NavSection[] {
  const practice = hasTutor
    ? [STUDENT_PRACTICE, STUDENT_TESTS, STUDENT_ASSIGNMENTS]
    : [STUDENT_PRACTICE, STUDENT_TESTS];
  const anchor = hasPlan ? [STUDENT_TODAY, STUDENT_DASHBOARD] : [STUDENT_DASHBOARD];
  return [
    { title: null, links: anchor },
    { title: 'Practice', links: practice },
    { title: 'Study', links: [STUDENT_REVIEW, STUDENT_NOTES, STUDENT_LEARN] },
    { title: null, links: [STUDENT_HELP] },
  ];
}

const TEACHER_SECTIONS: readonly NavSection[] = [
  { title: 'Teach', links: [TUTOR_DASHBOARD, TUTOR_ROSTER] },
  { title: 'Assign', links: [TUTOR_ASSIGNMENTS, TUTOR_LESSON_PACKS] },
  { title: 'Analyze', links: [TUTOR_PERFORMANCE] },
  { title: 'Train', links: [TUTOR_TRAIN] },
];

const ADMIN_SECTIONS: readonly NavSection[] = [
  { title: 'Operate', links: OPERATE_LINKS },
  { title: 'Teach', links: TEACH_LINKS_FOR_ADMIN },
  { title: 'Train', links: TRAIN_LINKS_FOR_ADMIN },
];

/** Sidebar sections for the tutor/admin trees. Mirrors
 *  tutorLinksForRole's role semantics. */
export function tutorSectionsForRole(role: string): NavSection[] {
  if (role === 'admin') return [...ADMIN_SECTIONS];
  if (role === 'manager') {
    return [...TEACHER_SECTIONS, { title: 'Team', links: [MANAGER_TEACHERS] }];
  }
  return [...TEACHER_SECTIONS];
}

// ── Active-link matching ─────────────────────────────────────────
// A link is active when its href is an exact pathname match, when the
// pathname starts with `${href}/` (so a nested route like
// /practice/s/abc/0 highlights its parent), or when the link supplies
// a matchPrefix that the pathname starts with. Shared by AppNav and
// AppSidebar so the two chromes can never disagree about which tab a
// URL belongs to.

export function isActive(pathname: string, link: NavLink): boolean {
  const prefixes = Array.isArray(link.matchPrefix)
    ? link.matchPrefix
    : link.matchPrefix
      ? [link.matchPrefix]
      : [];
  for (const prefix of prefixes) {
    if (!prefix) continue;
    if (pathname === prefix) return true;
    if (pathname.startsWith(`${prefix}/`)) return true;
  }
  if (pathname === link.href) return true;
  if (pathname.startsWith(`${link.href}/`)) return true;
  return false;
}

// ── Focus-mode shell suppression (Phase 6.1) ─────────────────────
// The live runner surfaces suppress the sidebar entirely so the
// question canvas keeps its full width (upgrade plan §6.1 "runner and
// presenter routes suppress the shell"). Deliberately narrow: the
// attempt lobby, instruction, and results pages keep the shell — only
// the timed/positioned question surfaces go bare. The legacy top-nav
// chrome never suppresses (it never did).

const SHELL_SUPPRESSED_PATTERNS: readonly RegExp[] = [
  /^\/practice\/s\//,                       // student session runner
  /^\/tutor\/training\/practice\/s\//,      // tutor training runner
  /^\/practice\/test\/attempt\/[^/]+\/m\//, // test module runner + module review
];

export function isShellSuppressedPath(pathname: string): boolean {
  return SHELL_SUPPRESSED_PATTERNS.some((re) => re.test(pathname));
}
