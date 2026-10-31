import test from 'node:test';
import assert from 'node:assert/strict';
import type { TypedSupabaseClient } from '../supabase/server.ts';
import {
  loadActPracticeTaxonomy, shapeActPracticeTaxonomy, type ActPracticeTaxonomyRow,
} from './act-practice-taxonomy.ts';

const row = (overrides: Partial<ActPracticeTaxonomyRow> = {}): ActPracticeTaxonomyRow => ({
  section: 'math', category: 'Algebra', subcategory: 'Equations', question_count: 1, ...overrides,
});

test('summary counts preserve parent totals above the API row cap and bigint strings', () => {
  assert.deepEqual(shapeActPracticeTaxonomy([
    row({ question_count: '1203' }), row({ subcategory: 'Inequalities', question_count: 8 }),
    row({ subcategory: null, question_count: 2 }), row({ subcategory: '', question_count: 3 }),
    row({ category: null, question_count: 5 }), row({ category: '', question_count: 7 }),
  ]), [{
    section: 'math', name: 'Math', count: 1228,
    categories: [{ name: 'Algebra', count: 1216, subcategories: [
      { name: 'Equations', count: 1203 }, { name: 'Inequalities', count: 8 },
    ] }],
  }]);
});

test('canonical section order ignores unknown sections and keeps unlabeled sections', () => {
  const sections = shapeActPracticeTaxonomy([
    row({ section: 'science', category: null }), row({ section: 'reading' }), row(),
    row({ section: 'english' }), row({ section: 'other', question_count: 100 }),
    row({ section: null }), row({ section: '' }),
  ]);
  assert.deepEqual(sections.map(section => section.name), ['English', 'Math', 'Reading', 'Science']);
  assert.deepEqual(sections[3].categories, []);
  assert.equal(sections[3].count, 1);
  assert.deepEqual(shapeActPracticeTaxonomy([]), []);
});

test('largest buckets come first with stable alphabetical ties and unchanged label whitespace', () => {
  const [section] = shapeActPracticeTaxonomy([
    row({ category: 'Z', subcategory: 'Z', question_count: 2 }),
    row({ category: 'A', subcategory: 'Z' }), row({ category: 'A', subcategory: 'A' }),
    row({ category: 'Largest', subcategory: 'First', question_count: 3 }),
    row({ category: ' ', subcategory: ' ', question_count: 1 }),
  ]);
  assert.deepEqual(section.categories.map(c => [c.name, c.count]), [
    ['Largest', 3], ['A', 2], ['Z', 2], [' ', 1],
  ]);
  assert.deepEqual(section.categories[1].subcategories.map(s => s.name), ['A', 'Z']);
  assert.deepEqual(section.categories[3].subcategories, [{ name: ' ', count: 1 }]);
});

function mockClient(pages: { data: ActPracticeTaxonomyRow[] | null; error: Error | null }[]) {
  const ranges: number[][] = [];
  const orders: unknown[][] = [];
  const builder = {
    select(columns: string) {
      assert.equal(columns, 'section, category, subcategory, question_count');
      return builder;
    },
    order(column: string, options: unknown) { orders.push([column, options]); return builder; },
    range(from: number, to: number) {
      ranges.push([from, to]);
      assert.ok(pages.length, 'unexpected extra API request');
      return Promise.resolve(pages.shift()!);
    },
  };
  const client = { from(name: string) { assert.equal(name, 'act_practice_taxonomy'); return builder; } };
  return { client: client as unknown as Pick<TypedSupabaseClient, 'from'>, ranges, orders };
}

test('loader paginates summary groups with all grouping keys ordered', async () => {
  const fixture = mockClient([
    { data: Array.from({ length: 1000 }, (_, i) => row({ subcategory: `Group ${i}`, question_count: 2 })), error: null },
    { data: [row({ subcategory: 'Last', question_count: 7 })], error: null },
  ]);
  const [section] = await loadActPracticeTaxonomy(fixture.client);
  assert.equal(section.count, 2007);
  assert.equal(section.categories[0].subcategories.length, 1001);
  assert.deepEqual(fixture.ranges, [[0, 999], [1000, 1999]]);
  assert.deepEqual(fixture.orders.slice(0, 3), ['section', 'category', 'subcategory'].map(column =>
    [column, { ascending: true, nullsFirst: true }]));
});

test('empty taxonomy loads once and remains empty', async () => {
  const fixture = mockClient([{ data: [], error: null }]);
  assert.deepEqual(await loadActPracticeTaxonomy(fixture.client), []);
  assert.equal(fixture.ranges.length, 1);
});

test('a later page error fails the load instead of displaying partial counts', async () => {
  const error = new Error('taxonomy read failed');
  const fixture = mockClient([
    { data: Array.from({ length: 1000 }, () => row()), error: null },
    { data: null, error },
  ]);
  await assert.rejects(loadActPracticeTaxonomy(fixture.client), error);
});
