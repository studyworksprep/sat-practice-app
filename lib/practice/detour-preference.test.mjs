import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDetoursEnabled } from './detour-preference.mjs';

test('an unset preference defaults off for a student with a tutor', () => {
  assert.equal(
    resolveDetoursEnabled({ preference: null, hasAssignedTutor: true }),
    false,
  );
});

test('an unset preference defaults on for a self-guided student', () => {
  assert.equal(
    resolveDetoursEnabled({ preference: null, hasAssignedTutor: false }),
    true,
  );
});

test('an explicit preference wins over the derived default', () => {
  assert.equal(
    resolveDetoursEnabled({ preference: true, hasAssignedTutor: true }),
    true,
  );
  assert.equal(
    resolveDetoursEnabled({ preference: false, hasAssignedTutor: false }),
    false,
  );
});

test('missing input resolves to detours on — the pre-toggle behavior', () => {
  assert.equal(resolveDetoursEnabled(), true);
  assert.equal(resolveDetoursEnabled({}), true);
});

test('a non-boolean preference is treated as unset', () => {
  // Guards the tri-state read: `undefined` from a partial select, or a
  // stray string from FormData, must not read as "explicitly on".
  assert.equal(
    resolveDetoursEnabled({ preference: undefined, hasAssignedTutor: true }),
    false,
  );
  assert.equal(
    resolveDetoursEnabled({ preference: 'false', hasAssignedTutor: false }),
    true,
  );
});
