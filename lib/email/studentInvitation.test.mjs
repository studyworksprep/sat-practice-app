// Student invitation email copy. Run with
// `node --test lib/email/studentInvitation.test.mjs`.
//
// The tutor-issued (unsponsored) variant must never promise free
// access — the student subscribes (migration 20261114011641).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderStudentInvitationEmail } from './studentInvitation.ts';

const BASE = { email: 'kid@example.com', code: 'K7P3RXM2', teacherName: 'Pat Tutor', siteUrl: 'https://studyworks.io' };

test('admin-issued invitations default to the sponsored copy', () => {
  const { subject, text, html } = renderStudentInvitationEmail(BASE);
  assert.equal(subject, 'Your Studyworks invitation');
  assert.match(text, /set you up with a Studyworks account/);
  assert.doesNotMatch(text, /subscription/i);
  assert.match(html, /K7P3RXM2/);
});

test('tutor-issued invitations say the student subscribes', () => {
  const { subject, text, html } = renderStudentInvitationEmail({ ...BASE, sponsored: false });
  assert.equal(subject, 'Pat Tutor invited you to Studyworks');
  assert.match(text, /join their roster/);
  assert.match(text, /7-day free trial, then a monthly student subscription/);
  assert.match(html, /monthly student subscription/);
  assert.doesNotMatch(text, /no cost|free access|sponsor/i);
});

test('both variants explain how an existing account redeems the code', () => {
  for (const sponsored of [true, false]) {
    const { text } = renderStudentInvitationEmail({ ...BASE, sponsored });
    assert.match(text, /Already have a Studyworks account\? Log in, open Account/);
    assert.match(text, /Invitation code: K7P3RXM2/);
    assert.match(text, /https:\/\/studyworks\.io\/login/);
  }
});

test('a tutor name cannot break the subject line or the HTML', () => {
  const { subject, html } = renderStudentInvitationEmail({
    ...BASE,
    sponsored: false,
    teacherName: 'Evil\r\nBcc: x@y.z <script>',
  });
  assert.doesNotMatch(subject, /[\r\n]/);
  assert.doesNotMatch(html, /<script>/);
});
