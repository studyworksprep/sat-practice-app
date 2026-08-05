// The auto-verify rule decides whether contributed data reaches the
// calibration pipeline without a person reading it, so its failure modes
// are worth pinning down individually. Every one of these tests exists
// because the loose answer would be the expensive one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  tallyRecord,
  acceptanceRate,
  evaluateAutoVerify,
  AUTO_VERIFY_MIN_PROMOTED,
  EMPTY_RECORD,
} from './contributor-trust.ts';

const rows = (...statuses) => statuses.map((status) => ({ status }));

const trusted = tallyRecord(rows('promoted', 'promoted', 'promoted', 'verified'));
const artifact = { hasArtifact: true, validationFlags: [] };

test('tallyRecord counts each status', () => {
  const record = tallyRecord(rows('pending', 'pending', 'verified', 'promoted', 'rejected'));
  assert.deepEqual(record, { total: 5, pending: 2, verified: 1, promoted: 1, rejected: 1 });
});

test('tallyRecord on nothing is the empty record', () => {
  assert.deepEqual(tallyRecord([]), EMPTY_RECORD);
});

test('acceptanceRate is null until something has been decided', () => {
  // "0%" would read as a bad record when it means "no record yet".
  assert.equal(acceptanceRate(tallyRecord(rows('pending', 'pending'))), null);
  assert.equal(acceptanceRate(tallyRecord(rows('verified'))), null);
  assert.equal(acceptanceRate(tallyRecord(rows('promoted', 'rejected'))), 50);
  assert.equal(acceptanceRate(tallyRecord(rows('promoted', 'promoted', 'rejected'))), 67);
});

test('a trusted contributor with an artifact and no flags auto-verifies', () => {
  const verdict = evaluateAutoVerify({ ...artifact, record: trusted });
  assert.equal(verdict.autoVerify, true);
  assert.equal(verdict.reason, null);
});

test('no artifact means no auto-verification, however good the record', () => {
  // A hand-entered grid is one person's word. The rule has nothing to
  // be confident about.
  const verdict = evaluateAutoVerify({ hasArtifact: false, validationFlags: [], record: trusted });
  assert.equal(verdict.autoVerify, false);
  assert.match(verdict.reason, /no stored report/);
});

test('a conversion conflict always reaches a person', () => {
  const verdict = evaluateAutoVerify({
    hasArtifact: true,
    validationFlags: [{ code: 'conversion_conflict', existing_scaled: 600, submitted_scaled: 640 }],
    record: trusted,
  });
  assert.equal(verdict.autoVerify, false);
  assert.match(verdict.reason, /needs a person/);
});

test('a routing inconsistency also reaches a person', () => {
  const verdict = evaluateAutoVerify({
    hasArtifact: true,
    validationFlags: [{ code: 'route_inconsistent' }],
    record: trusted,
  });
  assert.equal(verdict.autoVerify, false);
});

test('a skipped routing check is not severe and does not block', () => {
  // It says the TEST is missing a threshold, not that the submission is
  // suspect — blocking on it would punish the contributor for our data.
  const verdict = evaluateAutoVerify({
    hasArtifact: true,
    validationFlags: [{ code: 'route_check_skipped', section: 'math' }],
    record: trusted,
  });
  assert.equal(verdict.autoVerify, true);
});

test('one past rejection returns a contributor to manual review', () => {
  const record = tallyRecord(rows('promoted', 'promoted', 'promoted', 'promoted', 'rejected'));
  const verdict = evaluateAutoVerify({ ...artifact, record });
  assert.equal(verdict.autoVerify, false);
  assert.match(verdict.reason, /rejected before/);
});

test('the promoted threshold is a floor, not a ceiling', () => {
  const justUnder = tallyRecord(rows(...Array(AUTO_VERIFY_MIN_PROMOTED - 1).fill('promoted')));
  assert.equal(evaluateAutoVerify({ ...artifact, record: justUnder }).autoVerify, false);

  const exactly = tallyRecord(rows(...Array(AUTO_VERIFY_MIN_PROMOTED).fill('promoted')));
  assert.equal(evaluateAutoVerify({ ...artifact, record: exactly }).autoVerify, true);
});

test('a brand-new contributor never auto-verifies', () => {
  const verdict = evaluateAutoVerify({ ...artifact, record: EMPTY_RECORD });
  assert.equal(verdict.autoVerify, false);
  assert.match(verdict.reason, /0 promoted submissions/);
});

test('verified-but-not-yet-promoted does not count toward the threshold', () => {
  // Verification is a reviewer saying "this looks right"; promotion is
  // the data actually holding up. Only the latter is evidence.
  const record = tallyRecord(rows('verified', 'verified', 'verified', 'verified'));
  assert.equal(evaluateAutoVerify({ ...artifact, record }).autoVerify, false);
});

test('a malformed flag entry is not mistaken for a severe one', () => {
  const verdict = evaluateAutoVerify({
    hasArtifact: true,
    validationFlags: [null, undefined, 'conversion_conflict', { nope: 1 }],
    record: trusted,
  });
  assert.equal(verdict.autoVerify, true, 'severity comes from .code, not from a stray string');
});
