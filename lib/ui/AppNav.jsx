// Studyworks shared top navigation, ported from the design-kit
// AppNav (Components.jsx) into the new tree.
//
// Used by every (student) page via app/next/(student)/layout.js.
// Pure-CSS via the colocated module — no inline styles. Active
// link state comes from usePathname() so the highlight tracks
// the URL without any manual prop wiring.
//
// Tutor / admin trees will get their own thin nav components
// later; the hierarchy of nav links is role-specific so a single
// shared component would only fragment with branching.

'use client';

import Link, { useLinkStatus } from 'next/link';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/browser';
import { isActive } from './nav-links';
import { StudyworksWordmark } from './StudyworksWordmark';
import s from './AppNav.module.css';

/**
 * @param {object} props
 * @param {{email: string, role: string, firstName?: string|null}} props.user
 * @param {Array<{href: string, label: string, match?: (path: string) => boolean}>} props.links
 * @param {React.ReactNode} [props.rightExtras] — optional slot for
 *   role-specific extras (e.g. a "Switch role" toggle for tutors).
 */
export function AppNav({ user, links, rightExtras = null }) {
  const pathname = usePathname() ?? '';

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    // Hard nav so the auth cookies clear and the next page render
    // sees a signed-out user. router.push wouldn't reset the
    // proxy's cached uiTree resolution this same way.
    window.location.href = '/login';
  }

  return (
    <nav className={s.nav}>
      <div className={s.navInner}>
        <div className={s.navLeft}>
          <Link href={links.find((l) => l.href)?.href ?? '/dashboard'} className={s.logoLink}>
            <StudyworksWordmark className={s.logo} />
          </Link>
          <div className={s.navLinks}>
            {links.map((link, i) => {
              if (link.kind === 'divider') {
                return <span key={`div-${i}`} className={s.navDivider} aria-hidden="true" />;
              }
              const active = isActive(pathname, link);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={active ? `${s.navLink} ${s.navLinkActive}` : s.navLink}
                  aria-current={active ? 'page' : undefined}
                >
                  <NavLinkLabel label={link.label} />
                </Link>
              );
            })}
          </div>
        </div>
        <div className={s.navRight}>
          {rightExtras}
          {user?.email && (
            <span className={s.userEmail} title={user.email}>
              {user.firstName || user.email}
            </span>
          )}
          {user?.role && (
            <span className={s.roleBadge}>{user.role}</span>
          )}
          <Link href="/account" className={s.billingLink}>Account</Link>
          <button
            type="button"
            onClick={handleSignOut}
            className={s.signOutBtn}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}

// Inner child of each <Link>. useLinkStatus is only valid as a
// descendant of next/link's Link, which is why this lives as a
// separate component instead of inline logic in AppNav. While the
// click is in flight (after click → before the new page commits)
// the label dims slightly and a small pending dot appears, so
// the user gets sub-100ms feedback that the click landed even
// before the route's loading.js renders.
function NavLinkLabel({ label }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? `${s.linkLabel} ${s.linkLabelPending}` : s.linkLabel}>
      {label}
      {pending && <span className={s.pendingDot} aria-hidden="true" />}
    </span>
  );
}

// isActive + StudyworksWordmark used to live here; they moved to
// ./nav-links (shared matcher — AppNav and AppSidebar must never
// disagree about which tab a URL belongs to) and
// ./StudyworksWordmark (shared asset) when the sidebar shell landed.
