import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { NextRequest } from 'next/server.js';
import { createServerClient } from '@supabase/ssr';

const require = createRequire(import.meta.url);
const source = (await readFile(new URL('../../proxy.js', import.meta.url), 'utf8'))
  .replace("'next/server'", JSON.stringify(pathToFileURL(require.resolve('next/server.js')).href))
  .replace("'@supabase/ssr'", JSON.stringify(pathToFileURL(require.resolve('@supabase/ssr')).href))
  .replace("'./lib/flags'", JSON.stringify(new URL('../flags.ts', import.meta.url).href));
const { proxy } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

const SUPABASE_URL = 'https://session-test.supabase.co';
const COOKIE_NAME = 'sb-session-test-auth-token';
const USER_ID = 'b7f640f7-c662-47d6-a877-cc2a874810ab';
const KEY = 'test-publishable-key';

function accessToken(expiresAt) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, exp: expiresAt })}.test-signature`;
}

function staleSessionCookie(chunks = 1) {
  const expiresAt = Math.floor(Date.now() / 1000) - 3600;
  const encoded = 'base64-' + Buffer.from(JSON.stringify({
    access_token: accessToken(expiresAt),
    refresh_token: 'stale-refresh-token',
    expires_at: expiresAt,
    token_type: 'bearer',
    user: { id: USER_ID },
  })).toString('base64url');
  if (chunks === 1) return `${COOKIE_NAME}=${encoded}`;
  const size = Math.ceil(encoded.length / chunks);
  return Array.from({ length: chunks }, (_, i) =>
    `${COOKIE_NAME}.${i}=${encoded.slice(i * size, (i + 1) * size)}`,
  ).join('; ');
}

async function withAuthServer({ invalidRefresh = false, role = 'student', demo = false }, run) {
  const previousFetch = globalThis.fetch;
  const previousConsoleError = console.error;
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  process.env.NEXT_PUBLIC_SUPABASE_URL = SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = KEY;
  const calls = [];
  const authErrors = [];
  if (invalidRefresh) {
    // auth-js logs the rejected refresh before returning its structured error.
    console.error = (error) => authErrors.push(error);
  }
  const user = { id: USER_ID, app_metadata: { is_demo: demo } };
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    assert.equal(url.origin, SUPABASE_URL, 'the test must never contact a real server');
    calls.push({ path: url.pathname, authorization: new Headers(options?.headers).get('authorization') });
    let data;
    let status = 200;
    if (url.pathname === '/auth/v1/token') {
      assert.equal(url.searchParams.get('grant_type'), 'refresh_token');
      assert.equal(JSON.parse(options.body).refresh_token, 'stale-refresh-token');
      if (invalidRefresh) {
        status = 400;
        data = { code: 'refresh_token_not_found', message: 'Invalid Refresh Token: Refresh Token Not Found' };
      } else {
        data = {
          access_token: accessToken(Math.floor(Date.now() / 1000) + 3600),
          refresh_token: 'fresh-refresh-token',
          expires_in: 3600,
          token_type: 'bearer',
          user,
        };
      }
    } else if (url.pathname === '/auth/v1/user') {
      data = user;
    } else if (url.pathname === '/rest/v1/profiles') {
      data = [{ role, subscription_exempt: false }];
    } else if (url.pathname === '/rest/v1/feature_flags' || url.pathname === '/rest/v1/subscriptions') {
      data = [];
    } else {
      assert.fail(`Unexpected request: ${url.pathname}`);
    }
    return new Response(JSON.stringify(data), {
      status,
      headers: { 'content-type': 'application/json', 'x-supabase-api-version': '2024-01-01' },
    });
  };
  try {
    await run(calls);
    if (invalidRefresh) {
      assert.ok(authErrors.length > 0);
      assert.ok(authErrors.every((error) => error?.code === 'refresh_token_not_found'));
    }
  } finally {
    globalThis.fetch = previousFetch;
    console.error = previousConsoleError;
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
}

function request(path, chunks = 1, method = 'GET') {
  return new NextRequest(`https://app.example${path}`, {
    method,
    headers: { cookie: `${staleSessionCookie(chunks)}; preferences=keep` },
  });
}

function assertFreshResponseCookie(response) {
  const cookie = response.cookies.get(COOKIE_NAME);
  assert.ok(cookie, 'the browser must receive the refreshed session');
  const session = JSON.parse(Buffer.from(cookie.value.slice('base64-'.length), 'base64url').toString());
  assert.equal(session.refresh_token, 'fresh-refresh-token');
  assert.match(response.headers.get('cache-control'), /no-store/);
}

test('invalid refresh token is cleared before page rendering and in the browser', async () => {
  await withAuthServer({ invalidRefresh: true }, async (calls) => {
    const req = request('/dashboard');
    const response = await proxy(req);
    assert.equal(response.status, 200);
    assert.equal(req.cookies.get(COOKIE_NAME), undefined);
    assert.equal(req.cookies.get('preferences')?.value, 'keep');
    assert.equal(response.cookies.get(COOKIE_NAME)?.maxAge, 0);
    assert.equal(response.headers.get('x-middleware-request-cookie'), 'preferences=keep');

    // Model the Server Component's next auth read using the forwarded cookies.
    const downstream = createServerClient(SUPABASE_URL, KEY, {
      cookies: { getAll: () => req.cookies.getAll(), setAll() {} },
    });
    const { data, error } = await downstream.auth.getUser();
    assert.equal(data.user, null);
    assert.equal(error?.name, 'AuthSessionMissingError');
    assert.equal(calls.filter((c) => c.path === '/auth/v1/token').length, 1);
  });
});

test('invalid sessions clear every cookie chunk, including chunks past the legacy five-chunk limit', async () => {
  await withAuthServer({ invalidRefresh: true }, async (calls) => {
    const req = request('/login', 7);
    const response = await proxy(req);
    for (let i = 0; i < 7; i++) {
      assert.equal(req.cookies.get(`${COOKIE_NAME}.${i}`), undefined);
      assert.equal(response.cookies.get(`${COOKIE_NAME}.${i}`)?.maxAge, 0);
    }
    assert.equal(calls.filter((c) => c.path === '/auth/v1/token').length, 1);
  });
});

test('successful refresh reaches both the browser and downstream auth reads', async () => {
  await withAuthServer({}, async (calls) => {
    const req = request('/account');
    const response = await proxy(req);
    assertFreshResponseCookie(response);
    assert.equal(response.headers.get('x-middleware-request-cookie'), req.headers.get('cookie'));
    const downstream = createServerClient(SUPABASE_URL, KEY, {
      cookies: { getAll: () => req.cookies.getAll(), setAll() {} },
    });
    const { data, error } = await downstream.auth.getUser();
    assert.equal(error, null);
    assert.equal(data.user.id, USER_ID);
    assert.equal(calls.filter((c) => c.path === '/auth/v1/token').length, 1);
    assert.equal(response.headers.get('x-middleware-request-x-user-id'), USER_ID);
  });
});

for (const { path, role, destination } of [
  { path: '/dashboard', role: 'practice', destination: '/practice/start' },
  { path: '/tutor/dashboard', role: 'teacher', destination: '/subscribe' },
]) {
  test(`refreshed cookies survive the redirect to ${destination}`, async () => {
    await withAuthServer({ role }, async () => {
      const response = await proxy(request(path));
      assert.equal(response.status, 307);
      assert.equal(new URL(response.headers.get('location')).pathname, destination);
      assertFreshResponseCookie(response);
    });
  });
}

test('demo-write rejection preserves refreshed cookies and the write restriction', async () => {
  await withAuthServer({ demo: true }, async () => {
    const response = await proxy(request('/api/practice/example', 1, 'POST'));
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: 'Demo accounts are read-only' });
    assertFreshResponseCookie(response);
  });
});
