// Login setup email (admin user page → "Send login setup email"). Run
// with `node --test lib/email/loginSetup.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLACEHOLDER_EMAIL_SUFFIX,
  buildLoginSetupUrl,
  isPlaceholderEmail,
  renderLoginSetupEmail,
} from './loginSetup.ts';

test('isPlaceholderEmail recognizes the provisioning placeholder and nothing else', () => {
  assert.equal(isPlaceholderEmail(`lw-1234${PLACEHOLDER_EMAIL_SUFFIX}`), true);
  assert.equal(isPlaceholderEmail(` LW-1234@Provisioned.Studyworks.Local `), true);
  assert.equal(isPlaceholderEmail('student@example.com'), false);
  assert.equal(isPlaceholderEmail('provisioned.studyworks.local@example.com'), false);
  assert.equal(isPlaceholderEmail(null), false);
  assert.equal(isPlaceholderEmail(undefined), false);
});

test('buildLoginSetupUrl targets the recovery interstitial with an encoded token', () => {
  const url = buildLoginSetupUrl('https://studyworks.io/', 'abc+def/ghi=');
  assert.equal(
    url,
    'https://studyworks.io/auth/confirm?token_hash=abc%2Bdef%2Fghi%3D&type=recovery&next=%2Fauth%2Fupdate-password',
  );
  const parsed = new URL(url);
  assert.equal(parsed.pathname, '/auth/confirm');
  assert.equal(parsed.searchParams.get('token_hash'), 'abc+def/ghi=');
  assert.equal(parsed.searchParams.get('type'), 'recovery');
  // /auth/confirm only honors same-origin paths for `next`.
  assert.equal(parsed.searchParams.get('next'), '/auth/update-password');
});

test('renderLoginSetupEmail carries the link, the login email and the fallback, escaped', () => {
  const { subject, html, text } = renderLoginSetupEmail({
    to: 'stu@example.com',
    firstName: '<Stu>',
    setupUrl: 'https://studyworks.io/auth/confirm?token_hash=t%2B1&type=recovery&next=%2Fauth%2Fupdate-password',
    loginUrl: 'https://studyworks.io/login',
  });
  assert.equal(subject, 'Set your Studyworks password');
  assert.ok(html.includes('Hi &lt;Stu&gt;,'));
  assert.ok(!html.includes('<Stu>'));
  assert.ok(html.includes('href="https://studyworks.io/auth/confirm?token_hash=t%2B1&amp;type=recovery&amp;next=%2Fauth%2Fupdate-password"'));
  assert.ok(html.includes('<strong>stu@example.com</strong>'));
  assert.ok(html.includes('Forgot password?'));
  assert.ok(text.includes('Set my password: https://studyworks.io/auth/confirm?token_hash=t%2B1&type=recovery&next=%2Fauth%2Fupdate-password'));
  assert.ok(text.includes('Your login email is stu@example.com.'));
  assert.ok(text.includes('https://studyworks.io/login'));
});

test('renderLoginSetupEmail greets without a name when there is none', () => {
  const { html, text } = renderLoginSetupEmail({
    to: 'stu@example.com',
    firstName: '  ',
    setupUrl: 'https://studyworks.io/auth/confirm?token_hash=t',
    loginUrl: 'https://studyworks.io/login',
  });
  assert.ok(html.includes('Hi, a Studyworks practice account'));
  assert.ok(text.startsWith('Set your Studyworks password\n\nHi, a Studyworks'));
});
