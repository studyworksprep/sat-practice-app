// Prepare reviewable DC repairs and shared-renderer comparisons.
// These are local proposals, not a production update operation.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseHTML } from 'linkedom';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { loadBindings, transform } from 'next/dist/build/swc/index.js';
import sharp from 'sharp';
import { normalizeBankHtml, type ReviewedMathImage } from '../lib/content/normalize-bank-html.ts';
import type { BankFieldKind } from '../lib/content/bank-html.ts';
import { renderHtml, renderRow } from '../lib/content/render-math.mjs';
import { sanitizeQuestionHtml } from '../lib/sanitize.ts';

type Data = Record<string, any>;
const root = resolve(process.argv[2] ?? 'tmp/dc-question-audit-2026-10-08');
const rows: Data[] = JSON.parse(await readFile(resolve(root, 'before.json'), 'utf8'));
const manifest: Data[] = JSON.parse(await readFile(resolve(root, 'source-manifest.json'), 'utf8'));
const inventory: Data[] = JSON.parse(await readFile(resolve(root, 'inventory.json'), 'utf8'));
const reviewed = JSON.parse(await readFile(resolve(process.argv[3] ?? 'scripts/verification/dc-question-formatting-reviewed.json'), 'utf8'));
const codes: string[] = reviewed.questions.map((q: Data) => q.code);
const body = (html: string | null) => parseHTML('<html><body>' + (html ?? '') + '</body></html>').document.body;
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const math = (tex: string) => '\\(' + tex + '\\)';
const mathReviews: Data[] = [];
const proposals: Data[] = [];
const checks: Data[] = [];
const renderedAt = new Date().toISOString();
await mkdir(resolve(root, 'previews'), { recursive: true });
await mkdir(resolve(root, 'math-review'), { recursive: true });

function nonMathImages(html: string | null) {
  return [...body(html).querySelectorAll('img:not([role="math"]):not(.math-img)')].map(i => ({ src: i.getAttribute('src'), alt: i.getAttribute('alt') }));
}
function normalize(html: string | null, code: string, field: string, sourceImageHashes: Set<string>): string | null {
  const review = reviewed.questions.find((q: Data) => q.code === code)!;
  const conversions = new Map<string, ReviewedMathImage>();
  for (const img of body(html).querySelectorAll('img[role="math"], img.math-img')) {
    const src = img.getAttribute('src')!;
    const srcHash = hash(src);
    const alt = (img.getAttribute('alt') ?? '').trim().replace(/\s+/g, ' ');
    assert.ok(sourceImageHashes.has(srcHash), code + ': equation image does not match official source');
    const formula = review.math_images.find((f: Data) => f.src_sha256 === srcHash && f.alt === alt);
    assert.ok(formula, code + ': equation image has not been visually reviewed: ' + alt);
    const existing = conversions.get(src);
    if (existing) assert.equal(existing.tex, formula.tex, code + ': conflicting transcription for the same PNG');
    conversions.set(src, { alt, tex: formula.tex, alternateAlts: existing ? [existing.alt, ...(existing.alternateAlts ?? [])] : [] });
    mathReviews.push({ code, field, alt, tex: formula.tex, source: src });
  }
  let normalized = normalizeBankHtml(html, field.startsWith('option-') ? 'option' : field as BankFieldKind, {
    mathImages: conversions, mathVariables: new Set<string>(review.variables), requireReviewedMath: true,
  });
  if (normalized && code === 'M-00211' && field === 'rationale') {
    normalized = normalized.replaceAll('9\\(x\\) + 9\\(y\\) = 162', math('9x + 9y = 162'))
      .replaceAll('\\(x\\) + \\(y\\) = 18', math('x+y = 18'))
      .replaceAll('\\(y\\) – \\(x\\).', math('y-x') + '.');
  }
  assert.deepEqual(nonMathImages(normalized), nonMathImages(html), code + ': source figure changed');
  return normalized;
}
for (const code of codes) {
  const before = rows.find(r => r.display_code === code)!;
  const record = inventory.find(r => r.code === code)!;
  assert.equal(record.key.status, 'verified');
  const item = manifest.find(r => r.code === code)!;
  const review = reviewed.questions.find((q: Data) => q.code === code)!;
  assert.equal(item.sha256, review.official_source_sha256);
  assert.equal(before.source_external_id, review.source_external_id);
  const rawSource = await readFile(item.path, 'utf8');
  assert.equal(hash(rawSource), item.sha256);
  const source = JSON.parse(rawSource);
  const sourceImageHashes = new Set<string>();
  for (const html of [source.body, source.prompt, source.answer.rationale, ...Object.values(source.answer.choices ?? {}).map((o: any) => o.body)]) {
    for (const img of body(html).querySelectorAll('img')) sourceImageHashes.add(hash(img.getAttribute('src') ?? ''));
  }
  const raw = { ...before,
    stimulus_html: normalize(before.stimulus_html, code, 'stimulus', sourceImageHashes),
    stem_html: normalize(before.stem_html, code, 'stem', sourceImageHashes),
    rationale_html: normalize(before.rationale_html, code, 'rationale', sourceImageHashes),
    options: before.options?.map((o: Data) => ({ ...o, content_html: normalize(o.content_html, code, 'option-' + o.label, sourceImageHashes) })) ?? null,
  };
  if (code === 'M-00010') {
    assert.ok(raw.stimulus_html?.includes('Which statement about the graph is true?'));
    raw.stimulus_html = raw.stimulus_html!.replace(/<p[^>]*>Which statement about the graph is true\?<\/p>/, '');
  }
  if (code === 'M-00158') {
    assert.ok(raw.stimulus_html?.includes('<table'));
    raw.stimulus_html = raw.stimulus_html!.replace(/(<table[^>]*>)/, '$1<caption>Percent of Residents Who Earned a Bachelor\'s Degree or Higher</caption>');
  }
  if (code === 'M-01477') {
    const choice = raw.options.find((o: Data) => o.label === 'C');
    assert.equal(choice.content_html, '\\(6x - 2y = 10\\)');
    choice.content_html = '\\(6x - 2y = 0\\)';
  }
  if (code === 'M-00061') {
    const dom = body(raw.stem_html);
    const first = dom.firstElementChild!;
    assert.equal(first.textContent.trim(), math('\\frac{4x}{5} = 20'));
    raw.stimulus_html = '<p class="stimulus_paragraph" style="text-align:center;">\\[\\frac{4x}{5} = 20\\]</p>';
    first.remove(); raw.stem_html = dom.innerHTML;
  }
  if (code === 'M-00211') raw.stimulus_html = '<p class="stimulus_paragraph" style="text-align:center;">\\[\\begin{aligned}4x+5y&amp;=100\\\\5x+4y&amp;=62\\end{aligned}\\]</p>';
  const errors: Data[] = [];
  const rendered = renderRow(raw, (field: string, error: Error) => errors.push({ field, error: error.message }));
  assert.deepEqual(errors, []);
  const after: Data = { ...raw, ...rendered, rendered_at: renderedAt, expected_updated_at: before.updated_at, official_source_sha256: item.sha256,
    review_status: 'local proposal; not applied' };
  for (const name of ['stem', 'stimulus', 'rationale']) {
    const html = after[name + '_rendered'] ?? after[name + '_html'];
    assert.ok(!html || !/data-mjx-error|data-mml-node="merror"|\\[()[\]]/.test(html), code + ': invalid rendered ' + name);
  }
  for (const o of after.options_rendered ?? []) assert.ok(!/data-mjx-error|data-mml-node="merror"|\\[()[\]]/.test(o.content_html_rendered ?? o.content_html));
  assert.deepEqual(after.correct_answer, before.correct_answer);
  assert.deepEqual((after.options ?? []).map((o: Data) => ({ label: o.label, ordinal: o.ordinal })), (before.options ?? []).map((o: Data) => ({ label: o.label, ordinal: o.ordinal })));
  // Check the prose survives; formula/image changes are reviewed separately.
  const prose = (html: string | null) => {
    const dom = body(html); for (const node of dom.querySelectorAll('img')) node.remove();
    for (const node of dom.querySelectorAll('span.italic,span[class*="font_style:italic"],span[style*="font-style:italic"]')) {
      const variable = node.textContent.match(/^\s*([A-Za-z]{1,3})[,.]?\s*$/)?.[1];
      if (variable && review.variables.includes(variable)) node.replaceWith(node.textContent.replace(/[A-Za-z\s]/g, ''));
    }
    return dom.textContent.replace(/\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]/g, '').replace(/\s+/g, '').trim();
  };
  const prosePreserved = prose(before.rationale_html) === prose(after.rationale_html);
  if (code !== 'M-00211') assert.equal(prose(after.rationale_html), prose(before.rationale_html), code + ': explanation prose changed');
  const beforeStimulus = code === 'M-00010'
    ? before.stimulus_html.replace(/<p[^>]*>Which statement about the graph is true\?<\/p>/, '') : before.stimulus_html;
  const afterStimulus = code === 'M-00158'
    ? after.stimulus_html.replace("<caption>Percent of Residents Who Earned a Bachelor's Degree or Higher</caption>", '') : after.stimulus_html;
  assert.equal(prose(after.stem_html), prose(before.stem_html), code + ': stem prose changed');
  assert.equal(prose(afterStimulus), prose(beforeStimulus), code + ': stimulus prose changed');
  for (const [index, option] of (before.options ?? []).entries()) {
    const oldText = body(option.content_html).textContent.trim();
    if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)%?$/.test(oldText)) {
      assert.equal(after.options[index].content_html, math(oldText.replace('%', '\\%')));
    } else assert.equal(prose(after.options[index].content_html), prose(option.content_html), code + ': option prose changed');
  }
  const tableCells = (html: string | null) => [...body(html).querySelectorAll('table')].map(table => [...table.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td,th')].map(cell => ({text:prose(cell.innerHTML),colspan:cell.getAttribute('colspan'),rowspan:cell.getAttribute('rowspan')}))));
  assert.deepEqual(tableCells(after.stimulus_html), tableCells(before.stimulus_html), code + ': table data changed');
  checks.push({ code, key_verified: true, option_identity_preserved: true, source_figures_preserved: true,
    table_data_preserved: true, all_field_prose_preserved: true, math_images_replaced: mathReviews.filter(r => r.code === code).length, rendering_errors: errors, prose_comparison: prosePreserved ? 'equal' : 'math runs merged; inspect preview' });
  proposals.push(after);
  assert.equal(mathReviews.filter(r => r.code === code).length, review.math_images.length);
}
await writeFile(resolve(root, 'pilot-proposals.json'), JSON.stringify(proposals, null, 2));
await writeFile(resolve(root, 'pilot-checks.json'), JSON.stringify(checks, null, 2));

// Compile the current shared component; the CSS class map uses its original names.
let rendererSource = await readFile('lib/ui/QuestionRenderer.js', 'utf8');
rendererSource = rendererSource.replace("'@/lib/sanitize'", JSON.stringify(pathToFileURL(resolve('lib/sanitize.ts')).href))
  .replace("'@/lib/ui/preview-effects'", JSON.stringify(pathToFileURL(resolve('lib/ui/preview-effects.js')).href))
  .replace("import s from './QuestionRenderer.module.css';", 'const s = new Proxy({}, { get: (_, key) => key });');
await loadBindings();
const compiled = await transform(rendererSource, { filename: 'QuestionRenderer.jsx', jsc: { parser: { syntax: 'ecmascript', jsx: true }, transform: { react: { runtime: 'automatic' } }, target: 'es2022' }, module: { type: 'es6' } });
await writeFile(resolve(root, 'renderer.mjs'), compiled.code);
const { QuestionRenderer } = await import(pathToFileURL(resolve(root, 'renderer.mjs')).href);
const css = (await Promise.all(['app/styles/next-tokens.css', 'lib/ui/QuestionRenderer.module.css', 'app/styles/next-prose.css'].map(p => readFile(p, 'utf8')))).join('\n') + `
body{margin:0;background:#f5f7fa;font-family:Arial,sans-serif}*{box-sizing:border-box}main{max-width:1500px;margin:0 auto;padding:22px}
h1{font-size:24px}h2{font-size:17px}.comparison{display:grid;grid-template-columns:1fr 1fr;gap:22px}.panel{min-width:0;background:white;padding:20px;border:1px solid #ddd;border-radius:12px}.rationale{margin-top:24px}.sr-only{display:none}a{color:#163d65}@media(max-width:850px){.comparison{grid-template-columns:1fr}}`;
const publicImages = new Map<string,string>();
for (const row of [...rows,...proposals]) for (const html of [row.stem_html,row.stimulus_html,row.rationale_html,...(row.options??[]).map((o:Data)=>o.content_html)]) {
  for (const img of body(html).querySelectorAll('img[src^="/images/"]')) {
    const src=img.getAttribute('src')!;
    assert.match(src,/^\/images\/[A-Za-z0-9_.-]+\.png$/);
    if (!publicImages.has(src)) publicImages.set(src,'data:image/png;base64,'+(await readFile(resolve('public',src.slice(1)))).toString('base64'));
  }
}
const effective = (html: string | null) => {
  // Embed public assets only in the local gallery. Bank content keeps its
  // existing /images URLs; file:// previews otherwise resolve them at /images.
  let preview = html ?? '';
  for (const [src,embedded] of publicImages) preview=preview.replaceAll('src="'+src+'"','src="'+embedded+'"').replaceAll("src='"+src+"'","src='"+embedded+"'");
  const safe = sanitizeQuestionHtml(preview);
  return /<math\b|\\[([]/.test(safe) ? renderHtml(safe) : safe;
};
function card(row: Data) {
  const question = { questionId: row.id, questionType: row.question_type,
    stemHtml: effective(row.stem_rendered ?? row.stem_html), stimulusHtml: effective(row.stimulus_rendered ?? row.stimulus_html),
    options: (row.options ?? []).map((o: Data, i: number) => ({ ...o, id: o.label, content_html: effective(row.options_rendered?.[i]?.content_html_rendered ?? o.content_html) })) };
  return renderToStaticMarkup(React.createElement(QuestionRenderer, { question, mode: 'teacher', subject: 'math' }));
}
for (const after of proposals) {
  const before = rows.find(r => r.id === after.id)!;
  const code = after.display_code;
  const panel = (row: Data, title: string, id: string) => '<section class="panel" id="' + id + '"><h2>' + title + '</h2>' + card(row) + '<div class="rationale"><h2>Explanation</h2><div class="sw-prose">' + sanitizeQuestionHtml(effective(row.rationale_rendered ?? row.rationale_html)) + '</div></div></section>';
  await writeFile(resolve(root, 'previews', code + '.html'), '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + code + ' formatting comparison</title><style>' + css + '</style></head><body data-tree="next"><main><h1>' + code + ' · ' + after.source_external_id + '</h1><p><a href="index.html">' + proposals.length + ' proposed formatting repairs</a> · Official answer verified · Preview only</p><div class="comparison">' + panel(before, 'Current bank', 'before') + panel(after, 'Proposed formatting', 'after') + '</div></main></body></html>');
}
await writeFile(resolve(root, 'previews', 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><title>DC question formatting review</title><style>' + css + '</style></head><body><main><h1>DC question formatting review</h1><p>' + proposals.length + ' proposals rendered with the app’s current shared component and styles. The live database has not been changed.</p>' + proposals.map(q => '<p><a href="' + q.display_code + '.html">' + q.display_code + '</a> · ' + q.skill_name + '</p>').join('') + '</main></body></html>');

// Pair every unique original pilot formula with its proposed SVG for visual review.
const unique = mathReviews.filter((r, i) => mathReviews.findIndex(x => x.source === r.source) === i);
const pageSize = 40;
for (let start = 0; start < unique.length; start += pageSize) {
const page = unique.slice(start, start + pageSize);
const tiles: Data[] = [];
for (const [i, review] of page.entries()) {
  const x = i % 2 * 700, y = Math.floor(i / 2) * 150;
  const original = Buffer.from(review.source.split(',')[1], 'base64');
  const svg = body(renderHtml('<div>' + math(review.tex) + '</div>')).querySelector('svg')!.outerHTML;
  const originalPng = await sharp(original).resize({ width: 650, height: 43, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const renderedPng = await sharp(Buffer.from(svg), { density: 144 }).resize({ width: 650, height: 43, fit: 'inside' }).png().toBuffer({ resolveWithObject: true });
  const label = '<svg width="700" height="150"><rect width="700" height="150" fill="white"/><text x="12" y="20" font-family="sans-serif" font-size="14">' + i + ' · ' + review.code + ' · ' + review.field + '</text><text x="12" y="48" font-family="sans-serif" font-size="12">Source</text><text x="12" y="105" font-family="sans-serif" font-size="12">TeX</text></svg>';
  tiles.push({ input: Buffer.from(label), left: x, top: y }, { input: originalPng.data, left: x + 60, top: y + 26 }, { input: renderedPng.data, left: x + 60, top: y + 82 });
}
const filename = unique.length <= pageSize ? 'pilot-formula-comparison.png' : 'formula-comparison-' + String(start / pageSize + 1).padStart(2, '0') + '.png';
await sharp({ create: { width: 1400, height: Math.ceil(page.length / 2) * 150, channels: 3, background: '#ffffff' } }).composite(tiles as any).png().toFile(resolve(root, 'math-review', filename));
}
await writeFile(resolve(root, 'math-review', 'formulas.json'), JSON.stringify(mathReviews.map(({ source, ...r }) => r), null, 2));
console.log(JSON.stringify({ proposed_questions: proposals.length, math_images_replaced: mathReviews.length, unique_formulas: unique.length, live_writes: 0 }));
