// Unit tests for the intake helpers (docs/student-onboarding-and-plan-
// redesign-2026-09.md §3, §5.2, §5.4): row parsing, the mode mapping,
// the self-rating prior, the wizard step ladder, and login routing.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_INTAKE,
  deriveMode,
  deriveWizardStep,
  questionSteps,
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
    exists: true,
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
  assert.equal(st.exists, true);
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

test('parseSelfRating: requires all eight domains, each 1–5 or null ("not sure")', () => {
  assert.deepEqual(parseSelfRating(FULL_RATING), FULL_RATING);
  assert.deepEqual(parseSelfRating({ ...FULL_RATING, H: null }), { ...FULL_RATING, H: null });
  assert.equal(parseSelfRating({ ...FULL_RATING, H: 6 }), null);
  const { SEC: _drop, ...missing } = FULL_RATING;
  assert.equal(parseSelfRating(missing), null);
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

test('deriveWizardStep walks the ladder one question at a time', () => {
  const goal = 1300;
  const testDate = '2026-12-05';
  assert.equal(deriveWizardStep({ goal: null, testDate, intake: EMPTY_INTAKE, hasDraft: false }), 'welcome', 'no row yet → greeting first');
  assert.equal(deriveWizardStep({ goal, testDate, intake: EMPTY_INTAKE, hasDraft: false }), 'welcome', 'even with an old signup target');
  assert.equal(deriveWizardStep({ goal: null, testDate, intake: intake({ prepLevel: null, intent: null, weeklyHours: null, studyDays: null, selfRating: null }), hasDraft: false }), 'target');
  assert.equal(deriveWizardStep({ goal, testDate: null, intake: intake({ prepLevel: null }), hasDraft: false }), 'test_date');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ prepLevel: null }), hasDraft: false }), 'prep');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ intent: null }), hasDraft: false }), 'intent');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ weeklyHours: null }), hasDraft: false }), 'hours');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ studyDays: null }), hasDraft: false }), 'days');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ selfRating: null }), hasDraft: false }), 'assess');
  assert.equal(deriveWizardStep({ goal, testDate, intake: intake({ selfRating: { ...FULL_RATING, H: null } }), hasDraft: false }), 'build', 'a "not sure" answer still counts as answered');
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
  assert.equal(deriveWizardStep({ ...args, override: 'target' }), 'target');
  assert.equal(deriveWizardStep({ ...args, override: 'assess' }), 'assess');
  assert.equal(deriveWizardStep({ ...args, override: 'targets' }), 'preview', 'no targets step for guide_me');
  assert.equal(deriveWizardStep({ ...args, hasDraft: false, override: 'preview' }), 'build', 'cannot jump ahead');
  assert.equal(deriveWizardStep({ ...args, override: 'bogus' }), 'preview');
});

// ── routing ──────────────────────────────────────────────────────

test('shouldRouteToWelcome: only a self-study student with no plan, no practice history, and intake neither done nor set aside', () => {
  const fresh = { hasActivePlan: false, hasPracticeHistory: false, hasTutor: false };
  assert.equal(shouldRouteToWelcome({ ...fresh, intake: EMPTY_INTAKE }), true);
  assert.equal(shouldRouteToWelcome({ ...fresh, hasActivePlan: true, intake: EMPTY_INTAKE }), false);
  assert.equal(shouldRouteToWelcome({ ...fresh, intake: intake({ completedAt: '2026-09-15T00:00:00Z' }) }), false);
  assert.equal(shouldRouteToWelcome({ ...fresh, intake: intake({ skippedAt: '2026-09-15T00:00:00Z' }) }), false);
  // An existing student (has answered questions) is never routed, even
  // with no plan and no intake row — the wizard is for new signups.
  assert.equal(shouldRouteToWelcome({ ...fresh, hasPracticeHistory: true, intake: EMPTY_INTAKE }), false);
  // A tutor-managed student's work is directed by the tutor — never routed.
  assert.equal(shouldRouteToWelcome({ ...fresh, hasTutor: true, intake: EMPTY_INTAKE }), false);
  // A partially-finished intake still resumes for a new student.
  assert.equal(shouldRouteToWelcome({ ...fresh, intake: intake({ selfRating: null }) }), true);
});

test('questionSteps: targets only for own_targets', () => {
  assert.deepEqual(questionSteps('guide_me'), ['target', 'test_date', 'prep', 'intent', 'hours', 'days', 'assess']);
  assert.deepEqual(questionSteps('own_targets'), ['target', 'test_date', 'prep', 'intent', 'targets', 'hours', 'days', 'assess']);
  assert.equal(questionSteps(null).length, 7);
});
