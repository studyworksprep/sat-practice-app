import test from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { loadReview } from './load-review.mjs';

function fixture({ counts = { all: 215, ready_for_review: 75, approved: 140, rejected: 0, parsing: 0 }, fail } = {}) {
  const requests = [];
  const client = createClient('https://example.supabase.co', 'test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input, options) => {
      const url = new URL(input);
      requests.push({ url, options });
      const head = options.method === 'HEAD';
      if (fail === (head ? 'counts' : 'drafts')) {
        return new Response(head ? null : JSON.stringify({ message: 'statement timeout', code: '57014' }), { status: 500 });
      }
      if (head) {
        const status = url.searchParams.get('status')?.slice(3) ?? 'all';
        return new Response(null, { headers: { 'content-range': `*/${counts[status]}` } });
      }
      return new Response(JSON.stringify([{ id: 'draft-21', section: 'english', source_ordinal: 21 }]), {
        headers: { 'content-type': 'application/json' },
      });
    } },
  });
  return { client, requests };
}

test('loads only a bounded page of content while preserving whole-job counts', async () => {
  const { client, requests } = fixture();
  const result = await loadReview(client, 'job', { status: 'ready_for_review', page: '2' });
  assert.equal(result.counts.all, 215);
  assert.equal(result.counts.approved, 140);
  assert.equal(result.total, 75);
  assert.equal(result.pages, 4);
  assert.equal(result.offset, 20);
  const content = requests.find(r => r.options.method !== 'HEAD');
  assert.equal(content.url.searchParams.get('offset'), '20');
  assert.equal(content.url.searchParams.get('limit'), '20');
  assert.equal(content.url.searchParams.get('status'), 'eq.ready_for_review');
  assert.equal(content.url.searchParams.get('order'), 'section.asc,source_ordinal.asc,id.asc');
  for (const request of requests) {
    assert.equal(request.url.searchParams.get('import_job_id'), 'eq.job');
    assert.ok(request.options.signal);
    if (request.options.method === 'HEAD') assert.equal(request.url.searchParams.get('select'), 'id');
  }
});

test('invalid filters and pages default safely; removed last pages clamp to existing results', async () => {
  const { client } = fixture();
  const invalid = await loadReview(client, 'job', { status: 'unknown', page: '-1' });
  assert.equal(invalid.filter, 'all');
  assert.equal(invalid.page, 1);
  const last = await loadReview(client, 'job', { status: 'ready_for_review', page: '9999' });
  assert.equal(last.page, 4);
});

for (const fail of ['counts', 'drafts']) {
  test(`${fail} failures never masquerade as an empty import`, async () => {
    const { client } = fixture({ fail });
    await assert.rejects(loadReview(client, 'job'), /Could not load/);
  });
}
