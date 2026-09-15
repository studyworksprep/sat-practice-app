// Unit tests for the intake helpers (docs/student-onboarding-and-plan-
// redesign-2026-09.md §3, §5.2, §5.4): row parsing, the mode mapping,
// the self-rating prior, the wizard step ladder, and login routing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_INTAKE,
  deriveMode,
  deriveWizardStep,
  parseIntakeRow,
  parseSelfRating,
  parseStudyDays,
  selfRatingToPrior,
  shouldRouteToWelcome,
} from './intake.ts';

const FULL_RATING = { H: 3, P: 2, Q: 4, S: 1, INI: 5, CAS: 3, EOI: 3, SEC: 2 };

function intake(over) {
  return {
    ...EMPTY_INTAKE,
    prepLevel: 'none',
    intent: 'guide_me',
    weeklyHours: 5,
    studyDays: [1, 2, 3, 4, 5],
    selfRating: FULL_RATING,
    ...over,
  };
}

// ── parsing ──────────────────────────────────────────────────────

test('parseIntakeRow: null row → empty state; bad enums drop to null', () => {
  assert.deepEqual(parseIntakeRow(null), EMPTY_INTAKE);
  const st = parseIntakeRow({
    prep_level: 'lots', intent: 'guide_me', targets: 'nope', weekly_hours: 99,
    study_days: [7, 1, 1, 'x'], self_rating: { H: 3 }, completed_at: null, skipped_at: null,
  });
  assert.equal(st.prepLevel, null);
  assert.equal(st.intent, 'guide_me');
  assert.deepEqual(st.targets, []);
  assert.equal(st.weeklyHours, null);
  assert.deepEqual(st.studyDays, [1]);
  assert.equal(st.selfRating, null, 'partial rating is not a rating');
});

test('parseStudyDays: dedupes, sorts, rejects empty', () => {
  assert.deepEqual(parseStudyDays([6, 0, 6, 2]), [0, 2, 6]);
  assert.equal(parseStudyDays([]), null);
  assert.equal(parseStudyDays(null), null);
});

test('parseSelfRating: requires all eight domains at 1–5', () => {
  assert.deepEqual(parseSelfRating(FULL_RATING), FULL_RATING);
  assert.equal(parseSelfRating({ ...FULL_RATING, H: 6 }), null);
  assert.equal(parseSelfRating({ ...FULL_RATING, SEC: undefined }), null);
});

// ── mode + prior ─────────────────────────────────────────────────

test('deriveMode: own targets → self_directed regardless of prep', () => {
  assert.equal(deriveMode('none', 'own_targets'), 'self_directed');
  assert.equal(deriveMode('a_lot', 'own_targets'), 'self_directed');
});

test('deriveMode: none/some → foundations; a_lot → targeted; some+evidence → targeted', () => {
  assert.equal(deriveMode('none', 'guide_me'), 'foundations');
  assert.equal(deriveMode('some', 'guide_me'), 'foundations');
  assert.equal(deriveMode('some', 'guide_me', true), 'targeted');
  assert.equal(deriveMode('a_lot', 'guide_me'), 'targeted');
});

test('selfRatingToPrior: 1 → 0.25, 3 → 0.5, 5 → 0.75, clamped', () => {
  assert.equal(selfRatingToPrior(1), 0.25);
  assert.equal(selfRatingToPrior(3), 0.5);
  assert.equal(selfRatingToPrior(5), 0.75);
  assert.equal(selfRatingToPrior(9), 0.75);
});

// ── step ladder ──────────────────────────────────────────────────

test('deriveWizardStep walks the ladder as data fills in', () => {
  const goal = 1300;
  const testDate = '2026-12-05';
  assert.equal(deriveWizardStep({ goal: null, testDate, intake: EMPTY_INTAKE, hasDraft: false }), 'situation');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ prepLevel: null }), hasDraft: false }), 'situation');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ weeklyHours: null }), hasDraft: false }), 'availability');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ selfRating: null }), hasDraft: false }), 'assess');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake(), hasDraft: false }), 'build');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake(), hasDraft: true }), 'preview');
});

test('targets step only for own_targets, only until targets exist', () => {
  const args = { goal: 1300, testDate: '2026-12-05', hasDraft: false };
  assert.equal(deriveWizardStep({ ...args, intake: intake({ intent: 'own_targets', targets: [] }) }), 'targets');
  assert.equal(
    deriveWizardStep({ ...args, intake: intake({ intent: 'own_targets', targets: [{ domainCode: 'H', skillCode: 'H.A.' }] }) }),
    'build',
  );
  assert.equal(deriveWizardStep({ ...args, intake: intake({ intent: 'guide_me', targets: [] }) }), 'build');
});

test('?step= override revisits earlier steps but never jumps ahead', () => {
  const args = { goal: 1300, testDate: '2026-12-05', intake: intake(), hasDraft: true };
  assert.equal(deriveWizardStep({ ...args, override: 'situation' }), 'situation');
  assert.equal(deriveWizardStep({ ...args, override: 'assess' }), 'assess');
  assert.equal(deriveWizardStep({ ...args, override: 'targets' }), 'preview', 'no targets step for guide_me');
  assert.equal(deriveWizardStep({ ...args, hasDraft: false, override: 'preview' }), 'build', 'cannot jump ahead');
  assert.equal(deriveWizardStep({ ...args, override: 'bogus' }), 'preview');
});

// ── routing ──────────────────────────────────────────────────────

test('shouldRouteToWelcome: only when no plan and intake neither done nor set aside', () => {
  assert.equal(shouldRouteToWelcome({ hasActivePlan: false, intake: EMPTY_INTAKE }), true);
  assert.equal(shouldRouteToWelcome({ hasActivePlan: true, intake: EMPTY_INTAKE }), false);
  assert.equal(shouldRouteToWelcome({ hasActivePlan: false, intake: intake({ completedAt: '2026-09-15T00:00:00Z' }) }), false);
  assert.equal(shouldRouteToWelcome({ hasActivePlan: false, intake: intake({ skippedAt: '2026-09-15T00:00:00Z' }) }), false);
});
