// Onboarding intake walk (docs/student-onboarding-and-plan-redesign-
// 2026-09.md Phase 1): a flagged test student is reset to first login
// through reset_test_student(), signs in, is routed to /welcome, walks
// situation → availability → self-check → preview, activates, and lands
// on /today.
//
// Runs in the `student` project by filename but with NO storage state:
// the seeded student1 already has a plan, so this spec signs in as
// student4 (6666…, no tutor-independent history) after resetting it.
// The reset is made as the seeded admin, using the access token inside
// tests/.auth/admin.json (written by auth.setup.ts) against the
// PostgREST rpc endpoint — the same function the admin "Testing"
// section calls. If the environment can't reset (no Supabase env, the
// function isn't migrated, or the student isn't flagged) the spec
// SKIPS with the reason rather than failing on a missing fixture.

import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '@playwright/test';

const STUDENT4 = { id: '66666666-6666-6666-6666-666666666666', email: 'student4@test.studyworks' };
const PASSWORD = 'devseed123';
const ADMIN_STATE = path.join(process.cwd(), 'tests', '.auth', 'admin.json');

test.use({ storageState: { cookies: [], origins: [] } });

/** NEXT_PUBLIC_SUPABASE_URL / ANON_KEY from the environment, falling
 *  back to .env.local for local runs (Playwright doesn't load it). */
function supabaseEnv(): { url: string; anonKey: string } | null {
  let url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  let anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    try {
      const raw = fs.readFileSync(path.join(process.cwd(), '.env.local'), 'utf8');
      for (const line of raw.split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
        if (!m) continue;
        const val = m[2].replace(/^["']|["']$/g, '');
        if (m[1] === 'NEXT_PUBLIC_SUPABASE_URL' && !url) url = val;
        if (m[1] === 'NEXT_PUBLIC_SUPABASE_ANON_KEY' && !anonKey) anonKey = val;
      }
    } catch {
      // no .env.local — fall through
    }
  }
  return url && anonKey ? { url, anonKey } : null;
}

/** The admin's access token from the Playwright storage state: the
 *  Supabase SSR cookie is `base64-<base64 JSON session>`. */
function adminAccessToken(): string | null {
  try {
    const state = JSON.parse(fs.readFileSync(ADMIN_STATE, 'utf8')) as {
      cookies: { name: string; value: string }[];
    };
    const cookie = state.cookies.find((c) => /^sb-.*-auth-token/.test(c.name));
    if (!cookie) return null;
    const raw = cookie.value.startsWith('base64-')
      ? Buffer.from(cookie.value.slice('base64-'.length), 'base64').toString('utf8')
      : decodeURIComponent(cookie.value);
    const session = JSON.parse(raw) as { access_token?: string };
    return session.access_token ?? null;
  } catch {
    return null;
  }
}

async function resetStudent4(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const env = supabaseEnv();
  if (!env) return { ok: false, reason: 'NEXT_PUBLIC_SUPABASE_URL / ANON_KEY not available' };
  const token = adminAccessToken();
  if (!token) return { ok: false, reason: 'no admin access token in tests/.auth/admin.json (run the setup project)' };

  const res = await fetch(`${env.url}/rest/v1/rpc/reset_test_student`, {
    method: 'POST',
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_student: STUDENT4.id, p_resend_welcome: false }),
  });
  if (!res.ok) {
    const body = await res.text();
    return { ok: false, reason: `reset_test_student returned ${res.status}: ${body.slice(0, 200)}` };
  }
  return { ok: true };
}

test.describe('onboarding intake', () => {
  test.beforeAll(async () => {
    const r = await resetStudent4();
    test.skip(!r.ok, r.ok ? '' : `cannot reset the test student — ${r.reason}`);
  });

  test.afterAll(async () => {
    // Leave the fixture clean for the next run / manual testing.
    await resetStudent4();
  });

  test('fresh student is routed to the intake and reaches an activated plan', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(STUDENT4.email);
    await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
    await page.getByRole('button', { name: 'Log in' }).click();

    // Login → /dashboard → student layout bounces to the intake.
    await expect(page).toHaveURL(/\/welcome/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /set up your study plan/i })).toBeVisible();

    // Step 1 — situation.
    const nextYear = new Date();
    nextYear.setUTCFullYear(nextYear.getUTCFullYear() + 1);
    await page.locator('input[name="target"]').fill('1300');
    await page.locator('input[name="testDate"]').fill(nextYear.toISOString().slice(0, 10));
    await page.locator('input[name="prepLevel"][value="none"]').check();
    await page.locator('input[name="intent"][value="guide_me"]').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 2 — availability (guide_me skips the targets step).
    await expect(page.getByRole('heading', { name: /when can you study/i })).toBeVisible();
    await page.locator('input[name="weeklyHours"]').fill('5');
    await page.locator('input[name="day"][value="0"]').uncheck();
    await page.locator('input[name="day"][value="6"]').uncheck();
    await page.getByRole('button', { name: 'Continue' }).click();

    // Step 3 — self-check: the radios are visually hidden, so force.
    await expect(page.getByRole('heading', { name: /how comfortable are you/i })).toBeVisible();
    for (const code of ['H', 'P', 'Q', 'S', 'INI', 'CAS', 'EOI', 'SEC']) {
      await page.locator(`input[name="rating_${code}"][value="3"]`).check({ force: true });
    }
    await page.getByRole('button', { name: 'Build my plan' }).click();

    // Preview — a foundations plan: coverage → focus → rehearsal.
    await expect(page.getByRole('heading', { name: /here.s your plan/i })).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText('Foundations plan')).toBeVisible();
    await expect(page.getByText(/cover every topic in order/i).first()).toBeVisible();
    await expect(page.getByText('Week 1', { exact: false }).first()).toBeVisible();

    // Activate → Today.
    await page.getByRole('button', { name: 'Start my plan' }).click();
    await expect(page).toHaveURL(/\/today/, { timeout: 20_000 });
    await expect(page.getByRole('heading', { name: /what.s next/i })).toBeVisible();

    // The intake is done: the dashboard no longer bounces.
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/dashboard/);
  });
});
