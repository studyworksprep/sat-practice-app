import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { buildActAssignmentTaxonomy, parseActSelections } from './act-assignment-taxonomy.ts';

test('section/category counts include unclassified questions and expose only available subcategories', () => {
  const taxonomy = buildActAssignmentTaxonomy([
    { section: 'math', category: 'Preparing for Higher Math', subcategory: 'Algebra' },
    { section: 'math', category: 'Preparing for Higher Math', subcategory: 'Geometry' },
    { section: 'math', category: 'Preparing for Higher Math', subcategory: null },
    { section: 'math', category: 'Integrating Essential Skills' },
    { section: 'english', category: 'Conventions of Standard English', subcategory: 'Punctuation' },
    { section: 'reading', category: 'Craft and Structure' },
    { section: 'science', category: 'Interpretation of Data' },
  ]);
  assert.deepEqual(taxonomy.map(s => s.section), ['english', 'math', 'reading', 'science']);
  assert.deepEqual(taxonomy[1].categories, [
    { name: 'Integrating Essential Skills', count: 1, subcategories: [] },
    { name: 'Preparing for Higher Math', count: 3, subcategories: [{ name: 'Algebra', count: 1 }, { name: 'Geometry', count: 1 }] },
  ]);
  assert.equal(taxonomy[0].categories[0].subcategories[0].name, 'Punctuation');
  assert.deepEqual(taxonomy[2].categories[0].subcategories, []);
});

test('old templates retain whole categories while child selections round-trip and overlapping picks collapse', () => {
  const parent = { section: 'math', category: 'Preparing for Higher Math' };
  const child = { ...parent, subcategory: 'Algebra' };
  assert.deepEqual(parseActSelections(JSON.stringify([child, child])), [child]);
  assert.deepEqual(parseActSelections([child, parent]), [parent]);
  assert.deepEqual(parseActSelections(JSON.stringify([parent])), [parent]);
  assert.deepEqual(parseActSelections([{ ...child, subcategory: 5 }, { section: 'bad', category: 'x' }]), []);
});

// Exercise the actual assignment sampler with its database reads isolated.
// Unrelated action dependencies are not needed when calling this builder.
const source = (await readFile(new URL('../../app/(tutor)/tutor/assignments/new/actions.ts', import.meta.url), 'utf8'))
  .replace(/^import .*;$/gm, '');
const compiled = ts.transpileModule(source + '\nexport { buildActQuestionsPayload };', {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText;
const imports = `import { parseActSelections } from ${JSON.stringify(new URL('./act-assignment-taxonomy.ts', import.meta.url).href)};
import { visibleActQuestions } from ${JSON.stringify(new URL('./act-visibility.ts', import.meta.url).href)};`;
const { buildActQuestionsPayload } = await import(`data:text/javascript;base64,${Buffer.from(imports + compiled).toString('base64')}`);

test('assignment sampling filters by both parent and subcategory and saves that exact template recipe', async () => {
  const rows = [
    { id: 'a1', section: 'math', category: 'Preparing for Higher Math', subcategory: 'Algebra', difficulty: 2 },
    { id: 'a2', section: 'math', category: 'Preparing for Higher Math', subcategory: 'Algebra', difficulty: 2 },
    { id: 'g1', section: 'math', category: 'Preparing for Higher Math', subcategory: 'Geometry', difficulty: 2 },
  ].map(row => ({ ...row, is_broken: false, deleted_at: null }));
  const client = { from() {
    const predicates = [];
    const query = {
      select() { return query; },
      eq(column, value) { predicates.push(row => row[column] === value); return query; },
      is(column, value) { return query.eq(column, value); },
      in(column, values) { predicates.push(row => values.includes(row[column])); return query; },
      limit(n) { return Promise.resolve({ data: rows.filter(row => predicates.every(check => check(row))).slice(0, n) }); },
    };
    return query;
  } };
  const selection = { section: 'math', category: 'Preparing for Higher Math', subcategory: 'Algebra' };
  const fd = new FormData();
  fd.set('act_selections', JSON.stringify([selection]));
  fd.set('size', '3');
  const result = await buildActQuestionsPayload(client, fd, []);
  assert.equal(result.ok, true);
  assert.deepEqual(result.row.question_ids.sort(), ['a1', 'a2']);
  assert.deepEqual(result.row.filter_criteria.actSelections, [selection]);
  fd.set('act_selections', JSON.stringify([{ section: 'math', category: 'Preparing for Higher Math' }]));
  const whole = await buildActQuestionsPayload(client, fd, []);
  assert.deepEqual(whole.row.question_ids.sort(), ['a1', 'a2', 'g1']);
});
