'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

// Two related jobs in one component:
//   1. First-login redirect: if the account is brand-new (created within the
//      last 24h) and the user has never seen the help page on this device,
//      send them to /help?welcome=1 once.
//   2. New-user banner: for accounts created within the last 30 days that
//      have not dismissed the banner, render a friendly pointer to /help.
//
// State is stored in localStorage rather than the database to avoid a
// schema change for a UX-only flag.

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

export default function HelpDashboardBanner({ accountCreatedAt }) {
  const router = useRouter();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!accountCreatedAt) return;
    const createdAt = new Date(accountCreatedAt).getTime();
    if (Number.isNaN(createdAt)) return;
    const age = Date.now() - createdAt;

    const seen = safeGet(SEEN_KEY);
    const dismissed = safeGet(DISMISSED_KEY);

    // First-login redirect: only for brand-new accounts, once per device.
    if (!seen && age < REDIRECT_WINDOW_MS) {
      safeSet(SEEN_KEY, '1');
      router.replace('/help?welcome=1');
      return;
    }

    // Mark seen the first time we render for an older account too, so the
    // banner can hide itself naturally once the user clicks through.
    if (!seen) safeSet(SEEN_KEY, '1');

    // Banner: shown for the first 30 days unless dismissed.
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
      className="card"
      style={{
        padding: '14px 18px',
        marginBottom: 16,
        background: 'linear-gradient(135deg, #f0f4ff 0%, #e8eeff 100%)',
        border: '1px solid var(--accent)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
    >
      <span style={{ fontSize: 22, lineHeight: 1 }} aria-hidden>👋</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent)' }}>
          New here? Start with the Help guide.
        </div>
        <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>
          A 2-minute orientation plus a self-study routine and tips for getting the most out of the platform.
        </div>
      </div>
      <Link
        href="/help"
        className="btn"
        style={{ fontSize: 13, padding: '6px 14px', whiteSpace: 'nowrap' }}
      >
        Open Help
      </Link>
      <button
        onClick={dismiss}
        aria-label="Dismiss help banner"
        title="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          fontSize: 20,
          lineHeight: 1,
          cursor: 'pointer',
          color: 'var(--muted, #888)',
          padding: '0 4px',
        }}
      >
        ×
      </button>
    </div>
  );
}
