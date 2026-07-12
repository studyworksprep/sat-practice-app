// Password-reset flow guards. Runs anonymously — the whole flow is
// pre-auth by definition.
//
// What these tests pin down (see docs/runbook.md § Password reset
// flow for the incident that motivated them):
//
//   1. /auth/confirm never spends the token on GET — the page must
//      render an explicit form so mail-scanner prefetches are inert.
//   2. The verify endpoint rejects garbage tokens by redirecting to
//      the "link expired" state, not by 500ing or dumping the user
//      on the marketing home with a signup-confirmation banner.
//   3. /auth/update-password?error=… shows the request-a-new-link
//      state instead of the password form.
//
// A full happy-path test (real email, real token) needs the local
// Supabase stack + Inbucket and lives outside this negative-test
// pass.

import { test, expect } from '@playwright/test';

test.describe('Password reset — /auth/confirm interstitial', () => {
  test('GET with token renders a confirm form and does not auto-verify', async ({ page }) => {
    const res = await page.goto(
      '/auth/confirm?token_hash=e2e-bogus-token&type=recovery&next=/auth/update-password',
    );
    expect(res?.status()).toBe(200);

    // The token must only be consumed via an explicit POST.
    const form = page.locator('form[action="/auth/confirm/verify"][method="POST" i]');
    await expect(form).toBeVisible();
    await expect(form.locator('input[name="token_hash"]')).toHaveValue('e2e-bogus-token');
    await expect(form.locator('input[name="type"]')).toHaveValue('recovery');
    await expect(form.getByRole('button', { name: /continue to reset password/i })).toBeVisible();
  });

  test('GET without a token shows the invalid-link state', async ({ page }) => {
    await page.goto('/auth/confirm');
    await expect(page.getByText(/isn't valid/i)).toBeVisible();
    await expect(page.locator('form[action="/auth/confirm/verify"]')).toHaveCount(0);
  });

  test('GET with a non-recovery type shows the invalid-link state', async ({ page }) => {
    await page.goto('/auth/confirm?token_hash=e2e-bogus-token&type=magiclink');
    await expect(page.getByText(/isn't valid/i)).toBeVisible();
    await expect(page.locator('form[action="/auth/confirm/verify"]')).toHaveCount(0);
  });

  test('clicking through with a bogus token lands on the expired state', async ({ page }) => {
    await page.goto(
      '/auth/confirm?token_hash=e2e-bogus-token&type=recovery&next=/auth/update-password',
    );
    await page.getByRole('button', { name: /continue to reset password/i }).click();

    await page.waitForURL('**/auth/update-password?error=invalid_link');
    await expect(page.getByText(/expired or is no longer valid/i)).toBeVisible();
    // The password form must not be offered on a failed verification.
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('verify endpoint refuses an off-site next target', async ({ request }) => {
    const res = await request.post('/auth/confirm/verify', {
      form: {
        token_hash: 'e2e-bogus-token',
        type: 'recovery',
        next: '//evil.example.com/phish',
      },
      maxRedirects: 0,
    });
    expect(res.status()).toBe(303);
    const location = res.headers()['location'] ?? '';
    expect(location).toContain('/auth/update-password');
    expect(location).not.toContain('evil.example.com');
  });
});

test.describe('Password reset — /auth/update-password', () => {
  test('?error=invalid_link forces the request-a-new-link state', async ({ page }) => {
    await page.goto('/auth/update-password?error=invalid_link');
    await expect(page.getByText(/expired or is no longer valid/i)).toBeVisible();
    await expect(page.getByRole('link', { name: /back to log in/i })).toBeVisible();
    await expect(page.locator('input[type="password"]')).toHaveCount(0);
  });

  test('no session and no error shows the request-a-new-link state', async ({ page }) => {
    await page.goto('/auth/update-password');
    await expect(page.getByText(/expired or is no longer valid/i)).toBeVisible();
  });
});
