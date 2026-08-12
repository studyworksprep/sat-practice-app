// Admin concept-tag manager (/admin/concept-tags) — green-path
// coverage as the seeded admin.
//
// Every test here must leave the dev DB the way it found it: the
// rename test is a round-trip, and the merge/delete tests stop at
// their confirmation affordances and cancel. The destructive paths
// themselves are covered at the SQL layer (merge_concept_tags is
// exercised against scratch tags in dev; delete is a plain FK-cascade
// delete) — what these tests pin down is the wiring from button to
// action to refreshed table.

import { test, expect } from '@playwright/test';

test.describe('Admin — concept tags manager', () => {
  test('renders the catalog with counts', async ({ page }) => {
    await page.goto('/admin/concept-tags');
    await expect(page.getByRole('heading', { name: /concept tags/i })).toBeVisible();
    await expect(page.getByText(/\d+ tags across \d+ question links/i)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rename' }).first()).toBeVisible();
  });

  test('filter narrows the table', async ({ page }) => {
    await page.goto('/admin/concept-tags');
    await page.getByLabel('Filter tags').fill('zzzz-no-such-tag-zzzz');
    await expect(page.getByText(/no tags match the filter/i)).toBeVisible();
  });

  test('inline rename round-trips', async ({ page }) => {
    await page.goto('/admin/concept-tags');
    const firstRow = page.locator('tbody tr').first();
    const original = (await firstRow.locator('td').first().innerText()).trim();
    const temp = `${original} [e2e]`;

    await firstRow.getByRole('button', { name: 'Rename' }).click();
    await page.getByLabel(`New name for ${original}`).fill(temp);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`Renamed “${original}” to “${temp}”.`)).toBeVisible();

    // The refreshed table sorts the renamed row wherever it lands —
    // isolate it via the filter, then undo.
    await page.getByLabel('Filter tags').fill(temp);
    const renamedRow = page.locator('tbody tr').first();
    await expect(renamedRow.locator('td').first()).toHaveText(temp);
    await renamedRow.getByRole('button', { name: 'Rename' }).click();
    await page.getByLabel(`New name for ${temp}`).fill(original);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText(`Renamed “${temp}” to “${original}”.`)).toBeVisible();
  });

  test('merge panel offers other tags and previews the outcome', async ({ page }) => {
    await page.goto('/admin/concept-tags');
    const firstRow = page.locator('tbody tr').first();
    const name = (await firstRow.locator('td').first().innerText()).trim();

    await firstRow.getByRole('button', { name: 'Merge…' }).click();
    const select = page.getByLabel(`Merge target for ${name}`);
    await expect(select).toBeVisible();
    // The source tag must not be offered as its own target.
    await expect(select.locator('option', { hasText: name })).toHaveCount(0);
    await expect(page.getByText(`Its questions get the surviving tag; “${name}” is deleted.`)).toBeVisible();

    // Choosing a target arms the button; the confirm dialog is the
    // last gate — cancel it so nothing merges.
    await select.selectOption({ index: 1 });
    await page.getByRole('button', { name: 'Merge', exact: true }).click();
    const dialog = page.locator('dialog');
    await expect(dialog.getByRole('heading', { name: /^Merge “/ })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
  });

  test('delete asks for confirmation and cancel is a no-op', async ({ page }) => {
    await page.goto('/admin/concept-tags');
    const firstRow = page.locator('tbody tr').first();
    const name = (await firstRow.locator('td').first().innerText()).trim();

    await firstRow.getByRole('button', { name: 'Delete' }).click();
    const dialog = page.locator('dialog');
    await expect(dialog.getByRole('heading', { name: `Delete tag “${name}”?` })).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    // Row is still there.
    await expect(page.locator('tbody tr').first().locator('td').first()).toHaveText(name);
  });
});
