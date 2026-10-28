import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { normalizeDraftMathOptions } from './promotion.ts';
import type { ActOption } from './options.ts';

const content = {
  section: 'math', category: 'Preparing for Higher Math', category_code: 'PHM',
  subcategory: 'Functions', subcategory_code: 'FUN', difficulty: 1,
  stimulus_html: null, stem_html: '<p>Original question</p>', rationale_html: null,
  source_test: 'ACT-example', source_ordinal: 1, is_modeling: true,
};

function legacyDraft() {
  return {
    ...content, id: 'draft-1', status: 'ready_for_review',
    options_json: [...'ABCDE'].map((label, i) => ({
      label, content_html: `<p>Answer ${i + 1}</p>`, is_correct: label === 'E',
    })),
  };
}

function draftStore(row = legacyDraft(), failure?: 'error' | 'changed') {
  const updates: Array<{ options_json: ActOption[] }> = [];
  const filters = new Map<string, string>();
  let patch: { options_json: ActOption[] };
  const query = {
    update(value: typeof patch) { patch = value; return query; },
    eq(column: string, value: string) { filters.set(column, value); return query; },
    select(columns: string) { assert.equal(columns, 'id'); return query; },
    async maybeSingle() {
      if (failure === 'error') return { data: null, error: { message: 'write failed' } };
      if (failure === 'changed') return { data: null, error: null };
      assert.equal(filters.get('id'), row.id);
      assert.equal(filters.get('status'), row.status);
      assert.deepEqual(JSON.parse(filters.get('options_json')!), row.options_json);
      updates.push(patch);
      row = { ...row, ...patch };
      return { data: { id: row.id }, error: null };
    },
  };
  return {
    updates, row: () => row,
    client: { from(table: string) { assert.equal(table, 'act_question_drafts'); return query; } },
  };
}

test('approval saves four choices and the adjusted key, then reuses them on retry', async (t) => {
  const rng = t.mock.method(Math, 'random', () => 0);
  const draft = legacyDraft();
  const store = draftStore(draft);
  const normalized = await normalizeDraftMathOptions(store.client, draft);
  assert.equal(store.updates.length, 1);
  assert.deepEqual(normalized.options_json, store.row().options_json);
  assert.deepEqual(normalized.options_json.map(o => o.label), ['A', 'B', 'C', 'D']);
  assert.equal(normalized.options_json.find(o => o.is_correct)?.label, 'D');
  assert.equal(normalized.options_json.find(o => o.is_correct)?.content_html, draft.options_json[4].content_html);
  const { options_json: reducedOptions, ...normalizedMetadata } = normalized;
  const { options_json: originalOptions, ...originalMetadata } = draft;
  assert.deepEqual(normalizedMetadata, originalMetadata);
  assert.equal(reducedOptions.length, 4);
  assert.equal(originalOptions.length, 5);

  const retry = await normalizeDraftMathOptions(store.client, store.row());
  assert.deepEqual(retry.options_json, normalized.options_json);
  assert.equal(store.updates.length, 1);
  assert.equal(rng.mock.callCount(), 1);
  assert.equal(draft.options_json.length, 5);
});

test('approval stops if the reduced choices cannot be saved or the draft changed', async () => {
  for (const [failure, message] of [['error', /write failed/], ['changed', /reload/]] as const) {
    const draft = legacyDraft();
    const store = draftStore(draft, failure);
    await assert.rejects(normalizeDraftMathOptions(store.client, draft), message);
    assert.equal(store.updates.length, 0);
    assert.deepEqual(store.row().options_json, draft.options_json);
  }
});

test('the Supabase update matches the original JSON choices and saves the adjusted key', async (t) => {
  t.mock.method(Math, 'random', () => 0);
  const draft = legacyDraft();
  let requests = 0;
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, init) => {
      requests++;
      const url = new URL(String(input));
      assert.equal(url.pathname, '/rest/v1/act_question_drafts');
      assert.equal(init?.method, 'PATCH');
      assert.equal(url.searchParams.get('id'), 'eq.draft-1');
      assert.equal(url.searchParams.get('status'), 'eq.ready_for_review');
      assert.equal(url.searchParams.get('options_json'), `eq.${JSON.stringify(draft.options_json)}`);
      const payload = JSON.parse(String(init?.body));
      assert.deepEqual(payload.options_json.map((o: ActOption) => o.label), ['A', 'B', 'C', 'D']);
      assert.equal(payload.options_json.find((o: ActOption) => o.is_correct).label, 'D');
      return new Response(JSON.stringify({ id: draft.id }), { headers: { 'content-type': 'application/json' } });
    } },
  });
  const normalized = await normalizeDraftMathOptions(client, draft);
  assert.equal(requests, 1);
  assert.equal(normalized.options_json.length, 4);
});

test('approval does not write already normalized options, other sections, or invalid keys', async () => {
  const drafts = [
    { ...legacyDraft(), options_json: legacyDraft().options_json.slice(1) },
    { ...legacyDraft(), section: 'reading' },
    { ...legacyDraft(), options_json: legacyDraft().options_json.map(o => ({ ...o, is_correct: false })) },
    { ...legacyDraft(), options_json: null },
  ];
  const noWrites = { from() { throw new Error('Unexpected database write'); } };
  for (const draft of drafts) assert.equal(await normalizeDraftMathOptions(noWrites, draft), draft);
});
