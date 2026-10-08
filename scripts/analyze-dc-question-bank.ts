// Analyze the saved DC snapshot and official originals. No database writes.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { parseOrNull } from '../lib/content/speakmath-to-tex.mjs';
import { renderHtml } from '../lib/content/render-math.mjs';

const root = resolve(process.argv[2] ?? 'tmp/dc-question-audit-2026-10-08');
const rows: any[] = JSON.parse(await readFile(resolve(root, 'before.json'), 'utf8'));
const manifest = JSON.parse(await readFile(resolve(root, 'source-manifest.json'), 'utf8'));
const body = (html: string | null) => parseHTML('<html><body>' + (html ?? '') + '</body></html>').document.body;
const fields = (r: any) => [
  { field: 'stimulus', html: r.stimulus_html }, { field: 'stem', html: r.stem_html },
  ...(r.options ?? []).map((o: any) => ({ field: 'option-' + o.label, html: o.content_html })),
  { field: 'rationale', html: r.rationale_html },
];
const images: any[] = [];
const inventory: any[] = [];
const canonical = (s: string) => s.normalize('NFKC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[−–]/g, '-').replace(/⋅|×/g, '').replace(/\s+/g, '').trim();
function signature(html: string | null) {
  let dom = body(html);
  for (const node of dom.querySelectorAll('style, .sr-only, annotation, [data-ae_invis]')) node.remove();
  for (const node of dom.querySelectorAll('img')) {
    const alt = node.getAttribute('alt') ?? '';
    const math = node.getAttribute('role') === 'math' || (node.getAttribute('class') ?? '').split(/\s+/).includes('math-img');
    const tex = math ? parseOrNull(alt) : null;
    node.replaceWith(tex ? '\\(' + tex + '\\)' : '[' + alt + ']');
  }
  for (const node of dom.querySelectorAll('span.italic, em, i')) {
    const value = node.textContent.trim();
    if (/^[A-Za-z]{1,3}$/.test(value)) node.replaceWith('\\(' + value + '\\)');
  }
  for (const node of dom.querySelectorAll('*')) {
    for (const attr of [...node.attributes]) if (!/^[A-Za-z_:][\w:.-]*$/.test(attr.name)) node.removeAttribute(attr.name);
  }
  const signatureHtml = '<div>' + dom.innerHTML + '</div>';
  try { dom = body(renderHtml(signatureHtml)); }
  catch (error) { console.error('Signature render failed', signatureHtml.length, signatureHtml.slice(0, 500)); throw error; }
  for (const node of dom.querySelectorAll('mjx-container')) {
    const glyphs = [...node.querySelectorAll('[data-c]')].map((n: any) => String.fromCodePoint(parseInt(n.getAttribute('data-c'), 16))).join('');
    node.replaceWith(glyphs);
  }
  return canonical(dom.textContent);
}
const numeric = (text: string): number => {
  const s = text.trim().replace(/,/g, '');
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s)) return Number(s);
  const frac = s.match(/^([+-]?\d+)\s*\/\s*(\d+)$/) ?? s.match(/^\\(?:t?frac)\{([+-]?\d+)\}\{(\d+)\}$/);
  return frac ? Number(frac[1]) / Number(frac[2]) : NaN;
};
function keyCheck(row: any, source: any) {
  if (row.question_type === 'mcq') {
    const declared = source.answer?.correct_choice?.toUpperCase() ?? source.correct_answer?.[0];
    const fromRationale = body(source.answer?.rationale ?? source.rationale).textContent.trim().match(/^Choice ([A-D]) is correct\./)?.[1];
    const official = declared ?? fromRationale;
    const stored = row.correct_answer?.option_label;
    return { status: !official ? 'review' : official === stored ? 'verified' : 'mismatch', official, stored,
      evidence: declared ? 'explicit key' : 'rationale opening' };
  }
  const rationale = body(source.answer?.rationale ?? source.rationale);
  for (const img of rationale.querySelectorAll('img')) img.replaceWith(parseOrNull(img.getAttribute('alt')) ?? img.getAttribute('alt') ?? '');
  const opening = rationale.textContent.trim();
  const answerSentence = opening.match(/^The correct answer is\s+([\s\S]*?)(?:\.(?=\s+[A-Z])|$)/i)?.[1] ?? '';
  const values = [...answerSentence.matchAll(/\\(?:t?frac)\{[+-]?\d+\}\{\d+\}|[+-]?(?:\d[\d,]*(?:\.\d+)?|\.\d+)(?:\s*\/\s*\d+)?/g)].map(m => ({ text: m[0], value: numeric(m[0]) }));
  const storedValue = row.correct_answer.number ?? numeric(JSON.parse(row.correct_answer.text)[0]);
  return { status: !values.length || values.some(v => !Number.isFinite(v.value)) ? 'review' : values.some(v => Math.abs(v.value - storedValue) < 1e-10) ? 'verified' : 'mismatch',
    official: values.map(v => v.text), stored: storedValue, opening: opening.slice(0, 180), evidence: 'rationale opening',
    multiple_official_values: values.length > 1 };
}
function candidateCheck(tex: string | null) {
  if (!tex) return 'unparsed';
  if (/\b(?:of|and|or|the|to|end|with|point|following|values|equals|between|over|coordinates)\b/.test(tex)) return 'residual-speech';
  if (/\d,\d{3}/.test(tex) || /\\left\(\d+,\s*\d{3}\\right\)/.test(tex)) return 'ambiguous-comma';
  const stack: string[] = [];
  for (const ch of tex) {
    if ('{(['.includes(ch)) stack.push(ch);
    if ('})]'.includes(ch) && stack.pop() !== ({ '}': '{', ')': '(', ']': '[' } as any)[ch]) return 'unbalanced';
  }
  if (stack.length) return 'unbalanced';
  const rendered = renderHtml('<div>\\(' + tex + '\\)</div>');
  if (/data-mjx-error|data-mml-node="merror"/.test(rendered)) return 'math-error';
  return 'candidate';
}
for (const row of rows) {
  const item = manifest.find((m: any) => m.code === row.display_code);
  if (!item || item.error) { inventory.push({ code: row.display_code, external_id: row.source_external_id, source_error: item?.error ?? 'not fetched' }); continue; }
  const raw = await readFile(item.path, 'utf8');
  assert.equal(createHash('sha256').update(raw).digest('hex'), item.sha256);
  const source = JSON.parse(raw);
  assert.ok(source.item_id === row.source_external_id || source.externalid === row.source_external_id);
  const official = { stimulus_html: source.body ?? source.stimulus ?? null, stem_html: source.prompt ?? source.stem,
    rationale_html: source.answer?.rationale ?? source.rationale,
    options: row.question_type === 'mcq' ? ['A', 'B', 'C', 'D'].map((label, i) => ({ label,
      content_html: source.answer?.choices?.[label.toLowerCase()]?.body ?? source.answerOptions?.[i]?.content })) : [] };
  assert.ok(official.rationale_html);
  if (row.question_type === 'mcq') assert.ok(official.options.every(o => o.content_html));
  const currentFields = fields(row);
  const comparisons = [];
  for (const current of currentFields) {
    const sourceField = fields(official).find(f => f.field === current.field)!;
    const existing = signature(current.html);
    const original = signature(sourceField.html);
    comparisons.push({ field: current.field, equal: current.field === 'stem' && !official.stem_html ? null : existing === original,
      ...(existing !== original ? { existing, original } : {}) });
    const dom = body(current.html);
    for (const [index, img] of [...dom.querySelectorAll('img')].entries()) {
      const alt = img.getAttribute('alt') ?? '';
      const isMath = img.getAttribute('role') === 'math' || (img.getAttribute('class') ?? '').split(/\s+/).includes('math-img');
      const tex = isMath ? parseOrNull(alt) : null;
      images.push({ code: row.display_code, field: current.field, index, is_math: isMath, alt, tex,
        status: isMath ? candidateCheck(tex) : 'figure',
        src_sha256: createHash('sha256').update(img.getAttribute('src') ?? '').digest('hex') });
    }
  }
  // Moving a leading equation/figure between stimulus and stem is acceptable.
  const combined = official.stem_html ? signature((row.stimulus_html ?? '') + row.stem_html) === signature((official.stimulus_html ?? '') + official.stem_html) : null;
  inventory.push({ code: row.display_code, id: row.id, external_id: row.source_external_id, source_format: item.format,
    key: keyCheck(row, source), comparisons, question_content_equivalent: combined, missing_source_prompt: !official.stem_html,
    contains_older_classes: currentFields.some(f => /class="[^"]*(?:italic|math-container|tcp-|passage|choice_paragraph)/.test(f.html ?? '')),
    has_png_math: images.some(img => img.code === row.display_code && img.is_math),
    has_missing_alignment: currentFields.some(f => /<p\b[^>]*\b[Aa]lign=/.test(f.html ?? '')),
    nested_tables: currentFields.some(f => body(f.html).querySelector('table table')),
    nested_paragraph_markup: currentFields.some(f => /<p\b[^>]*>(?:(?!<\/p>)[\s\S])*<p\b/.test(f.html ?? '')),
    truncation_marker: currentFields.some(f => /TRIMMED|TRUNCATED|TODO: unreadable/i.test(f.html ?? '')) });
  if (inventory.length % 50 === 0) console.log(JSON.stringify({ analyzed: inventory.length, total: rows.length }));
}
const mathImages = images.filter(i => i.is_math);
const summary = { audited_at: new Date().toISOString(), project_id: 'noqtadytxyslkoetchrs', total: rows.length,
  five_digit: rows.filter(r => /^\d{5}-DC$/.test(r.source_external_id)).length,
  six_digit: rows.filter(r => /^\d{6}-DC$/.test(r.source_external_id)).length,
  fetched: inventory.filter(q => !q.source_error).length, source_errors: inventory.filter(q => q.source_error),
  key_verified: inventory.filter(q => q.key?.status === 'verified').length,
  key_mismatches: inventory.filter(q => q.key?.status === 'mismatch').map(q => ({ code: q.code, ...q.key })),
  missing_source_prompts: inventory.filter(q => q.missing_source_prompt).map(q => q.code),
  multiple_answer_questions: inventory.filter(q => q.key?.multiple_official_values).map(q => ({ code: q.code, ...q.key })),
  keys_needing_review: inventory.filter(q => q.key?.status === 'review').map(q => ({ code: q.code, ...q.key })),
  questions_with_png_math: inventory.filter(q => q.has_png_math).length, math_images: mathImages.length,
  math_image_status: Object.fromEntries(['candidate', 'unparsed', 'residual-speech', 'ambiguous-comma', 'unbalanced', 'math-error'].map(status => [status, mathImages.filter(i => i.status === status).length])),
  figures: images.filter(i => !i.is_math).length, questions_with_older_classes: inventory.filter(q => q.contains_older_classes).length,
  questions_with_missing_paragraph_alignment: inventory.filter(q => q.has_missing_alignment).length,
  questions_with_nested_tables: inventory.filter(q => q.nested_tables).length,
  questions_with_nested_paragraph_markup: inventory.filter(q => q.nested_paragraph_markup).length,
  questions_with_truncation: inventory.filter(q => q.truncation_marker).map(q => q.code),
  content_comparison_candidates: inventory.filter(q => q.comparisons?.some((f: any) => f.equal === false)).length,
  question_comparison_candidates: inventory.filter(q => q.comparisons && q.question_content_equivalent === false).length,
  option_comparison_candidates: inventory.filter(q => q.comparisons?.some((f: any) => f.field.startsWith('option-') && f.equal === false)).map(q => q.code),
  rationale_comparison_candidates: inventory.filter(q => q.comparisons?.some((f: any) => f.field === 'rationale' && f.equal === false)).length,
  live_writes: 0 };
await writeFile(resolve(root, 'inventory.json'), JSON.stringify(inventory, null, 2));
await writeFile(resolve(root, 'math-image-inventory.json'), JSON.stringify(images, null, 2));
await writeFile(resolve(root, 'summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary, null, 2));
