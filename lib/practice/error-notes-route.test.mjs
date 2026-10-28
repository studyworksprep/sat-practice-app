import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const moduleUrl = (source) => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const fixturesUrl = moduleUrl(`
  export class ApiError extends Error {
    constructor(message, status) { super(message); this.status = status; }
    toActionResult() { return actionFail(this.message); }
  }
  export let context;
  export function setContext(value) { context = value; }
  export async function requireUser() {
    if (!context) throw new ApiError('Not authenticated', 401);
    return context;
  }
  export const actionFail = error => ({ ok: false, error });
  export const fail = (error, status) => Response.json({ ok: false, error }, { status });
  export const ok = data => Response.json({ ok: true, data });
  export const apiRoute = handler => async request => {
    try { return await handler(request); }
    catch (error) { if (error instanceof ApiError) return fail(error.message, error.status); throw error; }
  };
`);
const fixtures = await import(fixturesUrl);

// Load the actual route and storage action; replace only auth/response
// infrastructure so requests exercise real validation and owner-scoped writes.
async function compile(filename, imports) {
  let source = await readFile(new URL(filename, import.meta.url), 'utf8');
  for (const [specifier, url] of Object.entries(imports)) {
    source = source.replaceAll(`'${specifier}'`, JSON.stringify(url));
  }
  return moduleUrl(ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText);
}
const sharedImports = { '@/lib/api/auth': fixturesUrl, '@/lib/api/response': fixturesUrl };
const actionUrl = await compile('./error-notes-actions.ts', {
  ...sharedImports,
  './question-test-type': new URL('./question-test-type.ts', import.meta.url).href,
});
const { POST } = await import(await compile('../../app/api/practice/error-notes/route.ts', {
  ...sharedImports, '@/lib/practice/error-notes-actions': actionUrl,
}));

const questionId = '00000000-0000-0000-0000-000000000001';
function request(body = { questionId, body: 'My note' }, headers = {}) {
  return new Request('https://app.studyworksprep.com/api/practice/error-notes', {
    method: 'POST', headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

function signedIn({ testType = 'sat', error = null } = {}) {
  const writes = [];
  fixtures.setContext({
    user: { id: 'note-owner' },
    supabase: {
      from(table) {
        const query = {
          select() { return query; },
          eq(field, value) { writes.at(-1)?.filters?.push([field, value]); return query; },
          upsert(row) { writes.push({ row }); return query; },
          delete() { writes.push({ filters: [] }); return query; },
          maybeSingle() {
            return Promise.resolve(table === 'act_questions'
              ? { data: testType === 'act' ? { id: questionId } : null }
              : { data: { body: writes.at(-1)?.row.body, updated_at: '2026-10-27T22:00:00Z' }, error });
          },
          then(resolve, reject) { return Promise.resolve({ error }).then(resolve, reject); },
        };
        return query;
      },
    },
  });
  return writes;
}

test('anonymous callers cannot save a note, even with malformed input', async () => {
  fixtures.setContext(null);
  assert.equal((await POST(request(null))).status, 401);
});

test('SAT and ACT saves use the signed-in owner and derive the question type server-side', async () => {
  for (const testType of ['sat', 'act']) {
    const writes = signedIn({ testType });
    const response = await POST(request({ questionId, body: '  My note  ', user_id: 'another-student', test_type: 'wrong' }));
    assert.equal(response.status, 200);
    assert.deepEqual(writes, [{ row: { user_id: 'note-owner', question_id: questionId, body: 'My note', test_type: testType } }]);
    assert.deepEqual(await response.json(), { ok: true, data: { note: { body: 'My note', updatedAt: '2026-10-27T22:00:00Z' } } });
  }
});

test('clearing a note deletes only the current owner/question pair', async () => {
  const writes = signedIn();
  const response = await POST(request({ questionId, body: '  ' }));
  assert.deepEqual(writes, [{ filters: [['user_id', 'note-owner'], ['question_id', questionId]] }]);
  assert.deepEqual(await response.json(), { ok: true, data: { note: null } });
});

test('cross-origin, non-JSON, malformed, and oversized notes are rejected without a write', async () => {
  const writes = signedIn();
  assert.equal((await POST(request(undefined, { origin: 'https://another-site.test' }))).status, 403);
  assert.equal((await POST(request(undefined, { 'content-type': 'text/plain' }))).status, 415);
  for (const body of [null, { questionId: 'invalid', body: 'text' }, { questionId, body: 123 }, { questionId, body: 'x'.repeat(10_001) }]) {
    assert.equal((await POST(request(body))).status, 400);
  }
  assert.equal((await POST(new Request('https://app.studyworksprep.com/api/practice/error-notes', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: '{',
  }))).status, 400);
  assert.deepEqual(writes, []);
});

test('database errors return a failure response for the editor to display', async () => {
  signedIn({ error: { message: 'Save unavailable' } });
  const response = await POST(request());
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { ok: false, error: 'Could not save note: Save unavailable' });
});
