import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';

// Load the actual chart with JSX compiled and CSS stubbed, so the regression
// covers its axis labels and accessible day details, not just the date helper.
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
async function loadComponent(filename) {
  const source = (await readFile(new URL(filename, import.meta.url), 'utf8'))
    .replace(/from 'react'/g, `from ${JSON.stringify(reactUrl)}`)
    .replace("'@/lib/formatters'", JSON.stringify(new URL('../formatters.js', import.meta.url).href))
    .replace(/import s from '[^']+\.module\.css';/, 'const s = {};');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText;
  return import(`data:text/javascript;base64,${Buffer.from(`import React from ${JSON.stringify(reactUrl)};\n${compiled}`).toString('base64')}`);
}
const { ReviewDailyMap } = await loadComponent('./ReviewDailyMap.js');
const { StudyCountdown } = await loadComponent('./StudyCountdown.js');

test('assignment daily chart shows the same calendar dates in Eastern Time', () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    const html = renderToStaticMarkup(React.createElement(ReviewDailyMap, {
      dailyMap: {
        firstDay: '2026-10-09',
        lastDay: '2026-10-10',
        totalAttempts: 3,
        days: [
          { date: '2026-10-09', attempts: 0, correct: 0 },
          { date: '2026-10-10', attempts: 3, correct: 2 },
        ],
      },
    }));
    assert.match(html, /<span>Oct 9 – Oct 10<\/span>/);
    assert.match(html, /aria-label="Fri, Oct 9, 2026 — No practice"/);
    assert.match(html, /aria-label="Sat, Oct 10, 2026 — 3 attempts, 67% correct"/);
    assert.doesNotMatch(html, /title=/);
    assert.match(html, /Oct 9<span[^>]*>Fri<\/span>/);
    assert.match(html, /Oct 10<span[^>]*>Sat<\/span>/);
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});

test('long chart keeps daily bars and spaced calendar labels across a year boundary', () => {
  const days = Array.from({ length: 35 }, (_, index) => {
    const date = new Date('2026-12-20T00:00:00Z');
    date.setUTCDate(date.getUTCDate() + index);
    return { date: date.toISOString().slice(0, 10), attempts: 0, correct: 0 };
  });
  const html = renderToStaticMarkup(React.createElement(ReviewDailyMap, {
    dailyMap: { days, firstDay: days[0].date, lastDay: days.at(-1).date, totalAttempts: 0 },
  }));
  const { document } = parseHTML(html);
  const bars = [...document.querySelectorAll('button[data-date]')];
  assert.equal(bars.length, 35);
  assert.deepEqual(bars.map((bar) => bar.dataset.date), days.map((day) => day.date));
  assert.deepEqual(bars.map((bar) => bar.lastElementChild.textContent).filter(Boolean), [
    'Dec 20', 'Dec 28', 'Jan 4', 'Jan 11', 'Jan 18', 'Jan 23',
  ]);
  assert.match(bars.at(-1).getAttribute('aria-label'), /Sat, Jan 23, 2027 — No practice/);
  assert.equal(document.querySelectorAll('button[tabindex="0"]').length, 1);
  assert.match(html, /No practice in this period/);
});

test('SAT countdown accepts the legacy profile timestamp as a calendar date', () => {
  const previousTimeZone = process.env.TZ;
  process.env.TZ = 'America/New_York';
  try {
    for (const isoDate of ['2026-06-06', '2026-06-06T00:00:00+00:00']) {
      const html = renderToStaticMarkup(React.createElement(StudyCountdown, {
        isoDate,
        todayMs: Date.parse('2026-06-05T12:00:00-04:00'),
      }));
      assert.match(html, /Your SAT is tomorrow/);
      assert.match(html, /Saturday, June 6, 2026/);
    }
  } finally {
    if (previousTimeZone === undefined) delete process.env.TZ;
    else process.env.TZ = previousTimeZone;
  }
});
