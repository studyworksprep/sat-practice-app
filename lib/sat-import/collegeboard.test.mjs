import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCollegeBoardIds, resolveCollegeBoardIds, collegeBoardCandidate, fetchCollegeBoardQuestion, COLLEGE_BOARD_QUESTION_URL } from './collegeboard.ts';
import { parseMetadata } from './parse.ts';

const ext = '586d1a77-0fa4-47ac-9bfd-99a22646448c';
const resolved = { id: '37c481f8', originalId: 'RW-01748', externalId: ext, metadata: { questionId: '37c481f8', external_id: ext } };
const payload = () => ({ type: 'mcq', externalid: ext, stem: '<p>Which?</p>', stimulus: '<p>Text</p>', rationale: '<p>Because.</p>', keys: ['k2'], correct_answer: ['B'],
  answerOptions: [{ id: 'k1', content: '<p>A</p>' }, { id: 'k2', content: '<p>B</p>' }, { id: 'k3', content: '<p>C</p>' }, { id: 'k4', content: '<p>D</p>' }] });

test('accepts question IDs, external IDs and bank codes once each', () => {
  const ids = parseCollegeBoardIds(`37C481F8, rw-01748\n${ext}\n37c481f8`);
  assert.deepEqual(ids.map(i => [i.kind, i.value]), [['question', '37c481f8'], ['code', 'RW-01748'], ['external', ext]]);
  assert.throws(() => parseCollegeBoardIds('37c481f8 hello'), /not a College Board/);
  assert.throws(() => parseCollegeBoardIds(' \n'), /at least one/);
  assert.throws(() => parseCollegeBoardIds(Array.from({ length: 101 }, (_, i) => `RW-${String(i).padStart(5, '0')}`).join('\n')), /at most 100/);
});
test('resolves external IDs from metadata, then the bank, and reports the rest', () => {
  const requested = parseCollegeBoardIds(`37c481f8 RW-00001 M-00001 deadbeef ${ext}`);
  const metadata = [{ questionId: '37c481f8', external_id: ext, difficulty: 'H' }];
  const bank = [
    { id: '1', display_code: 'RW-00001', source_id: 'aaaaaaaa', source_external_id: '11111111-1111-4111-8111-111111111111' },
    { id: '2', display_code: 'M-00001', source_id: 'bbbbbbbb', source_external_id: '08280-DC' },
  ];
  const { resolved: r, warnings } = resolveCollegeBoardIds(requested, metadata, bank);
  assert.deepEqual(r.map(x => [x.id, x.externalId, x.originalId]), [['37c481f8', ext, '37c481f8'], ['aaaaaaaa', '11111111-1111-4111-8111-111111111111', 'RW-00001']]);
  assert.equal(r[0].metadata.difficulty, 'H');
  assert.equal(r[1].metadata.questionId, 'aaaaaaaa');
  assert.deepEqual(warnings.map(w => w.split(':')[0]), ['M-00001', 'deadbeef']);
  assert.match(warnings[0], /cannot be fetched/);
  assert.match(resolveCollegeBoardIds(parseCollegeBoardIds('RW-09999'), [], []).warnings[0], /no bank question has this code/);
  const external = resolveCollegeBoardIds(parseCollegeBoardIds('11111111-1111-4111-8111-111111111111'), [], bank).resolved[0];
  assert.equal(external.id, 'aaaaaaaa');
});
test('maps a College Board question to an import candidate', () => {
  const c = collegeBoardCandidate(payload(), resolved);
  assert.equal(c.id, '37c481f8'); assert.equal(c.originalId, 'RW-01748');
  assert.equal(c.questionType, 'mcq'); assert.equal(c.answer, 'B');
  assert.deepEqual(c.correctAnswer, { option_label: 'B' });
  assert.deepEqual(c.presentation.options, [{ label: 'A', content_html: '<p>A</p>' }, { label: 'B', content_html: '<p>B</p>' }, { label: 'C', content_html: '<p>C</p>' }, { label: 'D', content_html: '<p>D</p>' }]);
  assert.equal(c.presentation.stimulus_html, '<p>Text</p>'); assert.equal(c.presentation.rationale_html, '<p>Because.</p>');
  assert.deepEqual(c.warnings, []);
});
test('falls back to answer keys, flags disagreements and missing answers', () => {
  assert.equal(collegeBoardCandidate({ ...payload(), correct_answer: [] }, resolved).answer, 'B');
  const multi = collegeBoardCandidate({ ...payload(), correct_answer: ['A', 'B'] }, resolved);
  assert.equal(multi.answer, ''); assert.match(multi.warnings.join(), /more than one/);
  assert.match(collegeBoardCandidate({ ...payload(), correct_answer: [], keys: [] }, resolved).warnings.join(), /No correct answer/);
  const disagree = collegeBoardCandidate({ ...payload(), correct_answer: ['C'] }, resolved);
  assert.equal(disagree.answer, 'C'); assert.match(disagree.warnings.join(), /disagree/);
});
test('maps student-produced responses with every accepted value', () => {
  const c = collegeBoardCandidate({ type: 'spr', externalid: ext, stem: '<p>Solve</p>', stimulus: '', rationale: '', correct_answer: ['3/2', '1.5'] }, resolved);
  assert.equal(c.questionType, 'spr'); assert.equal(c.answer, '3/2, 1.5');
  assert.deepEqual(JSON.parse(c.correctAnswer.text), ['3/2', '1.5']);
  assert.equal(c.presentation.stimulus_html, null); assert.deepEqual(c.presentation.options, []);
  assert.match(c.warnings.join(), /No explanation/);
});
test('rejects wrong questions, unsupported types, choice counts and unsafe markup', () => {
  assert.throws(() => collegeBoardCandidate({ ...payload(), externalid: 'other' }, resolved), /different question/);
  assert.throws(() => collegeBoardCandidate({ ...payload(), type: 'essay' }, resolved), /unsupported question type/);
  assert.throws(() => collegeBoardCandidate({ ...payload(), answerOptions: payload().answerOptions.slice(0, 3) }, resolved), /four answer choices/);
  assert.throws(() => collegeBoardCandidate({ ...payload(), stem: '' }, resolved), /no prompt/);
  assert.throws(() => collegeBoardCandidate({ ...payload(), answerOptions: [...payload().answerOptions.slice(0, 3), { id: 'k4', content: ' ' }] }, resolved), /choice D is empty/);
  for (const bad of ['<script>x</script>', '<img src=x onerror="alert(1)">', '<a href="javascript:alert(1)">x</a>', '<iframe src="https://x"></iframe>', '<iframe srcdoc="x">']) {
    assert.throws(() => collegeBoardCandidate({ ...payload(), stimulus: `<p>ok</p>${bad}` }, resolved), /unsupported markup/);
  }
  assert.throws(() => collegeBoardCandidate(null, resolved), /no question data/);
});
test('keeps bank markup verbatim, including underline spans, figures and entities', () => {
  const stimulus = '<p>He&rsquo;d <span style="text-decoration: underline;" role="region" aria-label="Referenced Content 1">seen</span> it.&nbsp;</p>\n<figure><svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Chart"><rect/></svg></figure>';
  assert.equal(collegeBoardCandidate({ ...payload(), stimulus }, resolved).presentation.stimulus_html, stimulus);
});
test('fetches one question from the fixed endpoint and maps failures', async () => {
  const calls = [];
  const ok = async (url, init) => { calls.push([url, init]); return new Response(JSON.stringify(payload()), { status: 200 }); };
  const json = await fetchCollegeBoardQuestion(ext, ok);
  assert.equal(json.externalid, ext);
  assert.equal(calls[0][0], COLLEGE_BOARD_QUESTION_URL);
  assert.equal(calls[0][1].method, 'POST'); assert.deepEqual(JSON.parse(calls[0][1].body), { external_id: ext });
  assert.ok(calls[0][1].signal instanceof AbortSignal);
  await assert.rejects(fetchCollegeBoardQuestion('nope', ok), /Invalid external ID/);
  await assert.rejects(fetchCollegeBoardQuestion(ext, async () => new Response('', { status: 404 })), /no question with this external ID/);
  await assert.rejects(fetchCollegeBoardQuestion(ext, async () => new Response('oops', { status: 500 })), /HTTP 500/);
  await assert.rejects(fetchCollegeBoardQuestion(ext, async () => new Response('<html>', { status: 200 })), /unreadable/);
  await assert.rejects(fetchCollegeBoardQuestion(ext, async () => { throw Object.assign(new Error('x'), { name: 'TimeoutError' }); }), /did not respond/);
  await assert.rejects(fetchCollegeBoardQuestion(ext, async () => { throw new Error('ECONNREFUSED'); }), /could not be reached/);
});
test('metadata can be a full bank listing when the requested IDs are known', () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ questionId: i.toString(16).padStart(8, '0'), external_id: `${i.toString(16).padStart(8, '0')}-0000-4000-8000-000000000000` }));
  assert.throws(() => parseMetadata(JSON.stringify(rows)), /at most 100/);
  const kept = parseMetadata(JSON.stringify(rows), new Set(['00000005', rows[7].external_id]));
  assert.deepEqual(kept.map(r => r.questionId), ['00000005', '00000007']);
  assert.deepEqual(parseMetadata('', new Set(['00000005'])), []);
});
