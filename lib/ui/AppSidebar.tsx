// AppShell / AppSidebar — the Phase 6.1 sidebar chrome
// (docs/upgrade-plan-2026-07.md §6.1), rendered by the three
// route-group layouts when the `sidebar_shell` feature flag enables
// it for the user's role (lib/flags-server.ts). The legacy AppNav
// stays mounted when the flag is off, so this component must be a
// pure alternative shell: same links (from lib/ui/nav-links), same
// active-state matcher, same account/sign-out affordances.
//
// Behaviors:
//   - Desktop: sticky full-height sidebar; collapse toggle shrinks it
//     to an icon rail (preference persisted in localStorage — restored
//     after mount, so a collapsed user sees a brief expanded flash on
//     hard loads; acceptable v1 trade against SSR/localStorage
//     hydration mismatches).
//   - Mobile (<768px): slim top bar with a hamburger; the sidebar
//     slides in as a drawer over a backdrop, closes on navigation,
//     backdrop click, or Escape.
//   - Phone tab bar (`tabs`, students only): four destinations plus
//     "More", which opens the same drawer. With tabs the hamburger
//     goes and the header slot (SAT/ACT switch) moves into the top bar.
//   - `footer` slot sits above the account box — reserved for the
//     student countdown/streak strip when Phase 2.3 ships "Today".
//
// The live runner surfaces never render this shell at all — the
// layouts return bare children on isShellSuppressedPath() paths.

'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { IconTile } from './IconTile';
import { StudyworksWordmark } from './StudyworksWordmark';
import { activeTabHref, isActive, isShellSuppressedPath } from './nav-links';
import type { NavIconName, NavLink, NavSection } from './nav-links';
import {
  BarChartIcon,
  BookmarkIcon,
  BookOpenIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  GraduationCapIcon,
  InboxIcon,
  InformationIcon,
  PencilIcon,
  PerformanceIcon,
  QuestionBankIcon,
  RosterIcon,
  TargetIcon,
  TestIcon,
  TutorIcon,
  UsersIcon,
  ClipboardCheckIcon,
} from './icons';
import s from './AppSidebar.module.css';

type IconComponent = ComponentType<{ size?: number; className?: string }>;

// The icon components live in untyped icons.jsx, whose un-defaulted
// `className` destructure makes TS infer it as a *required* prop —
// normalize each one through `unknown` once, here at the seam.
const asIcon = (icon: unknown): IconComponent => icon as IconComponent;

// nav-links.ts stays JSX-free (unit-testable under node --test), so
// links carry string icon keys and this map owns the components.
const NAV_ICONS: Record<NavIconName, IconComponent> = {
  plan: asIcon(ClipboardCheckIcon),
  dashboard: asIcon(BarChartIcon),
  practice: asIcon(PencilIcon),
  test: asIcon(TestIcon),
  inbox: asIcon(InboxIcon),
  notes: asIcon(BookmarkIcon),
  review: asIcon(TargetIcon),
  learn: asIcon(GraduationCapIcon),
  help: asIcon(InformationIcon),
  roster: asIcon(RosterIcon),
  performance: asIcon(PerformanceIcon),
  train: asIcon(PencilIcon),
  teachers: asIcon(TutorIcon),
  users: asIcon(UsersIcon),
  questions: asIcon(QuestionBankIcon),
  lessons: asIcon(BookOpenIcon),
  // Contributions reuse the question-bank glyph: what a contribution
  // ultimately feeds is the calibration data behind score reporting.
  contribute: asIcon(QuestionBankIcon),
};

// Aliased through the same seam as NAV_ICONS.
const ChevronLeft = asIcon(ChevronLeftIcon);
const ChevronRight = asIcon(ChevronRightIcon);

const COLLAPSE_KEY = 'sw:sidebar-collapsed';

interface ShellUser {
  email?: string | null;
  role?: string | null;
  firstName?: string | null;
}

/** A small count shown on a nav link, e.g. "6 due" on Review. */
export interface NavBadge {
  label: string;
  /** `alert` for work that is late; `neutral` for work that is waiting. */
  tone: 'alert' | 'neutral';
}

interface AppShellProps {
  user: ShellUser;
  sections: readonly NavSection[];
  /** Rendered under the logo (the student SAT/ACT switch). */
  headerSlot?: ReactNode;
  /** Counts keyed by link href. */
  badges?: Readonly<Record<string, NavBadge>>;
  /** Rendered above the account box (Phase 2.3 countdown/streak). */
  footer?: ReactNode;
  /** Phone bottom tabs (<768px); "More" is added and opens the drawer. */
  tabs?: readonly NavLink[];
  children: ReactNode;
}

export function AppShell({ user, sections, headerSlot, badges, footer, tabs, children }: AppShellProps) {
  const pathname = usePathname() ?? '';
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Restore the desktop collapse preference after mount (reading
  // localStorage during render would desync SSR hydration).
  useEffect(() => {
    try {
      if (window.localStorage.getItem(COLLAPSE_KEY) === '1') setCollapsed(true);
    } catch {
      // storage unavailable (private mode etc.) — stay expanded
    }
  }, []);

  // The drawer never survives a navigation or an Escape press.
  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setDrawerOpen(false);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      try {
        window.localStorage.setItem(COLLAPSE_KEY, prev ? '0' : '1');
      } catch {
        // preference just won't persist
      }
      return !prev;
    });
  }, []);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard nav so the auth cookies clear and the next page render
    // sees a signed-out user (same rationale as AppNav).
    window.location.href = '/login';
  }

  // Focus-mode suppression lives HERE, not in the server layouts:
  // App Router layouts do not re-render on client-side navigation,
  // so a pathname check up there only works on hard loads — a soft
  // nav into the runner would keep the shell mounted. usePathname()
  // updates on every navigation (and is request-accurate during
  // SSR), so this branch handles both. Placed after all hooks to
  // keep the hook order stable across suppressed/normal renders.
  if (isShellSuppressedPath(pathname)) {
    return <>{children}</>;
  }

  const home = sections[0]?.links[0]?.href ?? '/dashboard';
  const hasTabs = Boolean(tabs && tabs.length > 0);
  const shellClass = [s.shell, collapsed && s.shellCollapsed, hasTabs && s.shellTabs]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={shellClass}>
      {/* Mobile-only top strip: hamburger (or, with tabs, the header slot) + wordmark */}
      <header className={s.mobileBar}>
        {!hasTabs && (
          <button
            type="button"
            className={s.hamburger}
            aria-label="Open navigation"
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <span /><span /><span />
          </button>
        )}
        <Link href={home} className={s.mobileLogoLink} aria-label="Studyworks home">
          <StudyworksWordmark />
        </Link>
        {hasTabs && headerSlot && <div className={s.mobileBarSlot}>{headerSlot}</div>}
      </header>

      {drawerOpen && (
        <div
          className={s.backdrop}
          onClick={() => setDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={drawerOpen ? `${s.sidebar} ${s.sidebarOpen}` : s.sidebar}>
        <div className={s.sidebarTop}>
          <Link href={home} className={s.logoLink} aria-label="Studyworks home">
            <StudyworksWordmark variant={collapsed ? 'mark' : 'full'} />
          </Link>
          <button
            type="button"
            className={s.collapseBtn}
            onClick={toggleCollapsed}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
          </button>
        </div>

        {headerSlot && <div className={s.headerSlot}>{headerSlot}</div>}

        <nav className={s.nav} aria-label="Primary">
          {sections.map((section, i) => (
            <div key={section.title ?? `untitled-${i}`} className={s.section}>
              {section.title && (
                <div className={s.sectionTitle}>{section.title}</div>
              )}
              {section.links.map((link) => (
                <SidebarLink
                  key={link.href}
                  link={link}
                  active={isActive(pathname, link)}
                  collapsed={collapsed}
                  badge={badges?.[link.href] ?? null}
                />
              ))}
            </div>
          ))}
        </nav>

        {footer && <div className={s.footerSlot}>{footer}</div>}

        <div className={s.userBox}>
          {(user?.firstName || user?.email) && (
            <div className={s.userIdentity} title={user.email ?? undefined}>
              <span className={s.userName}>{user.firstName || user.email}</span>
              {/* Staff roles are worth labelling; a student seeing "student" learns nothing. */}
              {user?.role && user.role !== 'student' && (
                <span className={s.roleBadge}>{user.role}</span>
              )}
            </div>
          )}
          <div className={s.userActions}>
            <Link href="/account" className={s.accountLink}>Account</Link>
            <button type="button" onClick={handleSignOut} className={s.signOutBtn}>
              Sign out
            </button>
          </div>
        </div>
      </aside>

      <div className={s.content}>{children}</div>

      {hasTabs && tabs && (
        <TabBar
          tabs={tabs}
          pathname={pathname}
          badges={badges}
          drawerOpen={drawerOpen}
          onMore={() => setDrawerOpen(true)}
        />
      )}
    </div>
  );
}

// Phone tab bar. A tab lights when the URL belongs to it; any other
// page lights "More", so the bar always says where you are. Badges
// show as a dot (count in the accessible name); badges on links that
// live only in the drawer put their dot on More.
function TabBar({
  tabs,
  pathname,
  badges,
  drawerOpen,
  onMore,
}: {
  tabs: readonly NavLink[];
  pathname: string;
  badges?: Readonly<Record<string, NavBadge>>;
  drawerOpen: boolean;
  onMore: () => void;
}) {
  const active = activeTabHref(pathname, tabs);
  const tabHrefs = new Set(tabs.map((t) => t.href));
  const moreBadges = Object.entries(badges ?? {})
    .filter(([href]) => !tabHrefs.has(href))
    .map(([, b]) => b);
  const moreAlert = moreBadges.some((b) => b.tone === 'alert');
  return (
    <nav className={s.tabBar} aria-label="Main">
      {tabs.map((tab) => {
        const Icon = tab.icon ? NAV_ICONS[tab.icon] : null;
        const on = active === tab.href;
        const badge = badges?.[tab.href] ?? null;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={on ? `${s.tab} ${s.tabOn}` : s.tab}
            aria-current={on ? 'page' : undefined}
          >
            <span className={s.tabIcon}>
              {Icon && <Icon size={22} />}
              {badge && <TabDot alert={badge.tone === 'alert'} />}
            </span>
            <TabLabel label={tab.label} />
            {badge && <span className={s.srOnly}>, {badge.label}</span>}
          </Link>
        );
      })}
      <button
        type="button"
        className={active === null && !drawerOpen ? `${s.tab} ${s.tabOn}` : s.tab}
        aria-expanded={drawerOpen}
        aria-current={active === null ? 'page' : undefined}
        onClick={onMore}
      >
        <span className={s.tabIcon}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {moreBadges.length > 0 && <TabDot alert={moreAlert} />}
        </span>
        <span className={s.tabLabel}>More</span>
        {moreBadges.length > 0 && (
          <span className={s.srOnly}>, {moreBadges.map((b) => b.label).join(', ')}</span>
        )}
      </button>
    </nav>
  );
}

function TabDot({ alert }: { alert: boolean }) {
  return <span className={alert ? `${s.tabDot} ${s.tabDotAlert}` : s.tabDot} aria-hidden="true" />;
}

function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return <span className={pending ? `${s.tabLabel} ${s.linkLabelPending}` : s.tabLabel}>{label}</span>;
}

function SidebarLink({
  link,
  active,
  collapsed,
  badge,
}: {
  link: NavLink;
  active: boolean;
  collapsed: boolean;
  badge: NavBadge | null;
}) {
  const Icon = link.icon ? NAV_ICONS[link.icon] : null;
  return (
    <Link
      href={link.href}
      className={active ? `${s.link} ${s.linkActive}` : s.link}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? (badge ? `${link.label} · ${badge.label}` : link.label) : undefined}
    >
      {Icon ? (
        <IconTile
          icon={Icon}
          palette={active ? 'navy' : 'slate'}
          size="sm"
          className={s.linkTile}
        />
      ) : (
        <span className={s.linkTilePlaceholder} aria-hidden="true" />
      )}
      <SidebarLinkLabel label={link.label} />
      {badge && (
        <span className={badge.tone === 'alert' ? `${s.badge} ${s.badgeAlert}` : s.badge}>
          {badge.label}
        </span>
      )}
    </Link>
  );
}

// Inner child of each <Link>. useLinkStatus is only valid as a
// descendant of next/link's Link (same pattern as AppNav): while the
// click is in flight the label dims and a pending dot appears, so the
// user gets sub-100ms feedback before the route's loading.js renders.
function SidebarLinkLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? `${s.linkLabel} ${s.linkLabelPending}` : s.linkLabel}>
      {label}
      {pending && <span className={s.pendingDot} aria-hidden="true" />}
    </span>
  );
}
