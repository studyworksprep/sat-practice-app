// Dismissible "New here?" banner for accounts under 30 days old.
//
// This component used to ALSO redirect brand-new accounts to
// /help?welcome=1 on their first dashboard render. That redirect is
// gone (docs/student-onboarding-and-plan-redesign-2026-09.md §2): a new
// student's first stop is the onboarding intake at /welcome, which the
// student layout routes to server-side. Help stays a reference.
//
// The banner points at the plan when there isn't one yet and at Help
// otherwise. Dismissal is stored in localStorage rather than a profiles
// column so it needs no migration; calls are wrapped in try/catch so a
// quota failure degrades to "banner stays visible" rather than throwing.
//
// Rendered as a leaf inside DashboardInteractive (already a client
// island), so this stays a sibling component rather than a separate
// island that fetches its own data.

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { IconTile } from '@/lib/ui/IconTile';
import { InfoIcon } from '@/lib/ui/icons';

const DISMISSED_KEY = 'studyworks_help_banner_dismissed';
const BANNER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;  // 30d

function safeGet(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* quota — ignore */ }
}

export function HelpDashboardBanner({ accountCreatedAt, hasActivePlan = false }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!accountCreatedAt) return;
    const createdAt = new Date(accountCreatedAt).getTime();
    if (Number.isNaN(createdAt)) return;
    const age = Date.now() - createdAt;
    if (!safeGet(DISMISSED_KEY) && age < BANNER_WINDOW_MS) setShow(true);
  }, [accountCreatedAt]);

  function dismiss() {
    safeSet(DISMISSED_KEY, '1');
    setShow(false);
  }

  if (!show) return null;

  const title = hasActivePlan
    ? 'New here? The Help guide covers every part of the app.'
    : 'New here? Your study plan is the place to start.';
  const body = hasActivePlan
    ? 'Short guides for practice sessions, tests, notes, and review — read whichever answers your current question.'
    : 'A few questions about where you are and when you can study, and the app opens each day to exactly what to do next.';
  const href = hasActivePlan ? '/help' : '/welcome';
  const cta = hasActivePlan ? 'Open Help' : 'Set up my plan';

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
        background: 'linear-gradient(135deg, var(--color-navy-50, #f0f4f8) 0%, #e9eef4 100%)',
        border: '1px solid var(--accent, #102a43)',
      }}
    >
      <IconTile icon={InfoIcon} palette="gold" size="md" />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600, fontSize: 14, color: 'var(--accent, #102a43)' }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: 'var(--fg2, #555)', marginTop: 2 }}>
          {body}
        </div>
      </div>
      <Link
        href={href}
        style={{
          fontSize: 13,
          fontWeight: 600,
          padding: '6px 14px',
          borderRadius: 6,
          background: 'var(--accent, #102a43)',
          color: '#fff',
          textDecoration: 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {cta}
      </Link>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss banner"
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
