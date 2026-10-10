import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import React, { type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import { test, expect } from '@playwright/test';
import { renderHtml } from '../../lib/content/render-math.mjs';

// Render the actual shared component and CSS without a database or login.
// CSS Modules use their source class names in this isolated browser fixture.
let QuestionRenderer: ComponentType<Record<string, unknown>>;
test.beforeAll(async () => {
  let source = readFileSync(resolve('lib/ui/QuestionRenderer.js'), 'utf8');
  source = source.replace("'@/lib/sanitize'", JSON.stringify(resolve('lib/sanitize.ts')))
    .replace("'@/lib/ui/preview-effects'", JSON.stringify(resolve('lib/ui/preview-effects.js')))
    .replace("import s from './QuestionRenderer.module.css';", 'const s = new Proxy({}, { get: (_, key) => key });');
  await loadBindings();
  const compiled = await transform(source, {
    filename: 'QuestionRenderer.jsx',
    jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' },
    module: { type: 'commonjs' },
  });
  const compiledModule = { exports: {} as { QuestionRenderer: typeof QuestionRenderer } };
  new Function('require', 'module', 'exports', compiled.code)(createRequire(resolve('package.json')), compiledModule, compiledModule.exports);
  QuestionRenderer = compiledModule.exports.QuestionRenderer;
});

const css = ['app/styles/next-tokens.css', 'app/styles/next-prose.css', 'lib/ui/QuestionRenderer.module.css']
  .map(file => readFileSync(resolve(file), 'utf8')).join('\n');
const equation = renderHtml(String.raw`\(\frac{123456789}{987654321}+\frac{234567891}{876543219}+\frac{345678912}{765432198}+\frac{456789123}{654321987}=\frac{567891234}{543219876}\)`);

function fixture(layout: string, reveal: boolean) {
  const question = {
    questionId: 'overflow-fixture', questionType: 'mcq',
    stemHtml: '<p>Which expression is equivalent?</p>',
    stimulusHtml: layout === 'two-column' ? '<p>A short passage that wraps normally.</p>' : null,
    options: [{ id: 'A', label: 'A', content_html: equation }, { id: 'B', label: 'B', content_html: '<p>2</p>' }],
  };
  const content = renderToStaticMarkup(React.createElement(QuestionRenderer, {
    question, layout, onSelectOption: () => {}, onToggleCross: () => {},
    result: reveal ? { isCorrect: true, correctOptionId: 'A', rationaleHtml: '<p>Use the following equation.</p><p>' + equation + '</p><p>The conclusion remains visible.</p>' } : null,
  }));
  return '<style>' + css + '*{box-sizing:border-box}body{margin:0;font:16px Arial}main{max-width:1000px;margin:auto;padding:20px}</style><main>' + content + '</main>';
}

for (const width of [320, 400, 820, 1440]) {
  for (const layout of ['single', 'two-column']) {
    test(`wide choices and explanations stay reachable at ${width}px (${layout})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 1000 });
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setContent(fixture(layout, true));
      const result = await page.evaluate(() => {
        const regions = [...document.querySelectorAll<HTMLElement>('.rationale,.optionContent')];
        return {
          pageOverflow: document.documentElement.scrollWidth > innerWidth + 2,
          escapingFields: [...document.querySelectorAll('.result,.optionsFieldset')].filter(e => e.scrollWidth > e.clientWidth + 2).length,
          scrolls: regions.filter(e => e.scrollWidth > e.clientWidth + 2).map(e => {
            const svg = e.querySelector('svg')!;
            const size = svg.getBoundingClientRect();
            e.scrollLeft = e.scrollWidth - e.clientWidth;
            const end = svg.getBoundingClientRect(), box = e.getBoundingClientRect();
            return { reached: Math.abs(e.scrollLeft - (e.scrollWidth - e.clientWidth)) < 2, rightVisible: end.right <= box.right + 2, topVisible: end.top >= box.top - 2, bottomVisible: end.bottom <= box.bottom + 2, widthPreserved: size.width === end.width };
          }),
        };
      });
      expect(result.pageOverflow).toBe(false);
      expect(result.escapingFields).toBe(0);
      if (width <= 400) expect(result.scrolls.length).toBe(2);
      for (const scroll of result.scrolls) expect(Object.values(scroll).every(Boolean)).toBe(true);
      await expect(page.getByText('The conclusion remains visible.')).toBeVisible();

      // In answering mode the choice label and cross-out target must still fit.
      await page.setContent(fixture(layout, false));
      await page.locator('.optionBadge').first().click();
      await expect(page.locator('input[value="A"]')).toBeChecked();
      await expect(page.getByRole('button', { name: 'Cross out option A' })).toBeVisible();
      await expect(page.getByRole('button', { name: 'Cross out option B' })).toBeVisible();
    });
  }
}
