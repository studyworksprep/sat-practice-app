'use client';

// A small, dismissible pointer to the Help guide for a student's first
// few dashboard visits (owner note 2026-09-17: the old full-width help
// banner competed with the plan for attention; keep only a light nudge
// on the first logins). Shows on the first three dashboard visits of an
// account under 14 days old, counted in localStorage; dismissal ends it
// early. All storage calls are guarded so a quota failure just means the
// nudge shows again.

import { useEffect, useState } from 'react';
import Link from 'next/link';
import s from './HelpNudge.module.css';

const COUNT_KEY = 'studyworks_help_nudge_visits';
const DISMISSED_KEY = 'studyworks_help_nudge_dismissed';
const MAX_VISITS = 3;
const ACCOUNT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

function safeGet(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function safeSet(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* quota — ignore */ }
}

export function HelpNudge({ accountCreatedAt }: { accountCreatedAt: string | null }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!accountCreatedAt) return;
    const createdAt = new Date(accountCreatedAt).getTime();
    if (Number.isNaN(createdAt) || Date.now() - createdAt > ACCOUNT_WINDOW_MS) return;
    if (safeGet(DISMISSED_KEY)) return;
    const visits = Number(safeGet(COUNT_KEY) ?? '0') + 1;
    safeSet(COUNT_KEY, String(visits));
    if (visits <= MAX_VISITS) setShow(true);
  }, [accountCreatedAt]);

  if (!show) return null;

  return (
    <div className={s.nudge} role="status">
      <span className={s.text}>
        New here? The <Link href="/help" className={s.link}>Help guide</Link> covers every part of the app.
      </span>
      <button
        type="button"
        className={s.close}
        aria-label="Dismiss"
        onClick={() => { safeSet(DISMISSED_KEY, '1'); setShow(false); }}
      >
        ×
      </button>
    </div>
  );
}
