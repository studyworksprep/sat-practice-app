import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCheckAttempt } from './runtime-progress.mjs';
import {
  buildLessonCheckRollup,
  buildLessonCheckRows,
  checkBlockLabel,
  isStruggledAttempt,
  lessonCheckBlocks,
  tallyFirstTry,
} from './progress-report.mjs';

const BLOCKS = [
  { id: 'intro', block_type: 'text', content: { html: '<p>hi</p>' } },
  { id: 'c1', block_type: 'check', content: { prompt: 'What is <em>the</em> first step?' } },
  { id: 'v1', block_type: 'video', content: {} },
  { id: 'd1', block_type: 'desmos_interactive', content: { title: 'Graph the system' } },
  { id: 'c2', block_type: 'check', content: { prompt: 'Final retrieval?' } },
  { id: 'done', block_type: 'lesson_complete', content: {} },
];

function entryFrom(attempts) {
  let entry;
  for (const attempt of attempts) {
    entry = applyCheckAttempt(entry, attempt);
  }
  return entry;
}

test('check labels strip markup and truncate long prompts', () => {
  assert.equal(
    checkBlockLabel(BLOCKS[1]),
    'What is the first step?',
  );
  assert.equal(checkBlockLabel(BLOCKS[3]), 'Graph the system');
  const long = { block_type: 'check', content: { prompt: 'x'.repeat(200) } };
  assert.equal(checkBlockLabel(long).length, 90);
  assert.ok(checkBlockLabel(long).endsWith('…'));
});

test('lessonCheckBlocks keeps lesson-order step numbers', () => {
  assert.deepEqual(
    lessonCheckBlocks(BLOCKS).map((r) => [r.blockId, r.stepNumber]),
    [['c1', 2], ['d1', 4], ['c2', 5]],
  );
});

test('struggled = 3+ tries or a final wrong answer', () => {
  assert.equal(isStruggledAttempt(undefined), false);
  assert.equal(
    isStruggledAttempt(entryFrom([{ selected: 1, correct: true, at: 't1' }])),
    false,
  );
  // One-shot miss: final answer wrong.
  assert.equal(
    isStruggledAttempt(entryFrom([{ selected: 1, correct: false, at: 't1' }])),
    true,
  );
  // Eventually correct, but on the third try.
  assert.equal(
    isStruggledAttempt(entryFrom([
      { selected: 1, correct: false, at: 't1' },
      { selected: 2, correct: false, at: 't2' },
      { selected: 0, correct: true, at: 't3' },
    ])),
    true,
  );
  // Second-try success is fine.
  assert.equal(
    isStruggledAttempt(entryFrom([
      { selected: 1, correct: false, at: 't1' },
      { selected: 0, correct: true, at: 't2' },
    ])),
    false,
  );
});

test('per-student rows include unanswered checks', () => {
  const checkAnswers = {
    c1: entryFrom([{ selected: 2, correct: true, at: 't1' }]),
    d1: entryFrom([
      { selected: null, correct: false, at: 't1', type: 'desmos_interactive' },
      { selected: null, correct: true, at: 't2' },
    ]),
  };
  const rows = buildLessonCheckRows(BLOCKS, checkAnswers);
  assert.deepEqual(
    rows.map((r) => [r.blockId, r.attempted, r.attempts, r.firstTryCorrect, r.finalCorrect]),
    [
      ['c1', true, 1, true, true],
      ['d1', true, 2, false, true],
      ['c2', false, 0, null, null],
    ],
  );
});

test('the roster rollup counts attempted, first-try, and struggled students', () => {
  const progressRows = [
    {
      student_id: 'a',
      check_answers: {
        c1: entryFrom([{ selected: 2, correct: true, at: 't1' }]),
        c2: entryFrom([
          { selected: 0, correct: false, at: 't1' },
          { selected: 1, correct: false, at: 't2' },
          { selected: 3, correct: true, at: 't3' },
        ]),
      },
    },
    {
      student_id: 'b',
      check_answers: {
        c1: entryFrom([{ selected: 1, correct: false, at: 't1' }]),
      },
    },
    // Student c never started: no lesson_progress row at all.
  ];
  const rollup = buildLessonCheckRollup(BLOCKS, progressRows);
  const byId = new Map(rollup.map((r) => [r.blockId, r]));
  assert.deepEqual(
    byId.get('c1'),
    {
      blockId: 'c1',
      stepNumber: 2,
      blockType: 'check',
      label: 'What is the first step?',
      attemptedCount: 2,
      firstTryCount: 1,
      struggledCount: 1,
      avgAttempts: 1,
    },
  );
  assert.equal(byId.get('c2').attemptedCount, 1);
  assert.equal(byId.get('c2').struggledCount, 1);
  assert.equal(byId.get('c2').avgAttempts, 3);
  assert.equal(byId.get('d1').attemptedCount, 0);
  assert.equal(byId.get('d1').avgAttempts, null);
});

test('first-try tally ignores unanswered checks', () => {
  const tally = tallyFirstTry(BLOCKS, {
    c1: entryFrom([{ selected: 2, correct: true, at: 't1' }]),
    c2: entryFrom([
      { selected: 0, correct: false, at: 't1' },
      { selected: 3, correct: true, at: 't2' },
    ]),
  });
  assert.deepEqual(tally, { answered: 2, firstTryCorrect: 1 });
});

test('legacy entries flow through the rollup without attempt arrays', () => {
  const rollup = buildLessonCheckRollup(BLOCKS, [
    { student_id: 'a', check_answers: { c1: { selected: 0, correct: true } } },
  ]);
  const c1 = rollup.find((r) => r.blockId === 'c1');
  assert.equal(c1.attemptedCount, 1);
  assert.equal(c1.firstTryCount, 1);
  assert.equal(c1.avgAttempts, 1);
});
