// Tutor invitations end to end (tutor readiness, 2026-11-14).
//
// A tutor invites a student who already has an account; the student
// redeems the code under Account, joins the roster, and still has to
// subscribe — lessons and assignments send them to the plan page, which
// offers only the Student plan. The tutor sees them flagged "Needs a
// subscription". Then the student leaves the tutor, and separately the
// tutor removes an unsponsored student from the roster.
//
// Fixture: student6 (9999…), seeded with no tutor and no plan by
// scripts/dev-seed-ui-preview.sql §10 and used by nothing else.
// studyworks-dev doubles as the CI e2e database. Setup and cleanup go
// through PostgREST with the admin storage state's token (the same
// pattern as onboarding.student.spec.ts), and every invitation the spec
// creates is deleted again so it never counts toward the tutor's
// 25-per-day invitation cap.

import { test, expect, type Browser, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { USERS } from './helpers/fixtures';

const PASSWORD = 'devseed123';
const ADMIN_STATE = path.join(process.cwd(), 'tests', '.auth', 'admin.json');
const TEACHER = USERS.teacher;
const STUDENT6 = USERS.student6;

test.describe.configure({ mode: 'serial' });

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

/** The admin's access token from the Playwright storage state. */
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

async function adminRest(
  method: 'GET' | 'POST' | 'DELETE',
  resource: string,
  body?: unknown,
): Promise<{ ok: boolean; status: number; text: string }> {
  const env = supabaseEnv();
  const token = adminAccessToken();
  if (!env || !token) {
    return { ok: false, status: 0, text: 'no Supabase env or admin session (run the setup project)' };
  }
  const res = await fetch(`${env.url}/rest/v1/${resource}`, {
    method,
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status, text: await res.text() };
}

/** Remove any teacher↔student6 link and every invitation sent to student6. */
async function resetFixture(): Promise<{ ok: true } | { ok: false; reason: string }> {
  const link = await adminRest(
    'DELETE',
    `teacher_student_assignments?teacher_id=eq.${TEACHER.id}&student_id=eq.${STUDENT6.id}`,
  );
  if (!link.ok) return { ok: false, reason: `unlink returned ${link.status}: ${link.text.slice(0, 200)}` };
  const invites = await adminRest('DELETE', `student_invite_codes?email=eq.${encodeURIComponent(STUDENT6.email)}`);
  if (!invites.ok) return { ok: false, reason: `invite cleanup returned ${invites.status}: ${invites.text.slice(0, 200)}` };
  return { ok: true };
}

async function signInAsStudent6(browser: Browser): Promise<{ page: Page; close: () => Promise<void> }> {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [] } });
  const page = await context.newPage();
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(STUDENT6.email);
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Log in' }).click();
  return { page, close: () => context.close() };
}

const rosterRow = (page: Page) => page.getByRole('row').filter({ hasText: 'Stu Six' });

test.describe('tutor invitations', () => {
  test.setTimeout(120_000);

  test.beforeAll(async () => {
    const fixture = await adminRest('GET', `profiles?id=eq.${STUDENT6.id}&select=id`);
    const seeded = fixture.ok && fixture.text.includes(STUDENT6.id);
    test.skip(!seeded, `student6 fixture missing (${fixture.status}); run scripts/dev-seed-ui-preview.sql §10`);
    const r = await resetFixture();
    test.skip(!r.ok, r.ok ? '' : `cannot reset the student6 fixture — ${r.reason}`);
  });

  test.afterAll(async () => {
    await resetFixture();
  });

  test('an invited student joins the roster but must subscribe, and can leave', async ({ page, browser }) => {
    // The tutor emails an invitation from the roster.
    await page.goto('/tutor/roster?invite=1');
    await page.getByPlaceholder('student@example.com').fill(STUDENT6.email);
    await page.getByRole('button', { name: 'Send invitation' }).click();
    const status = page.getByRole('status').filter({ hasText: STUDENT6.email });
    await expect(status).toBeVisible({ timeout: 15_000 });
    const code = ((await status.locator('code').first().textContent()) ?? '').trim();
    expect(code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{8}$/);

    // The student has no plan, so signing in lands on the plan page.
    const student = await signInAsStudent6(browser);
    const sp = student.page;
    await expect(sp).toHaveURL(/\/subscribe/, { timeout: 20_000 });

    // They redeem the code from Account.
    await sp.goto('/account');
    await sp.getByPlaceholder(/^e\.g\./).fill(code);
    await sp.getByRole('button', { name: 'Link teacher' }).click();
    await expect(sp.getByText('Linked. Your teacher can now assign you work.')).toBeVisible();

    // Joining a tutor grants no access: content sends them to the
    // Student plan, the only one offered.
    for (const route of ['/learn', '/assignments']) {
      await sp.goto(route);
      await expect(sp).toHaveURL(/\/subscribe$/);
    }
    await expect(sp.getByRole('heading', { name: 'Start your free trial' })).toBeVisible();
    await expect(sp.getByText('Teacher', { exact: true })).toHaveCount(0);

    // The tutor sees them on the roster, flagged.
    await page.goto('/tutor/roster');
    await expect(rosterRow(page)).toBeVisible();
    await expect(rosterRow(page).getByText('Needs a subscription')).toBeVisible();

    // The student leaves the tutor.
    await sp.goto('/account');
    await sp.getByRole('button', { name: 'Leave', exact: true }).click();
    await sp.getByRole('button', { name: 'Leave teacher' }).click();
    await expect(sp.getByText("You haven't linked a teacher yet.")).toBeVisible();
    await student.close();

    await page.goto('/tutor/roster');
    await expect(rosterRow(page)).toHaveCount(0);
  });

  test('a tutor removes a student Studyworks does not sponsor', async ({ page }) => {
    const link = await adminRest('POST', 'teacher_student_assignments', {
      teacher_id: TEACHER.id,
      student_id: STUDENT6.id,
      sponsored: false,
    });
    expect(link.ok, link.text).toBe(true);

    await page.goto('/tutor/roster');
    await expect(rosterRow(page)).toBeVisible();
    await rosterRow(page).getByRole('button', { name: 'More actions for Stu Six' }).click();
    await page.getByRole('menuitem', { name: 'Remove from roster' }).click();
    await page.getByRole('button', { name: 'Remove student' }).click();
    await expect(rosterRow(page)).toHaveCount(0);
  });
});
