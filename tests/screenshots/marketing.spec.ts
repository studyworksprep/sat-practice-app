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
  // Optional scroll target before screenshot. When set, we
  // capture a viewport-sized PNG at the given scroll position
  // instead of the default fullPage capture. Lets two distinct
  // screenshots come off the same URL.
  //
  //   'top'                 — scrollY = 0, viewport snap
  //   number                — scrollY = N pixels, viewport snap
  //   selector string       — scrollIntoView the selector
  //   undefined (default)   — fullPage snap, no scroll override
  scrollTo?: 'top' | number | string;
};

// Fixed UUIDs from the create-demo-accounts migration. We
// reference them by name so the spec stays readable.
const DEMO_ROSTER_STUDENT_ID = '00000000-0000-0000-0000-000000d30101';   // Imani Bellweather
const DEMO_TUTOR_ID           = '00000000-0000-0000-0000-000000d30002';   // Morgan Reyes
const DEMO_TEST_ATTEMPT_ID    = '00000000-0000-0000-0000-00000d3a4001';   // demo.student's PT4 attempt

const STUDENT_SHOTS: Shot[] = [
  {
    filename: 'student-dashboard-1.png',
    path: '/dashboard',
    waitFor: '[data-testid="dashboard-banner"], main',
  },
  {
    // Practice-history visualization. The slideshow uses this as
    // "Track Your Progress Over Time" — every session + test
    // charted. /practice/history is the natural source.
    filename: 'student-dashboard-2.png',
    path: '/practice/history',
  },
  {
    filename: 'review-hub.png',
    path: '/review',
  },
  // ── Score-report views.
  //
  //   introview = top of the results page (scaled scores, per-
  //   section breakdown).
  //   bestview  = further down (Opportunity Index, slowest
  //   questions, per-skill bars).
  //
  // Both render off the same URL today; the slideshow uses two
  // screenshots to spotlight the top-of-page summary vs the deep-
  // analytics block. We capture both by toggling scroll position
  // before the snap.
  {
    // Top of the page: composite score + per-section scaled
    // scores + initial domain breakdown.
    filename: 'score-report-introview.png',
    path: `/practice/test/attempt/${DEMO_TEST_ATTEMPT_ID}/results`,
    scrollTo: 'top',
  },
  {
    // Further down: Opportunity Index, per-skill bars, timing
    // analytics. Hard-coded scroll-Y because the page uses
    // CSS-module class names (hashed in prod), so we can't
    // selector-target the section reliably. If the section
    // moves substantially, adjust this offset.
    filename: 'score-report-bestview.png',
    path: `/practice/test/attempt/${DEMO_TEST_ATTEMPT_ID}/results`,
    scrollTo: 900,
  },
];

const TUTOR_SHOTS: Shot[] = [
  // ── Teacher persona (signed in as the demo manager, who is
  //    their own teacher of record — the (tutor) layout serves
  //    both roles).
  {
    filename: 'teacher-dashboard-1.png',
    path: '/tutor/dashboard',
  },
  {
    // "Manage students" surface — the slideshow's second teacher
    // shot is the roster management screen.
    filename: 'teacher-dashboard-2.png',
    path: '/tutor/roster',
  },
  // ── Per-student detail. The 1a/1b/2a/2b/3 variants in the
  //    slideshow are different tabs / scroll positions on the
  //    same page — capture each URL once; the slideshow already
  //    chooses a sensible default tab to render. If we later
  //    want truly distinct views, add `hideCss` or click some
  //    UI before the snap.
  {
    filename: 'teacher-student-detail-1a.png',
    path: `/tutor/students/${DEMO_ROSTER_STUDENT_ID}`,
  },
  {
    filename: 'teacher-student-detail-1b.png',
    path: `/tutor/students/${DEMO_ROSTER_STUDENT_ID}`,
  },
  {
    filename: 'teacher-student-detail-2a.png',
    path: `/tutor/students/${DEMO_ROSTER_STUDENT_ID}/stats`,
  },
  {
    filename: 'teacher-student-detail-2b.png',
    path: `/tutor/students/${DEMO_ROSTER_STUDENT_ID}/stats`,
  },
  {
    filename: 'teacher-student-detail-3.png',
    path: `/tutor/students/${DEMO_ROSTER_STUDENT_ID}`,
  },
  // ── Manager persona (team-level views).
  {
    // "Team roster" in the marketing deck = the list of teachers
    // the manager oversees. /tutor/teachers is the right surface;
    // /tutor/roster is the per-teacher student roster.
    filename: 'manager-team-roster.png',
    path: '/tutor/teachers',
  },
  {
    filename: 'manager-tutor-activity.png',
    path: `/tutor/teachers/${DEMO_TUTOR_ID}`,
  },
  {
    filename: 'manager-roster-reports.png',
    path: '/tutor/performance',
  },
];

// NOTE: score-report-introview.png and score-report-bestview.png
// reference /practice/test/attempt/<id>/results, which needs a
// completed practice_test_attempts_v2 row in the seed data. The
// current seed only populates `attempts` + `practice_sessions`;
// extend scripts/seed-demo-data.mjs (or the SQL seed) to add a
// completed test attempt before adding those entries here.

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
  // /auth/callback. There are two possible landing chains we
  // need to wait through:
  //
  //   Happy path  — Supabase accepts our redirect_to=/auth/callback
  //                 and /auth/callback uses the sw_demo_next cookie:
  //                 ends at /dashboard (or /tutor/dashboard).
  //
  //   Fallback    — Supabase rejects redirect_to against its
  //                 project allowlist and falls back to Site URL
  //                 with the session in the URL fragment. The
  //                 client-side useAuthFragmentBounce in HomeClient
  //                 then setSessions and window.location.replace's
  //                 to /dashboard. For tutor that lands on
  //                 /dashboard first, then the (student) layout
  //                 redirects manager → /tutor/dashboard.
  //
  // The naive "any non-/auth/* URL" predicate fires on the Site URL
  // fallback before the client-side bounce runs. Wait specifically
  // for the persona's expected final URL.
  const expectedHome = persona === 'student' ? '/dashboard' : '/tutor/dashboard';
  await page.goto(`/auth/demo/${persona}`);
  await page.waitForURL(
    (url) => url.pathname === expectedHome
      && !url.hostname.includes('supabase.co'),
    { timeout: 30_000 },
  );
}

async function captureShot(page: Page, shot: Shot) {
  await page.goto(shot.path);
  if (shot.waitFor) {
    await page.waitForSelector(shot.waitFor, { timeout: 15_000 });
  } else {
    // domcontentloaded over networkidle: Vercel Analytics +
    // proxy session-refresh keep the page from ever reaching
    // network idle, so networkidle hangs until the test
    // timeout.
    await page.waitForLoadState('domcontentloaded');
  }
  await page.addStyleTag({ content: shot.hideCss ?? STABILIZE_CSS });
  // Small settle delay for late-binding animations (skeletons
  // fading out, charts easing into their final state).
  await page.waitForTimeout(1200);

  const out = path.join(OUT_DIR, shot.filename);

  if (shot.scrollTo !== undefined) {
    // Viewport-sized capture, scrolled to the requested position.
    // Lets two distinct screenshots come from the same URL.
    if (shot.scrollTo === 'top') {
      await page.evaluate(() => window.scrollTo(0, 0));
    } else if (typeof shot.scrollTo === 'number') {
      await page.evaluate((y) => window.scrollTo(0, y), shot.scrollTo);
    } else {
      // String → CSS selector. scrollIntoView puts the element at
      // the top of the viewport.
      await page.evaluate((sel) => {
        const el = document.querySelector(sel);
        if (el) el.scrollIntoView({ behavior: 'instant', block: 'start' });
      }, shot.scrollTo);
    }
    // A second settle for the scroll to render.
    await page.waitForTimeout(300);
    await page.screenshot({ path: out, fullPage: false });
  } else {
    await page.screenshot({ path: out, fullPage: true });
  }
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

// Default per-test timeout from playwright.config.ts is 30s, which
// isn't enough for sign-in (up to 30s in the Site-URL-fallback +
// client-bounce branch) plus a fan-out of waits-per-shot. Bump to
// 90s so a slow capture run doesn't fail spuriously.
const TEST_TIMEOUT_MS = 90_000;

test.describe('marketing screenshots — student', () => {
  test('capture student surfaces', async ({ page }) => {
    test.setTimeout(TEST_TIMEOUT_MS);
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
    test.setTimeout(TEST_TIMEOUT_MS);
    await signInAs(page, 'tutor');
    await assertSignedIn(page, 'tutor');
    for (const shot of TUTOR_SHOTS) {
      await captureShot(page, shot);
    }
    expect(TUTOR_SHOTS.length).toBeGreaterThan(0);
  });
});
