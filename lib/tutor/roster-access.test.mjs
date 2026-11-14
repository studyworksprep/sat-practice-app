// Roster access badges. Run with `node --test lib/tutor/roster-access.test.mjs`.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rosterAccessBadge } from './roster-access.ts';

const row = (access, subscription_status = null, trial_end = null) => ({ access, subscription_status, trial_end });

test('sponsored, paying and granted students get no badge', () => {
  for (const access of ['sponsored', 'subscribed', 'granted']) {
    assert.equal(rosterAccessBadge(row(access, 'active')), null, access);
  }
  assert.equal(rosterAccessBadge(null), null);
});

test('a student who never subscribed needs a subscription', () => {
  const badge = rosterAccessBadge(row('none'));
  assert.equal(badge.tone, 'warn');
  assert.equal(badge.label, 'Needs a subscription');
  assert.match(badge.title, /can’t open practice, lessons or assignments/);
});

test('a failed payment is called out separately', () => {
  for (const status of ['past_due', 'unpaid']) {
    assert.equal(rosterAccessBadge(row('none', status)).label, 'Payment failed', status);
  }
  assert.equal(rosterAccessBadge(row('none', 'canceled')).label, 'Needs a subscription');
});

test('a trial shows when it ends', () => {
  const badge = rosterAccessBadge(row('trial', 'trialing', '2026-11-20T15:00:00Z'));
  assert.equal(badge.tone, 'info');
  assert.equal(badge.label, 'Trial until Nov 20');
  assert.equal(rosterAccessBadge(row('trial', 'trialing', null)).label, 'On free trial');
});
