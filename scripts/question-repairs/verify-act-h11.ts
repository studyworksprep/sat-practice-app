// Read-only validation of the source-reviewed September 2024 ACT repairs.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { renderHtml } from '../../lib/content/render-math.mjs';
import { sanitizeQuestionHtml } from '../../lib/sanitize.ts';
import { assessActQuestions } from '../../lib/practice/act-format-detection.ts';

const record = JSON.parse(readFileSync('content/question-repairs/2026-10/act-h11-math-finalization.json', 'utf8'));
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
assert.equal(record.status, 'applied-and-verified');
assert.equal(record.source_test, 'ACT-2024-Sep');
if (existsSync(record.source_pdf)) {
  assert.equal(createHash('sha256').update(readFileSync(record.source_pdf)).digest('hex'), record.source_sha256);
}
assert.deepEqual(record.repairs.map((r: { ordinal: number }) => r.ordinal), [4, 31, 33, 34, 49]);
for (const repair of record.repairs) {
  assert.equal(hash(repair.before), repair.before_sha256);
  assert.equal(hash(repair.after), repair.after_sha256);
  const { options: oldOptions, stem_html: oldStem, rationale_html: oldRationale, is_broken: oldBroken, updated_at: oldTime, ...before } = repair.before;
  const { options, stem_html: stem, rationale_html: rationale, is_broken: broken, updated_at: time, ...after } = repair.after;
  assert.deepEqual(before, after, `Q${repair.ordinal}: immutable question metadata`);
  assert.equal(broken, false);
  assert.equal(options.length, 4);
  for (const [i, option] of options.entries()) {
    const { content_html: oldHtml, ...oldMetadata } = oldOptions[i];
    const { content_html: html, ...metadata } = option;
    assert.deepEqual(metadata, oldMetadata, `Q${repair.ordinal}: option identity and answer flag`);
    assert.equal(option.label, 'ABCD'[i]);
    assert.ok(html.trim());
  }
  assert.equal(options.filter((o: { is_correct: boolean }) => o.is_correct).length, 1);
  for (const html of [stem, rationale, ...options.map((o: { content_html: string }) => o.content_html)]) {
    if (!html) continue;
    const rendered = renderHtml(html);
    assert.doesNotMatch(rendered, /data-mjx-error|data-mml-node="merror"/);
    assert.ok(sanitizeQuestionHtml(rendered).trim());
  }
}
assert.deepEqual(record.official_math_key.map((k: { ordinal: number }) => k.ordinal), Array.from({ length: 60 }, (_, i) => i + 1));
assert.equal(record.official_math_key.filter((k: { category: string }) => k.category.includes('MDL')).length, 19);
assert.equal(record.verification.available_questions, 215);
assert.equal(record.verification.score_conversions_verified, 219);
assert.equal(record.verification.browser_checks, 430);
assert.deepEqual(record.verification.browser_failures, []);

// A fresh database snapshot can be checked without changing production.
const snapshotIndex = process.argv.indexOf('--snapshot');
if (snapshotIndex !== -1) {
  assert.ok(process.argv[snapshotIndex + 1], '--snapshot requires a JSON file');
  const snapshot = JSON.parse(readFileSync(process.argv[snapshotIndex + 1], 'utf8'));
  for (const repair of record.repairs) {
    assert.deepEqual(snapshot.questions.find((q: { id: string }) => q.id === repair.after.id), repair.after);
  }
  const visible = snapshot.questions.filter((q: { is_broken: boolean; deleted_at: string | null }) => !q.is_broken && q.deleted_at == null);
  assert.equal(visible.length, 215);
  assert.deepEqual(assessActQuestions(visible, { format: 'classic', kind: 'released' }), {
    format: 'classic', kind: 'released', reviewReason: null,
  });
  assert.equal(snapshot.job.status, 'completed');
  assert.equal(snapshot.scales.length, 219);
}
console.log(JSON.stringify({ source: record.source_test, repairs: 5, availableQuestions: 215, browserChecks: 430, readOnly: true }));
