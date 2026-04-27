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
          <Link href={links[0]?.href ?? '/dashboard'} className={s.logoLink}>
            {/* Plain <img> for the SVG wordmark. next/image blocks
                SVG sources by default (security via embedded
                scripts). The 1.8KB SVG renders natively in HTML —
                no optimization needed. Width adjusted from 140 to
                117 to keep the existing 28px nav height at the
                new 729×174 ≈ 4.19:1 aspect ratio. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/studyworks-logo.svg"
              alt="Studyworks"
              width={117}
              height={28}
              className={s.logo}
            />
          </Link>
          <div className={s.navLinks}>
            {links.map((link) => {
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
          <Link href="/account/billing" className={s.billingLink}>Account</Link>
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

// Active-link matcher. A link is active when its href is an exact
// pathname match, when the pathname starts with `${href}/` (so a
// nested route like /practice/s/abc/0 highlights its parent), or
// when the link supplies a matchPrefix that the pathname starts
// with. matchPrefix exists because the layout is a Server
// Component and can't pass a function across the boundary —
// strings it is. Accepts either a single string or an array of
// strings (useful when one tab should light up for several
// unrelated URL prefixes, e.g. /practice/tests + /practice/test).
function isActive(pathname, link) {
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
