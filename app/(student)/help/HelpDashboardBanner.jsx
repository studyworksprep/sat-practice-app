// Two related jobs in one component:
//
//   1. First-login redirect — if the account was created in the last
//      24 hours and the user has never been to /help on this device,
//      route them to /help?welcome=1 once. Mark the device as having
//      seen the intro afterward so the redirect is a one-shot.
//
//   2. Dismissible "New here?" banner — for accounts under 30 days
//      old that haven't dismissed it, render a friendly pointer to
//      /help on top of the dashboard.
//
// State is stored in localStorage rather than a profiles column so
// adding the feature doesn't require a migration. Per CLAUDE.md the
// existing audit flagged a previous localStorage quota crash; calls
// here are wrapped in try/catch so a quota failure degrades to
// "banner stays visible / redirect doesn't fire" rather than
// throwing.
//
// Rendered as a leaf inside DashboardInteractive (already a client
// island), so this stays a sibling component rather than a separate
// island that fetches its own data.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const SEEN_KEY = 'studyworks_help_intro_seen';
const DISMISSED_KEY = 'studyworks_help_banner_dismissed';
const REDIRECT_WINDOW_MS = 24 * 60 * 60 * 1000;     // 24h
const BANNER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;  // 30d

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* quota — ignore */ }
}

export function HelpDashboardBanner({ accountCreatedAt }) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!accountCreatedAt) return;
    const createdAt = new Date(accountCreatedAt).getTime();
    if (Number.isNaN(createdAt)) return;
    const age = Date.now() - createdAt;

    const seen = safeGet(SEEN_KEY);
    const dismissed = safeGet(DISMISSED_KEY);

    // First-login redirect: only for brand-new accounts, once per
    // device. Setting SEEN_KEY before navigating prevents a loop if
    // the user immediately comes back.
    if (!seen && age < REDIRECT_WINDOW_MS) {
      safeSet(SEEN_KEY, '1');
      router.replace('/help?welcome=1');
      return;
    }

    // Mark seen on first render for older accounts too, so the flag
    // converges to a known state once the user has shown up.
    if (!seen) safeSet(SEEN_KEY, '1');

    if (!dismissed && age < BANNER_WINDOW_MS) {
      setShow(true);
    }
  }, [accountCreatedAt, router]);

  function dismiss() {
    safeSet(DISMISSED_KEY, '1');
    setShow(false);
  }

  if (!show) return null;

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        marginBottom: 16,
        borderRadius: 10,
        background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)',
        border: '1px solid var(--accent, #4f46e5)',
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>👋</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent, #4f46e5)' }}>
          New here? Start with the Help guide.
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg2, #555)', marginTop: 2 }}>
          A 2-minute orientation plus a self-study routine and tips for
          getting the most out of the platform.
        </div>
      </div>
      <Link
        href="/help"
        style={{
          fontSize: 13,
          fontWeight: 600,
          padding: '6px 14px',
          borderRadius: 6,
          background: 'var(--accent, #4f46e5)',
          color: '#fff',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        Open Help
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss help banner"
        title="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          fontSize: 20,
          lineHeight: 1,
          cursor: 'pointer',
          color: 'var(--fg2, #888)',
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}
