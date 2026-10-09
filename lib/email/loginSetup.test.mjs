// Login setup email (admin user page → "Send login setup email"). Run
// with `node --test lib/email/loginSetup.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  LOGIN_SETUP_LINK_TTL_MS,
  PLACEHOLDER_EMAIL_SUFFIX,
  buildLoginSetupUrl,
  isPlaceholderEmail,
  newLoginSetupNonce,
  readLoginSetupToken,
  renderLoginSetupEmail,
  signLoginSetupToken,
} from './loginSetup.ts';

const SECRET = 'test-secret-not-for-production';
const FIELDS = { userId: '11111111-2222-4333-8444-555555555555', email: 'Stu@Example.com', nonce: 'abc123' };

test('isPlaceholderEmail recognizes the provisioning placeholder and nothing else', () => {
  assert.equal(isPlaceholderEmail(`lw-1234${PLACEHOLDER_EMAIL_SUFFIX}`), true);
  assert.equal(isPlaceholderEmail(` LW-1234@Provisioned.Studyworks.Local `), true);
  assert.equal(isPlaceholderEmail('student@example.com'), false);
  assert.equal(isPlaceholderEmail('provisioned.studyworks.local@example.com'), false);
  assert.equal(isPlaceholderEmail(null), false);
  assert.equal(isPlaceholderEmail(undefined), false);
});

test('the setup link lasts 48 hours', () => {
  assert.equal(LOGIN_SETUP_LINK_TTL_MS, 48 * 60 * 60 * 1000);
});

test('signLoginSetupToken round-trips through readLoginSetupToken', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const token = signLoginSetupToken(FIELDS, SECRET, now);
  const read = readLoginSetupToken(token, SECRET, now + 1000);
  assert.ok(read);
  assert.equal(read.u, FIELDS.userId);
  assert.equal(read.e, 'stu@example.com', 'email is normalized to lowercase');
  assert.equal(read.n, FIELDS.nonce);
  assert.equal(read.iat, now);
  assert.equal(read.exp, now + LOGIN_SETUP_LINK_TTL_MS);
});

test('readLoginSetupToken accepts up to 48 hours and refuses after', () => {
  const now = Date.parse('2026-10-08T12:00:00Z');
  const token = signLoginSetupToken(FIELDS, SECRET, now);
  assert.ok(readLoginSetupToken(token, SECRET, now + LOGIN_SETUP_LINK_TTL_MS - 1));
  assert.equal(readLoginSetupToken(token, SECRET, now + LOGIN_SETUP_LINK_TTL_MS), null);
  assert.equal(readLoginSetupToken(token, SECRET, now + 3 * 24 * 60 * 60 * 1000), null);
});

test('readLoginSetupToken refuses tampering, wrong secrets, and junk', () => {
  const now = Date.now();
  const token = signLoginSetupToken(FIELDS, SECRET, now);
  const [body, sig] = token.split('.');
  // Payload swapped for another user's, signature kept.
  const other = signLoginSetupToken({ ...FIELDS, userId: '99999999-2222-4333-8444-555555555555' }, SECRET, now).split('.')[0];
  assert.equal(readLoginSetupToken(`${other}.${sig}`, SECRET, now), null);
  // Signature altered.
  const flipped = (sig[0] === 'A' ? 'B' : 'A') + sig.slice(1);
  assert.equal(readLoginSetupToken(`${body}.${flipped}`, SECRET, now), null);
  // Wrong secret, missing secret, malformed input.
  assert.equal(readLoginSetupToken(token, 'another-secret', now), null);
  assert.equal(readLoginSetupToken(token, '', now), null);
  assert.equal(readLoginSetupToken('', SECRET, now), null);
  assert.equal(readLoginSetupToken('not.a.token', SECRET, now), null);
  assert.equal(readLoginSetupToken(null, SECRET, now), null);
  assert.equal(readLoginSetupToken(undefined, SECRET, now), null);
  // Valid signature over a payload that is not a setup token.
  assert.throws(() => signLoginSetupToken(FIELDS, '', now));
});

test('newLoginSetupNonce is random and URL-safe', () => {
  const a = newLoginSetupNonce();
  const b = newLoginSetupNonce();
  assert.notEqual(a, b);
  assert.match(a, /^[0-9a-f]{32}$/);
});

test('buildLoginSetupUrl targets the setup interstitial with an encoded token', () => {
  const url = buildLoginSetupUrl('https://studyworks.io/', 'abc+def/ghi=.sig');
  assert.equal(url, 'https://studyworks.io/auth/setup?token=abc%2Bdef%2Fghi%3D.sig');
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/auth/setup');
  assert.equal(parsed.searchParams.get('token'), 'abc+def/ghi=.sig');
});

test('renderLoginSetupEmail carries the link, the login email and the fallback, escaped', () => {
  const { subject, html, text } = renderLoginSetupEmail({
    to: 'stu@example.com',
    firstName: '<Stu>',
    setupUrl: 'https://studyworks.io/auth/setup?token=t%2B1.s%26g',
    loginUrl: 'https://studyworks.io/login',
  });
  assert.equal(subject, 'Set your Studyworks password');
  assert.ok(html.includes('Hi &lt;Stu&gt;,'));
  assert.ok(!html.includes('<Stu>'));
  assert.ok(html.includes('href="https://studyworks.io/auth/setup?token=t%2B1.s%26g"'));
  assert.ok(html.includes('<strong>stu@example.com</strong>'));
  assert.ok(html.includes('Forgot password?'));
  assert.ok(html.includes('works for 48 hours'));
  assert.ok(text.includes('Set my password: https://studyworks.io/auth/setup?token=t%2B1.s%26g'));
  assert.ok(text.includes('The link works for 48 hours.'));
  assert.ok(text.includes('Your login email is stu@example.com.'));
  assert.ok(text.includes('https://studyworks.io/login'));
});

test('renderLoginSetupEmail greets without a name when there is none', () => {
  const { html, text } = renderLoginSetupEmail({
    to: 'stu@example.com',
    firstName: '  ',
    setupUrl: 'https://studyworks.io/auth/setup?token=t',
    loginUrl: 'https://studyworks.io/login',
  });
  assert.ok(html.includes('Hi, a Studyworks practice account'));
  assert.ok(text.startsWith('Set your Studyworks password\n\nHi, a Studyworks'));
});
