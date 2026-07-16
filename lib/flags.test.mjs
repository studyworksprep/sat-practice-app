// Rollout-policy tests for the sidebar_shell stage resolver.
// The IO half (getFlag) lives in lib/flags-server.ts and is not
// testable here (next/headers); this covers the policy matrix that
// decides who sees which chrome.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSidebarStage } from './flags.ts';

test('off / missing / unknown values disable the sidebar for every role', () => {
  for (const value of ['off', null, undefined, '', 'on', 'true', 'STAFF', 'garbage']) {
    for (const role of ['student', 'teacher', 'manager', 'admin', 'practice']) {
      assert.equal(
        resolveSidebarStage(value, role),
        false,
        `value=${String(value)} role=${role} should be off`,
      );
    }
  }
});

test('staff stage enables exactly teacher / manager / admin', () => {
  for (const role of ['teacher', 'manager', 'admin']) {
    assert.equal(resolveSidebarStage('staff', role), true, role);
  }
  for (const role of ['student', 'practice', '', null, undefined]) {
    assert.equal(resolveSidebarStage('staff', role), false, String(role));
  }
});

test('all stage enables every role', () => {
  for (const role of ['student', 'teacher', 'manager', 'admin', 'practice']) {
    assert.equal(resolveSidebarStage('all', role), true, role);
  }
});
