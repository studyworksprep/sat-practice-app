// Prep-card tests (§4.1).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPrepCard,
  computeMasteryMovers,
  suggestFocus,
  topStruggles,
  MIN_MOVE,
  STRUGGLE_ACCURACY_BELOW,
} from './prep.ts';

const m = (skill, mastery, attempts, domain = 'ALG') => ({
  domain_code: domain,
  skill_code: skill,
  mastery,
  attempts_count: attempts,
});

const cov = (skill, over = {}) => ({
  domain_code: 'ALG',
  skill_code: skill,
  title: `Unit ${skill}`,
  sequence: 1,
  mastery: 50,
  mastery_threshold: 80,
  status: 'in_progress',
  questions_available: 10,
  attempts_count: 5,
  ...over,
});

const perf = (skill, attempts, missed, over = {}) => ({
  skill_code: skill,
  skill_name: `Skill ${skill}`,
  attempts,
  missed,
  accuracy: attempts > 0 ? (attempts - missed) / attempts : 0,
  ...over,
});

// ── computeMasteryMovers ───────────────────────────────────────────

test('unchanged attempt counts never move, whatever the scores say', () => {
  const { up, down } = computeMasteryMovers([m('LEQ', 40, 10)], [m('LEQ', 90, 10)]);
  assert.equal(up.length + down.length, 0);
});

test('rise and fall land in the right buckets with titles from coverage', () => {
  const { up, down } = computeMasteryMovers(
    [m('LEQ', 40, 10), m('QUA', 70, 8)],
    [m('LEQ', 55, 14), m('QUA', 60, 12)],
    [cov('LEQ', { title: 'Linear equations' })],
  );
  assert.equal(up.length, 1);
  assert.deepEqual(
    { title: up[0].title, from: up[0].from, to: up[0].to, delta: up[0].delta },
    { title: 'Linear equations', from: 40, to: 55, delta: 15 },
  );
  assert.equal(down.length, 1);
  assert.equal(down[0].skillCode, 'QUA');
  assert.equal(down[0].title, 'QUA'); // no coverage row → code fallback
  assert.equal(down[0].delta, -10);
});

test('first-touched skills move from 0', () => {
  const { up } = computeMasteryMovers([], [m('LEQ', 35, 5)]);
  assert.equal(up.length, 1);
  assert.equal(up[0].from, 0);
  assert.equal(up[0].to, 35);
});

test('sub-threshold wiggle is noise', () => {
  const { up, down } = computeMasteryMovers(
    [m('LEQ', 50, 10)],
    [m('LEQ', 50 + MIN_MOVE - 1, 15)],
  );
  assert.equal(up.length + down.length, 0);
});

test('movers cap at three per direction, biggest absolute move first', () => {
  const then = ['A', 'B', 'C', 'D'].map((s, i) => m(s, 50, 10 + i));
  const now = [m('A', 60, 20), m('B', 75, 20), m('C', 58, 20), m('D', 64, 20)];
  const { up } = computeMasteryMovers(then, now);
  assert.equal(up.length, 3);
  assert.deepEqual(up.map((x) => x.skillCode), ['B', 'D', 'A']);
});

// ── topStruggles ───────────────────────────────────────────────────

test('struggles: low accuracy only, most-missed first, capped at 3', () => {
  const rows = [
    perf('OK', 10, 2), // 80% — not a struggle
    perf('A', 10, 6),
    perf('B', 20, 12),
    perf('C', 8, 5),
    perf('D', 6, 4),
  ];
  const s = topStruggles(rows);
  assert.equal(s.length, 3);
  assert.deepEqual(s.map((x) => x.skillCode), ['B', 'A', 'C']);
  assert.ok(s.every((x) => x.accuracy < STRUGGLE_ACCURACY_BELOW));
});

// ── suggestFocus ───────────────────────────────────────────────────

const behind = {
  status: 'behind',
  dueCount: 10,
  completedDue: 3,
  overdueCount: 7,
  completedAhead: 0,
  completionRate: 0.3,
};
const onTrack = { ...behind, status: 'on_track', overdueCount: 0, completedDue: 10, completionRate: 1 };

test('a behind plan outranks everything', () => {
  const f = suggestFocus(behind, [cov('LEQ', { status: 'decayed' })]);
  assert.equal(f.kind, 'catch_up');
  assert.match(f.reason, /7 overdue tasks/);
});

test('decayed beats weakest when on track', () => {
  const f = suggestFocus(onTrack, [
    cov('WEAK', { mastery: 20 }),
    cov('DEC', { status: 'decayed', mastery: 45 }),
  ]);
  assert.equal(f.kind, 'recover');
  assert.equal(f.skillCode, 'DEC');
});

test('weakest started-below-threshold skill, drillable units only', () => {
  const f = suggestFocus(null, [
    cov('NOQ', { mastery: 10, questions_available: 0 }),
    cov('W1', { mastery: 30 }),
    cov('W2', { mastery: 25 }),
  ]);
  assert.equal(f.kind, 'strengthen');
  assert.equal(f.skillCode, 'W2');
});

test('all mastered → start the next unit in sequence', () => {
  const f = suggestFocus(null, [
    cov('DONE', { status: 'mastered', mastery: 95 }),
    cov('N2', { status: 'not_started', attempts_count: 0, sequence: 9 }),
    cov('N1', { status: 'not_started', attempts_count: 0, sequence: 4 }),
  ]);
  assert.equal(f.kind, 'start_next');
  assert.equal(f.skillCode, 'N1');
});

test('nothing to do → maintenance', () => {
  const f = suggestFocus(onTrack, [cov('DONE', { status: 'mastered', mastery: 95 })]);
  assert.equal(f.kind, 'none');
});

// ── buildPrepCard ──────────────────────────────────────────────────

test('buildPrepCard assembles all three sections', () => {
  const card = buildPrepCard({
    masteryThen: [m('LEQ', 40, 10)],
    masteryNow: [m('LEQ', 55, 14)],
    skillPerformance: [perf('LEQ', 14, 8)],
    coverage: [cov('LEQ', { title: 'Linear equations' })],
    adherence: behind,
  });
  assert.equal(card.movers.up[0].title, 'Linear equations');
  assert.equal(card.struggles[0].skillCode, 'LEQ');
  assert.equal(card.focus.kind, 'catch_up');
});
