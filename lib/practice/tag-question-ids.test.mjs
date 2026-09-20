// Tests for the shared concept-tag → question-id resolver. Uses an
// in-memory stand-in for the Supabase query builder: just enough of
// .from().select().in().order().range() for fetchAll to page through.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_TAG_FILTERS,
  intersectTaggedQuestionIds,
  normalizeTagIds,
} from './tag-question-ids.ts';

function fakeSupabase(linkRows, { fail = false } = {}) {
  return {
    from(table) {
      assert.equal(table, 'question_concept_tags');
      return {
        select() {
          return {
            in(column, values) {
              assert.equal(column, 'tag_id');
              const matched = linkRows
                .filter((r) => values.includes(r.tag_id))
                .map((r, i) => ({ ...r, id: r.id ?? String(i) }));
              const builder = {
                order(col) {
                  matched.sort((a, b) => String(a[col]).localeCompare(String(b[col])));
                  return builder;
                },
                range(from, to) {
                  const page = matched.slice(from, to + 1);
                  return Promise.resolve(
                    fail
                      ? { data: null, error: new Error('boom'), count: null }
                      : { data: page, error: null, count: null },
                  );
                },
              };
              return builder;
            },
          };
        },
      };
    },
  };
}

test('normalizeTagIds dedupes, trims, drops blanks and non-strings, clamps', () => {
  assert.deepEqual(normalizeTagIds(['a', ' b ', '', null, 'a', 42, 'c']), ['a', 'b', 'c']);
  const many = Array.from({ length: MAX_TAG_FILTERS + 5 }, (_, i) => `t${i}`);
  assert.equal(normalizeTagIds(many).length, MAX_TAG_FILTERS);
  assert.deepEqual(normalizeTagIds([undefined]), []);
});

test('single tag resolves to its linked question ids', async () => {
  const sb = fakeSupabase([
    { tag_id: 'A', question_id: 'q1' },
    { tag_id: 'A', question_id: 'q2' },
    { tag_id: 'B', question_id: 'q2' },
  ]);
  const out = await intersectTaggedQuestionIds(sb, ['A']);
  assert.deepEqual([...out].sort(), ['q1', 'q2']);
});

test('multiple tags AND-combine', async () => {
  const sb = fakeSupabase([
    { tag_id: 'A', question_id: 'q1' },
    { tag_id: 'A', question_id: 'q2' },
    { tag_id: 'B', question_id: 'q2' },
    { tag_id: 'B', question_id: 'q3' },
    { tag_id: 'C', question_id: 'q2' },
  ]);
  assert.deepEqual([...await intersectTaggedQuestionIds(sb, ['A', 'B'])], ['q2']);
  assert.deepEqual([...await intersectTaggedQuestionIds(sb, ['A', 'B', 'C'])], ['q2']);
});

test('a tag with no links empties the intersection', async () => {
  const sb = fakeSupabase([{ tag_id: 'A', question_id: 'q1' }]);
  const out = await intersectTaggedQuestionIds(sb, ['A', 'Z']);
  assert.equal(out.size, 0);
  assert.equal((await intersectTaggedQuestionIds(sb, ['Z'])).size, 0);
  assert.equal((await intersectTaggedQuestionIds(sb, [])).size, 0);
});

test('pages past the PostgREST row cap instead of truncating', async () => {
  const rows = Array.from({ length: 2500 }, (_, i) => ({
    id: String(i).padStart(5, '0'),
    tag_id: 'A',
    question_id: `q${i}`,
  }));
  const out = await intersectTaggedQuestionIds(fakeSupabase(rows), ['A']);
  assert.equal(out.size, 2500);
});

test('query errors surface as null, not an empty set', async () => {
  const sb = fakeSupabase([{ tag_id: 'A', question_id: 'q1' }], { fail: true });
  assert.equal(await intersectTaggedQuestionIds(sb, ['A']), null);
});
