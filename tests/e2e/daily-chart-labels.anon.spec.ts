import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { test, expect, type Page } from '@playwright/test';

// Mount the real chart and styles in a browser without a database or login.
// The client render matters here: label density depends on ResizeObserver.
const requireRepo = createRequire(resolve('package.json'));
const { webpack } = requireRepo('next/dist/compiled/webpack/webpack');
let fixtureDirectory: string;
let bundle: string;
const css = ['app/styles/next-tokens.css', 'lib/practice/ReviewInteractive.module.css']
  .map(file => readFileSync(resolve(file), 'utf8')).join('\n');

test.beforeAll(async () => {
  fixtureDirectory = mkdtempSync(join(tmpdir(), 'daily-chart-labels-'));
  const source = readFileSync(resolve('lib/practice/ReviewDailyMap.js'), 'utf8')
    .replace("'@/lib/formatters'", JSON.stringify(resolve('lib/formatters.js')))
    .replace("import s from './ReviewInteractive.module.css';", 'const s = new Proxy({}, { get: (_, key) => key });');
  const compiled = ts.transpileModule("import React from 'react';\n" + source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  writeFileSync(join(fixtureDirectory, 'component.mjs'), compiled);
  writeFileSync(join(fixtureDirectory, 'entry.mjs'), `
    import React from 'react';
    import { createRoot } from 'react-dom/client';
    import { ReviewDailyMap } from './component.mjs';
    createRoot(document.getElementById('chart')).render(
      React.createElement(ReviewDailyMap, { dailyMap: window.chartFixture })
    );
  `);
  await new Promise<void>((resolveBundle, reject) => {
    const compiler = webpack({
      mode: 'production', entry: join(fixtureDirectory, 'entry.mjs'),
      resolve: { modules: [resolve('node_modules'), 'node_modules'] },
      output: { path: fixtureDirectory, filename: 'bundle.js' },
      optimization: { minimize: false }, devtool: false,
    });
    compiler.run((error: Error | null, stats: { hasErrors(): boolean; toString(): string }) => {
      compiler.close(() => {});
      if (error) reject(error);
      else if (stats.hasErrors()) reject(new Error(stats.toString()));
      else resolveBundle();
    });
  });
  bundle = readFileSync(join(fixtureDirectory, 'bundle.js'), 'utf8');
});

test.afterAll(() => { if (fixtureDirectory) rmSync(fixtureDirectory, { recursive: true, force: true }); });

async function mount(page: Page, count: number) {
  const days = Array.from({ length: count }, (_, index) => {
    const date = new Date('2026-09-26T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), attempts: index === 5 ? 5 : index === 6 ? 19 : 0, correct: index === 5 ? 5 : index === 6 ? 14 : 0 };
  });
  const dailyMap = { days, firstDay: days[0].date, lastDay: days.at(-1)!.date, totalAttempts: 24 };
  await page.setContent(`<style>${css}
    *{box-sizing:border-box}body{margin:0;font:14px Arial}
    main{max-width:1180px;margin:auto;padding:24px;min-width:0}
    h2{font:700 22px Georgia;margin:0 0 20px;color:#102a43}
  </style><main><h2>Daily distribution</h2><div id="chart"></div></main>`);
  await page.addScriptTag({ content: `window.chartFixture = ${JSON.stringify(dailyMap)};\n${bundle}` });
}

async function expectReadableLabels(page: Page) {
  const layout = await page.evaluate(() => {
    const labels = [...document.querySelectorAll('.dailyBarDate')].filter(label => label.textContent?.trim());
    const rectangles = labels.map(label => {
      const range = document.createRange();
      range.selectNodeContents(label);
      return range.getBoundingClientRect();
    });
    return {
      pageOverflow: document.documentElement.scrollWidth > innerWidth,
      overlap: rectangles.some((rectangle, index) => index > 0 && rectangle.left < rectangles[index - 1].right - 1),
    };
  });
  expect(layout.pageOverflow).toBe(false);
  expect(layout.overlap).toBe(false);
}

for (const count of [14, 15, 21]) {
  test(`a wide ${count}-day report labels every day, including both activity bars`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 1440, height: 700 });
    await mount(page, count);
    await expect(page.locator('.dailyChart')).toHaveAttribute('data-date-labels', 'daily');
    await expect(page.locator('.dailyBarDate')).toHaveCount(count);
    await expect(page.locator('.dailyBarWeekday')).toHaveCount(count);
    await expect(page.locator('[data-date="2026-10-01"] .dailyBarDate')).toHaveText('Oct 1Thu');
    await expect(page.locator('[data-date="2026-10-02"] .dailyBarDate')).toHaveText('Oct 2Fri');
    await expectReadableLabels(page);
    if (count === 15) await page.locator('main').screenshot({ path: testInfo.outputPath('15-day-report.png') });
  });
}

test('date density adapts as a report resizes, while daily bars and immediate details remain available', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await mount(page, 15);
  await expect(page.locator('.dailyChart')).toHaveAttribute('data-date-labels', 'daily');

  await page.setViewportSize({ width: 640, height: 700 });
  await expect(page.locator('.dailyChart')).toHaveAttribute('data-date-labels', 'spaced');
  await expectReadableLabels(page);
  await expect(page.getByText('One bar per day · Dates every 2 days')).toBeVisible();

  await page.setViewportSize({ width: 320, height: 700 });
  await expect(page.locator('.dailyChart')).toHaveAttribute('data-date-labels', 'weekly');
  await expect(page.locator('.dailyBarCol')).toHaveCount(15);
  await expectReadableLabels(page);
  await expect(page.getByText(/Swipe or scroll to see all days/)).toBeVisible();
  await page.locator('[data-date="2026-10-02"]').hover();
  await expect(page.getByRole('tooltip')).toContainText('Fri, Oct 2, 2026');
  await expect(page.getByRole('tooltip')).toContainText('19 attempts, 74% correct');
  await expect(page.locator('.dailyBarCol[title]')).toHaveCount(0);

  await page.setViewportSize({ width: 1440, height: 700 });
  await expect(page.locator('.dailyChart')).toHaveAttribute('data-date-labels', 'daily');
  await expect(page.locator('.dailyBarWeekday')).toHaveCount(15);
  await expect(page.getByText(/Swipe or scroll to see all days/)).toHaveCount(0);
  await expectReadableLabels(page);
});

test('a long timeline retains every daily bar with readable weekly labels and scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 700 });
  await mount(page, 90);
  await expect(page.locator('.dailyChart')).toHaveAttribute('data-date-labels', 'weekly');
  await expect(page.locator('.dailyBarCol')).toHaveCount(90);
  await expect(page.locator('.dailyBarWeekday')).toHaveCount(0);
  await expect(page.getByText(/Weekly date labels · Swipe or scroll to see all days/)).toBeVisible();
  await expectReadableLabels(page);
});
