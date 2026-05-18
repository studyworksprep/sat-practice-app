// Marketing screenshots. Drives the live product as the seeded
// demo accounts and saves each marked surface to
// public/screenshots/. Run on demand:
//
//   E2E_BASE_URL=https://<preview-url> npx playwright test --project=screenshots
//
// or against a local dev server:
//
//   npm run dev    # in another terminal
//   npx playwright test --project=screenshots
//
// Prerequisites (one-time per environment):
//   1. Migrations applied (incl. 20260511000000_demo_readonly_foundation.sql
//      and 20260511000001_create_demo_accounts.sql).
//   2. Activity data seeded:
//        SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/seed-demo-data.mjs
//
// Adding a screenshot:
//   Append a tuple to STUDENT_SHOTS or TUTOR_SHOTS below. The
//   slideshow already references filenames in /public/screenshots/;
//   match those filenames here so a regen swaps the image in place
//   without touching the slide deck.

import { test, expect, type Page } from '@playwright/test';
import path from 'node:path';

const OUT_DIR = path.resolve('public/screenshots');

type Shot = {
  filename: string;
  path: string;
  // Optional selector to wait for before snapping. Defaults to
  // 'networkidle'. Many of the dashboards do their own data
  // fetching after the initial paint, so waiting for a sentinel
  // element is more reliable than networkidle alone.
  waitFor?: string;
  // Optional CSS that hides volatile UI (timestamps, "last
  // synced 3s ago") that would change between runs and produce
  // noisy git diffs. Injected before the snap.
  hideCss?: string;
};

const STUDENT_SHOTS: Shot[] = [
  {
    filename: 'student-dashboard-1.png',
    path: '/dashboard',
    waitFor: '[data-testid="dashboard-banner"], main',
  },
  {
    filename: 'review-hub.png',
    path: '/review',
  },
];

const TUTOR_SHOTS: Shot[] = [
  {
    filename: 'manager-team-roster.png',
    path: '/tutor/team',
  },
];

// Hide elements with timestamps or progress bars whose exact
// values change run-over-run. Keeps git diffs of regenerated
// PNGs to genuine layout / content changes.
const STABILIZE_CSS = `
  [data-volatile], .relativeTime, .liveCount {
    visibility: hidden !important;
  }
`;

async function signInAs(page: Page, persona: 'student' | 'tutor') {
  // /auth/demo/<persona> bounces through Supabase /verify and
  // /auth/callback. A naive "not /auth/demo/*" predicate would
  // resolve on the Supabase /verify hop, before our session
  // cookies have been set by /auth/callback. Wait until the
  // browser is back on the app domain and off any /auth/* path,
  // which is the post-callback /dashboard landing.
  await page.goto(`/auth/demo/${persona}`);
  await page.waitForURL(
    (url) => !url.hostname.includes('supabase.co')
      && !url.pathname.startsWith('/auth/'),
    { timeout: 20_000 },
  );
  // Belt-and-suspenders: the session-cookie write happens during
  // the /auth/callback response, but the SSR of the next page may
  // race with the cookie being readable. A tiny settle delay
  // avoids a Heisenbug where the first screenshot captures the
  // logged-out state of the next render.
  await page.waitForLoadState('networkidle');
}

async function captureShot(page: Page, shot: Shot) {
  await page.goto(shot.path);
  if (shot.waitFor) {
    await page.waitForSelector(shot.waitFor, { timeout: 15_000 });
  } else {
    await page.waitForLoadState('networkidle');
  }
  await page.addStyleTag({ content: shot.hideCss ?? STABILIZE_CSS });
  // Small settle delay for late-binding animations (skeletons
  // fading out, charts easing into their final state).
  await page.waitForTimeout(400);
  const out = path.join(OUT_DIR, shot.filename);
  await page.screenshot({ path: out, fullPage: true });
}

// After signInAs, the page should be on the persona's home —
// /dashboard for student, /tutor/dashboard for tutor. If it
// landed somewhere else (login form, error page, /?confirmed=…),
// the magic-link verify didn't establish the session, and every
// subsequent screenshot would capture the wrong page. Fail loud
// here instead of silently producing bad shots.
async function assertSignedIn(page: Page, persona: 'student' | 'tutor') {
  const expectedHome = persona === 'student' ? '/dashboard' : '/tutor/dashboard';
  const here = new URL(page.url()).pathname;
  expect(
    here,
    `Expected to land on ${expectedHome} after /auth/demo/${persona}, got ${here}`,
  ).toBe(expectedHome);
}

test.describe('marketing screenshots — student', () => {
  test('capture student surfaces', async ({ page }) => {
    await signInAs(page, 'student');
    await assertSignedIn(page, 'student');
    for (const shot of STUDENT_SHOTS) {
      await captureShot(page, shot);
    }
    expect(STUDENT_SHOTS.length).toBeGreaterThan(0);
  });
});

test.describe('marketing screenshots — tutor', () => {
  test('capture tutor surfaces', async ({ page }) => {
    await signInAs(page, 'tutor');
    await assertSignedIn(page, 'tutor');
    for (const shot of TUTOR_SHOTS) {
      await captureShot(page, shot);
    }
    expect(TUTOR_SHOTS.length).toBeGreaterThan(0);
  });
});
