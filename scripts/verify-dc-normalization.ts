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
const checks: Data[] = await read('pilot-checks.json');
const md5 = (s: string | null) => s == null ? null : createHash('md5').update(s).digest('hex');
const timestamp = (s: string) => new Date(s).toISOString();
const canonicalDates = (row: Data) => Object.fromEntries(Object.entries(row).map(([k, v]) =>
  [k, k.endsWith('_at') && typeof v === 'string' ? timestamp(v) : v]));
const optionHashes = (options: Data[] | null, field = 'content_html') => options?.length ? options.map(o => {
  const { [field]: content, ...identity } = o;
  return { hash: md5(content), identity };
}) : null;
assert.equal(after.questions.length, proposals.length);
assert.equal(after.cohort_count, 459);
assert.equal(after.cohort_broken, 0);
for (const prior of baseline.history ?? []) {
  assert.ok(after.history.some((h: Data) => h.id === prior.id && h.question_id === prior.question_id
    && timestamp(h.prior_updated_at) === timestamp(prior.prior_updated_at)), 'Earlier content history missing');
}
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
  if (live.preserved_text) assert.equal(row.preserved_text,live.preserved_text,row.code + ': exact native metadata changed');
  const priorIds = new Set((baseline.history ?? []).map((h: Data) => h.id));
  const history = after.history.filter((h: Data) => h.question_id === row.id && !priorIds.has(h.id));
  assert.equal(history.length, 1, row.code + ': expected one prior snapshot');
  const snapshot = history[0];
  assert.equal(timestamp(snapshot.prior_updated_at), timestamp(old.updated_at));
  for (const [field, hash] of Object.entries(snapshot.hashes)) assert.equal(hash, md5(old[field]), row.code + ': original content snapshot');
  assert.deepEqual(snapshot.options, optionHashes(old.options));
  assert.deepEqual(snapshot.correct_answer, old.correct_answer);
  assert.equal(row.correct_answer_text,snapshot.correct_answer_text,row.code + ': exact answer key changed');
}
assert.deepEqual(after.memberships, invariants.memberships, 'Practice-test membership changed');
let newAttempts = 0;
if (after.attempts_preservation) {
  // A live bank can receive new attempts during a long content review. Verify
  // every earlier row's full fingerprint, and account for additions separately.
  const evidence = after.attempts_preservation;
  const cutoff = Date.parse(evidence.cutoff);
  assert.ok(Number.isFinite(cutoff), 'Missing attempt baseline cutoff');
  assert.deepEqual(evidence.prior_attempts, invariants.attempts, 'Existing student attempt records changed');
  assert.deepEqual(evidence.current_attempts, after.attempts, 'Attempt evidence differs from the saved verification');
  const expectedCounts = new Map<string, number>((invariants.attempts ?? []).map((a: Data) => [a.question_id, a.count]));
  const additions: Data[] = evidence.additional_attempts ?? [];
  assert.equal(new Set(additions.map(a => a.question_id)).size, additions.length);
  for (const a of additions) {
    assert.ok(after.questions.some((q: Data) => q.id === a.question_id));
    assert.ok(Number.isSafeInteger(a.count) && a.count > 0);
    assert.ok(Date.parse(a.first_created_at) >= cutoff && Date.parse(a.last_created_at) >= Date.parse(a.first_created_at));
    expectedCounts.set(a.question_id, (expectedCounts.get(a.question_id) ?? 0) + a.count);
    newAttempts += a.count;
  }
  assert.deepEqual(after.attempts.map((a: Data) => [a.question_id, a.count]), [...expectedCounts].sort(([a], [b]) => a.localeCompare(b)),
    'Unaccounted student attempt additions');
} else {
  assert.deepEqual(after.attempts, invariants.attempts, 'Student attempt records changed');
}
const summary = { project: 'noqtadytxyslkoetchrs', questions_updated: proposals.length,
  codes: proposals.map(q => q.display_code), math_images_converted: checks.reduce((n, q) => n + q.math_images_replaced, 0),
  exact_content_and_cache_matches: after.questions.length, prior_content_snapshots_verified: after.questions.length,
  answer_keys_and_unrelated_fields_preserved: true, student_attempts_unchanged: (invariants.attempts ?? []).reduce((n: number, a: Data) => n + a.count, 0),
  new_student_attempts_since_baseline: newAttempts,
  cohort_remaining: 459 - proposals.length - (proposals.length === 451 ? 8 : 0), verified_at: new Date().toISOString() };
await writeFile(resolve(root, 'normalization-verification-summary.json'), JSON.stringify(summary, null, 2));
console.log(JSON.stringify(summary));

// Keep the review gallery accurate after a successful live verification.
const indexPath = resolve(root, 'previews/index.html');
const index = await readFile(indexPath, 'utf8');
await writeFile(indexPath, index.replace('The live database has not been changed.',
  `These ${proposals.length} questions are now normalized in the production bank. Saved content and renderings were verified; ${summary.cohort_remaining} questions remain.`));
for (const q of proposals) {
  const path = resolve(root, 'previews', q.display_code + '.html');
  const html = await readFile(path, 'utf8');
  await writeFile(path, html.replace(`${proposals.length} proposed formatting repairs`, `${proposals.length} published formatting repairs`)
    .replace('Preview only', 'Production update verified')
    .replace('<h2>Current bank</h2>', '<h2>Before normalization</h2>')
    .replace('<h2>Proposed formatting</h2>', '<h2>Published normalization</h2>'));
}
