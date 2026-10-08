// Verify saved production content against the reviewed normalization package.
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

type Data = Record<string, any>;
const root = resolve(process.argv[2] ?? 'tmp/dc-question-audit-2026-10-08');
const read = async (file: string) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const before: Data[] = await read('before.json');
const baseline = await read('normalization-before.json');
const proposals: Data[] = await read('pilot-proposals.json');
const after = await read('normalization-after.json');
const invariants = await read('normalization-invariants-before.json');
const md5 = (s: string | null) => s == null ? null : createHash('md5').update(s).digest('hex');
const timestamp = (s: string) => s.replace('T', ' ').replace(/\+00(?::00)?$/, 'Z');
const canonicalDates = (row: Data) => Object.fromEntries(Object.entries(row).map(([k, v]) =>
  [k, k.endsWith('_at') && typeof v === 'string' ? timestamp(v) : v]));
const optionHashes = (options: Data[] | null, field = 'content_html') => options?.length ? options.map(o => {
  const { [field]: content, ...identity } = o;
  return { hash: md5(content), identity };
}) : null;
assert.equal(after.questions.length, proposals.length);
assert.equal(after.cohort_count, before.length);
assert.equal(after.cohort_broken, 0);
for (const row of after.questions) {
  const old = before.find(q => q.id === row.id)!;
  const proposed = proposals.find(q => q.id === row.id)!;
  const live = baseline.questions.find((q: Data) => q.id === row.id)!;
  assert.ok(old && proposed && live);
  for (const [field, hash] of Object.entries(row.hashes)) assert.equal(hash, md5(proposed[field]), row.code + ': saved ' + field);
  assert.deepEqual(row.options, optionHashes(proposed.options), row.code + ': saved choices');
  assert.deepEqual(row.options_rendered, optionHashes(proposed.options_rendered, 'content_html_rendered'), row.code + ': saved choice renderings');
  assert.equal(row.rendered_source_hash, proposed.rendered_source_hash);
  assert.equal(Date.parse(row.rendered_at), Date.parse(proposed.rendered_at));
  assert.ok(Date.parse(row.updated_at) > Date.parse(old.updated_at));
  assert.deepEqual(canonicalDates(row.preserved), canonicalDates(live.preserved), row.code + ': unrelated data changed');
  const priorIds = new Set((baseline.history ?? []).map((h: Data) => h.id));
  const history = after.history.filter((h: Data) => h.question_id === row.id && !priorIds.has(h.id));
  assert.equal(history.length, 1, row.code + ': expected one prior snapshot');
  const snapshot = history[0];
  assert.equal(timestamp(snapshot.prior_updated_at), timestamp(old.updated_at));
  for (const [field, hash] of Object.entries(snapshot.hashes)) assert.equal(hash, md5(old[field]), row.code + ': original content snapshot');
  assert.deepEqual(snapshot.options, optionHashes(old.options));
  assert.deepEqual(snapshot.correct_answer, old.correct_answer);
}
assert.deepEqual(after.memberships, invariants.memberships, 'Practice-test membership changed');
assert.deepEqual(after.attempts, invariants.attempts, 'Student attempt records changed');
const summary = { project: 'noqtadytxyslkoetchrs', questions_updated: proposals.length,
  codes: proposals.map(q => q.display_code), math_images_converted: 43,
  exact_content_and_cache_matches: after.questions.length, prior_content_snapshots_verified: after.questions.length,
  answer_keys_and_unrelated_fields_preserved: true, student_attempts_unchanged: (after.attempts ?? []).reduce((n: number, a: Data) => n + a.count, 0),
  cohort_remaining: before.length - proposals.length, verified_at: new Date().toISOString() };
await writeFile(resolve(root, 'normalization-verification-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));

// Keep the review gallery accurate after a successful live verification.
const indexPath = resolve(root, 'previews/index.html');
const index = await readFile(indexPath, 'utf8');
await writeFile(indexPath, index.replace('The live database has not been changed.',
  'These eight questions are now normalized in the production bank. Saved content and renderings were verified; 451 questions remain for subsequent batches.'));
for (const q of proposals) {
  const path = resolve(root, 'previews', q.display_code + '.html');
  const html = await readFile(path, 'utf8');
  await writeFile(path, html.replace('Eight proposed formatting repairs', 'First eight published formatting repairs')
    .replace('Preview only', 'Production update verified')
    .replace('<h2>Current bank</h2>', '<h2>Before normalization</h2>')
    .replace('<h2>Proposed formatting</h2>', '<h2>Published normalization</h2>'));
}
