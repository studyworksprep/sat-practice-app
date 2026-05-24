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

// Inline SVG wordmark. Inlined rather than served from
// /studyworks-logo.svg so the markup ships with the layout and
// the DOM <svg> node persists across child-page navigations —
// the prior <img> approach caused a visible flicker each time
// the runner advanced a position because the file was being
// re-validated on every navigation. The shapes + colors come
// straight from the design-system asset; only the surrounding
// JSX wrapper is new.
function StudyworksWordmark({ className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 729 174"
      width={117}
      height={28}
      role="img"
      aria-label="Studyworks"
      className={className}
    >
      <g transform="translate(68, 94)">
        <g fill="#102a43">
          <g>
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <g transform="rotate(45)">
            <rect x="-8" y="-66" width="16" height="16" rx="2.5" />
            <rect x="-8" y="50" width="16" height="16" rx="2.5" />
            <rect x="-66" y="-8" width="16" height="16" rx="2.5" />
            <rect x="50" y="-8" width="16" height="16" rx="2.5" />
          </g>
          <circle r="50" />
        </g>
        <circle r="16" fill="#ffffff" />
      </g>
      <g transform="translate(124, 36) rotate(22)">
        <g fill="#bf8700">
          <g>
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <g transform="rotate(45)">
            <rect x="-5" y="-38" width="10" height="10" rx="1.8" />
            <rect x="-5" y="28" width="10" height="10" rx="1.8" />
            <rect x="-38" y="-5" width="10" height="10" rx="1.8" />
            <rect x="28" y="-5" width="10" height="10" rx="1.8" />
          </g>
          <circle r="28" />
        </g>
        <circle r="9" fill="#ffffff" />
      </g>
      <text
        x="170"
        y="124"
        fontFamily="'Playfair Display', Georgia, serif"
        fontWeight="700"
        fontSize="86"
        letterSpacing="-1.3"
        fill="#102a43"
      >
        Study<tspan fill="#bf8700">works</tspan>
      </text>
    </svg>
  );
}
