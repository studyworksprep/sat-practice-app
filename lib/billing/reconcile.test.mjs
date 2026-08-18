// Unit tests for subscription drift detection.
//
// This is the safety net under the Stripe webhook: if diffSubscription
// under-reports, a lapsed subscription keeps its access forever, and if
// it over-reports, the cron rewrites healthy rows every night and buries
// the real signal. Both directions matter, so both are tested.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSubscription, isAccessLoss, reconcileSubscriptions } from './reconcile.ts';

const SECOND = 1000;
const trialEndUnix = 1786636598; // 2026-08-13T15:56:38Z — Isabella's signup instant
const iso = (unix) => new Date(unix * SECOND).toISOString();

function row(overrides = {}) {
  return {
    id: 'row-1',
    user_id: 'user-1',
    status: 'active',
    plan: 'student',
    stripe_customer_id: 'cus_1',
    stripe_subscription_id: 'sub_1',
    current_period_start: iso(trialEndUnix),
    current_period_end: iso(trialEndUnix + 2592000),
    trial_end: iso(trialEndUnix),
    cancel_at_period_end: false,
    ...overrides,
  };
}

function stripeSub(overrides = {}) {
  return {
    id: 'sub_1',
    status: 'active',
    trial_end: trialEndUnix,
    cancel_at_period_end: false,
    current_period_start: trialEndUnix,
    current_period_end: trialEndUnix + 2592000,
    metadata: { plan: 'student' },
    ...overrides,
  };
}

test('a row that matches Stripe reports no drift', () => {
  const { drifts, corrected } = diffSubscription(row(), stripeSub());
  assert.deepEqual(drifts, []);
  assert.deepEqual(corrected, {});
});

test('sub-second precision in the database is not drift', () => {
  // The old handler wrote `new Date().toISOString()` for period start,
  // which carries milliseconds Stripe never sends.
  // Derived from the same instant so the literal can never drift from it.
  const stored = row({ current_period_start: iso(trialEndUnix).replace('.000Z', '.030Z') });
  const { drifts } = diffSubscription(stored, stripeSub());
  assert.deepEqual(drifts, []);
});

test("Isabella's row: recorded active with NULL trial data while Stripe says trialing", () => {
  const stored = row({ status: 'active', trial_end: null, current_period_end: null });
  const live = stripeSub({ status: 'trialing' });

  const { drifts, corrected } = diffSubscription(stored, live);
  const fields = drifts.map((d) => d.field).sort();

  assert.deepEqual(fields, ['current_period_end', 'status', 'trial_end']);
  assert.equal(corrected.status, 'trialing');
  assert.equal(corrected.trial_end, iso(trialEndUnix));
  assert.ok(corrected.updated_at, 'a correction stamps updated_at');
});

test('reconciliation never writes last_stripe_event_at', () => {
  // Stamping it here would let the cron suppress a webhook that simply
  // arrived late, which is the opposite of what this job is for.
  const stored = row({ status: 'past_due' });
  const { corrected } = diffSubscription(stored, stripeSub({ status: 'active' }));
  assert.ok(!('last_stripe_event_at' in corrected));
});

test('period dates are read from items[] on the basil API shape', () => {
  const live = {
    id: 'sub_1',
    status: 'active',
    trial_end: trialEndUnix,
    cancel_at_period_end: false,
    metadata: { plan: 'student' },
    items: { data: [{ current_period_start: trialEndUnix, current_period_end: trialEndUnix + 2592000 }] },
  };
  const { drifts } = diffSubscription(row(), live);
  assert.deepEqual(drifts, [], 'item-level dates should match the stored row');
});

test('a canceled-in-Stripe subscription is detected as drift', () => {
  const { drifts, corrected } = diffSubscription(row({ status: 'active' }), stripeSub({ status: 'canceled' }));
  assert.equal(corrected.status, 'canceled');
  assert.ok(drifts.some((d) => d.field === 'status' && d.stored === 'active'));
});

test('unmapped Stripe statuses collapse to a non-access status', () => {
  for (const s of ['incomplete', 'paused', 'something_new']) {
    const { corrected } = diffSubscription(row({ status: 'active' }), stripeSub({ status: s }));
    assert.equal(corrected.status, 'unpaid', `${s} should deny access`);
  }
});

test('cancel_at_period_end drift is caught', () => {
  const { corrected } = diffSubscription(row(), stripeSub({ cancel_at_period_end: true }));
  assert.equal(corrected.cancel_at_period_end, true);
});

test('isAccessLoss only fires when access is actually taken away', () => {
  assert.equal(isAccessLoss('active', 'past_due'), true);
  assert.equal(isAccessLoss('trialing', 'canceled'), true);
  assert.equal(isAccessLoss('trialing', 'active'), false);
  assert.equal(isAccessLoss('past_due', 'canceled'), false);
});

// ── orchestration ──────────────────────────────────────────────────

function fakeStripe(subsById, listByCustomer = {}) {
  return {
    subscriptions: {
      async retrieve(id) {
        if (!(id in subsById)) {
          const err = new Error('No such subscription');
          err.code = 'resource_missing';
          throw err;
        }
        return subsById[id];
      },
      async list({ customer }) {
        return { data: listByCustomer[customer] ?? [] };
      },
    },
  };
}

test('dry run reports drift without writing', async () => {
  const writes = [];
  const db = {
    fetchRows: async () => [row({ status: 'past_due' })],
    applyCorrection: async (id, fields) => writes.push({ id, fields }),
  };

  const summary = await reconcileSubscriptions(db, fakeStripe({ sub_1: stripeSub() }), { dryRun: true });

  assert.equal(writes.length, 0, 'dry run must not write');
  assert.equal(summary.results[0].outcome, 'would_correct');
  assert.equal(summary.corrected, 0);
});

test('a live run applies the correction', async () => {
  const writes = [];
  const db = {
    fetchRows: async () => [row({ status: 'past_due' })],
    applyCorrection: async (id, fields) => writes.push({ id, fields }),
  };

  const summary = await reconcileSubscriptions(db, fakeStripe({ sub_1: stripeSub() }));

  assert.equal(summary.corrected, 1);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].fields.status, 'active');
});

test('a subscription missing from Stripe is canceled and counted as access loss', async () => {
  const writes = [];
  const db = {
    fetchRows: async () => [row({ status: 'active' })],
    applyCorrection: async (id, fields) => writes.push({ id, fields }),
  };

  const summary = await reconcileSubscriptions(db, fakeStripe({}));

  assert.equal(summary.missingInStripe, 1);
  assert.equal(summary.accessLosses, 1);
  assert.equal(writes[0].fields.status, 'canceled');
});

test('a row with no Stripe reference is skipped, not failed', async () => {
  const db = {
    fetchRows: async () => [row({ stripe_subscription_id: null, stripe_customer_id: null })],
    applyCorrection: async () => assert.fail('should not write'),
  };
  const summary = await reconcileSubscriptions(db, fakeStripe({}));
  assert.equal(summary.skipped, 1);
  assert.equal(summary.results[0].outcome, 'skipped_no_stripe_ref');
});

test('a row missing only its subscription id is repaired via the customer', async () => {
  const writes = [];
  const db = {
    fetchRows: async () => [row({ stripe_subscription_id: null, status: 'past_due' })],
    applyCorrection: async (id, fields) => writes.push({ id, fields }),
  };

  const summary = await reconcileSubscriptions(db, fakeStripe({}, { cus_1: [stripeSub()] }));

  assert.equal(summary.corrected, 1);
  assert.equal(writes[0].fields.stripe_subscription_id, 'sub_1');
  assert.equal(writes[0].fields.status, 'active');
});

test('one failing row does not abort the run', async () => {
  const db = {
    fetchRows: async () => [
      row({ id: 'a', user_id: 'u-a', stripe_subscription_id: 'boom' }),
      row({ id: 'b', user_id: 'u-b' }),
    ],
    applyCorrection: async () => {},
  };
  const stripe = {
    subscriptions: {
      async retrieve(id) {
        if (id === 'boom') throw new Error('Stripe is down');
        return stripeSub();
      },
      async list() {
        return { data: [] };
      },
    },
  };

  const summary = await reconcileSubscriptions(db, stripe);

  assert.equal(summary.errors, 1);
  assert.equal(summary.checked, 2);
  assert.equal(summary.results[1].outcome, 'in_sync', 'the second row still ran');
});
