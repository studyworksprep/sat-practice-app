// Per-question timing in the practice session runner.
//
// Drives the full loop the 2026-08 timing feature added: the runner's
// stopwatch rides on submitAnswer (attempts.time_spent_ms lands on the
// insert), the post-submit reading segment flushes through the
// /api/practice/time-ping beacon on unmount, and the session review
// page renders its timing band only when at least one question has a
// measured time (ReviewInteractive gates on timing.measuredCount > 0).
// So "timing band visible on review" is an end-to-end assertion that
// a nonzero time_spent_ms actually reached the database.
//
// Runs as student1 (storage state from auth.setup.ts) against the
// dev seed.

import { test, expect } from '@playwright/test';

test('practice session records per-question time and review shows the timing band', async ({ page }) => {
  test.setTimeout(60_000);
  // Warm the review route first (dev server compiles on demand; a
  // cold compile otherwise stalls the finish navigation so long that
  // the runner never unmounts inside the beacon-wait window below).
  await page.goto('/practice/review/00000000-0000-0000-0000-000000000000');

  // ── Start a 1-question session ────────────────────────────────
  // Size 1 so the first post-submit Next click finishes the set and
  // routes to the review page.
  await page.goto('/practice/start');
  const sizeInput = page.getByLabel(/session size/i);
  await sizeInput.fill('1');
  const startBtn = page.getByRole('button', { name: /^start · /i });
  await expect(startBtn).toBeEnabled();
  await startBtn.click();
  await page.waitForURL(/\/practice\/s\/[0-9a-f-]+\/0$/, { timeout: 15_000 });

  // ── Spend measurable time, then answer ────────────────────────
  // The stopwatch bills wall-clock active time; sit on the question
  // long enough that the recorded value is comfortably nonzero.
  await page.waitForTimeout(1_100);

  const mcqOption = page.locator('input[type=radio]').first();
  const sprInput = page.locator('#spr-input');
  if (await mcqOption.count()) {
    // Click the LABEL, not the radio. The radio is visually hidden —
    // QuestionRenderer.module.css `.radio` is the clipped 1x1 sr-only
    // pattern — so the element at its own centre is its <label>, and
    // `.check()` has to rely on Playwright's label-forwarding
    // tolerance plus wherever the 1x1 box lands. That held locally but
    // failed consistently in CI ("label intercepts pointer events" /
    // "element is outside of the viewport"), which is the kind of
    // environment-dependence a test should not carry. The label is a
    // normal, full-size element and is what a student actually clicks.
    // `force` is deliberately NOT used: it would skip actionability
    // and keep passing even if the option became genuinely unclickable.
    await page.locator('label:has(input[type=radio])').first().click();
    await expect(mcqOption).toBeChecked();
  } else {
    // SPR question — any parseable answer records an attempt
    // (correctness doesn't matter for timing).
    await sprInput.fill('1');
  }
  // "( again)?" because a React re-render mid-click ("Submit" →
  // "Checking…" → "Submit again") can make Playwright retry the
  // click against the post-submit label.
  await page.getByRole('button', { name: /^submit( again)?$/i }).click();
  // Reveal appears only after the attempt row exists server-side.
  await expect(page.getByRole('button', { name: /reveal answer/i })).toBeVisible({ timeout: 10_000 });

  // ── Post-submit segment flushes via the beacon ────────────────
  // Wait past the beacon's 500ms noise threshold, then leave the
  // question. Finishing the set unmounts the runner; the unmount
  // flush must POST the reading-time delta to the time-ping route.
  await page.waitForTimeout(700);
  const beacon = page.waitForResponse(
    (res) => res.url().includes('/api/practice/time-ping') && res.request().method() === 'POST',
    { timeout: 20_000 },
  );
  await page.getByRole('button', { name: 'Next question', exact: true }).click();
  const beaconRes = await beacon;
  const beaconBody = await beaconRes.json().catch(() => null);
  expect(beaconRes.status()).toBe(200);
  expect(beaconBody?.data?.recorded).toBe(true);

  // ── Review page shows the timing band ─────────────────────────
  await page.waitForURL(/\/practice\/review\//, { timeout: 15_000 });
  await expect(page.getByText(/timing — hover a segment/i)).toBeVisible({ timeout: 10_000 });
});
