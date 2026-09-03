import test from 'node:test';
import assert from 'node:assert/strict';

import {
  choiceNumericValue,
  lintLessonBlocks,
  normalizeItemText,
  titleKeyTerms,
} from './lesson-lint.mjs';

function check(id, content) {
  return { id, block_type: 'check', content };
}
function text(id, html) {
  return { id, block_type: 'text', content: { html } };
}
const cleanCheck = (id) =>
  check(id, {
    prompt: 'Solve for x: 2x + 6 = 14',
    choices: ['\\(x = 4\\)', '\\(x = 10\\)', '\\(x = 7\\)', '\\(x = 2\\)'],
    correct_index: 0,
    hint: 'Subtract 6 from both sides first.',
    explanation: 'Subtracting 6 gives 2x = 8, so x = 4.',
  });

function codes(result) {
  return result.warnings.map((w) => w.code);
}

// ─── normalization helpers ────────────────────────────────────────

test('normalization strips LaTeX and converts fractions to slashes', () => {
  assert.equal(normalizeItemText('\\(\\frac{16}{25}\\)'), '(16/25)');
  assert.equal(normalizeItemText('\\(x = 4\\)'), 'x = 4');
  assert.equal(
    normalizeItemText('<p>the <strong>diagram</strong> above</p>'),
    'the diagram above',
  );
});

test('numeric values parse numbers, fractions, ratios, and percents', () => {
  assert.deepEqual(choiceNumericValue('\\(\\frac{8}{2}\\)'), { kind: 'number', value: 4 });
  assert.deepEqual(choiceNumericValue('\\(16:25\\)'), { kind: 'ratio', value: 0.64 });
  assert.deepEqual(choiceNumericValue('\\(50\\%\\)'), { kind: 'percent', value: 50 });
  assert.equal(choiceNumericValue('\\(9\\sqrt{2}\\)'), null);
  // Equations carry no bare value: the variable name is part of the answer.
  assert.equal(choiceNumericValue('\\(x = 4\\)'), null);
});

test('variable-named and case-distinct equations are not equivalent', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'What should you report for the original variable?',
      choices: ['\\(x=6\\)', '\\(X=6\\)', '\\(y=6\\)', '\\(x=9\\)'],
      correct_index: 0,
    }),
  ], { title: 'Solve Equations with Regression' });
  assert.ok(!codes(result).includes('lint_equivalent_choices'));
});

test('title key terms prefer bigrams and distinctive words', () => {
  const terms = titleKeyTerms('Use Scale Factors with Similar Shapes');
  assert.ok(terms.includes('scale factors'));
  assert.ok(terms.includes('similar shapes'));
  assert.ok(!terms.includes('use scale'));
});

// ─── giveaway rules ───────────────────────────────────────────────

test('a clean check produces no warnings', () => {
  const result = lintLessonBlocks([cleanCheck('c1')], { title: 'Solve Linear Equations' });
  assert.deepEqual(codes(result), []);
});

test('keyed-longest fires on a padded key and feeds the corpus stat', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'What should you do first?',
      choices: [
        'Carefully identify the total for the probability before touching the favorable count, because the denominator decision controls the whole problem',
        'Add the rows',
        'Pick the biggest number',
        'Guess',
      ],
      correct_index: 0,
    }),
  ], { title: 'Probability from Tables' });
  assert.ok(codes(result).includes('lint_keyed_longest'));
  assert.equal(result.stats.keyedLongestCount, 1);
  assert.equal(result.stats.keyedLongestRate, 1);
});

test('keyed-longest stays quiet on short math answers', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'Solve.',
      choices: ['\\(x = 41\\)', '\\(x=2\\)', '\\(x=7\\)'],
      correct_index: 0,
    }),
  ], { title: 'Solve Equations' });
  assert.ok(!codes(result).includes('lint_keyed_longest'));
});

test('key-term echo fires when only the key names the lesson term', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'Which statement is accurate?',
      choices: [
        'Multiply the area by the square of the scale factor',
        'Add the two areas together and simplify',
        'Divide the perimeters and take the square root',
        'Multiply the two side lengths directly',
      ],
      correct_index: 0,
    }),
  ], { title: 'Use Scale Factors with Similar Shapes' });
  assert.ok(codes(result).includes('lint_key_term_echo'));
});

test('key-term echo stays quiet when a distractor shares the term', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'Which statement is accurate?',
      choices: [
        'Multiply the area by the square of the scale factor',
        'Multiply the area by the scale factor itself',
        'Divide the perimeters and take the square root',
        'Multiply the two side lengths directly',
      ],
      correct_index: 0,
    }),
  ], { title: 'Use Scale Factors with Similar Shapes' });
  assert.ok(!codes(result).includes('lint_key_term_echo'));
});

test('extreme-word imbalance fires when absolutes cluster in distractors', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'Which conclusion is best supported?',
      choices: [
        'Some commuters in the sample reported lower stress',
        'Reading always reduces stress for every commuter',
        'The survey proved that reading causes lower stress',
        'Commuters who read are calmer than drivers',
      ],
      correct_index: 0,
    }),
  ], { title: 'Inference' });
  assert.ok(codes(result).includes('lint_extreme_imbalance'));
});

test('hint-gives-answer fires on "= value" and on echoed key text', () => {
  const numeric = lintLessonBlocks([
    check('c1', {
      prompt: 'Solve for x.',
      choices: ['\\(x = 4\\)', '\\(x = 10\\)'],
      correct_index: 0,
      hint: 'Remember that 2x = 8, so x = 4.',
    }),
  ], { title: 'Solve Equations' });
  assert.ok(codes(numeric).includes('lint_hint_gives_answer'));

  const echoed = lintLessonBlocks([
    check('c1', {
      prompt: 'Which setup is correct?',
      choices: ['Favorable over Total', 'Total over Favorable'],
      correct_index: 0,
      hint: 'Write Favorable over Total before reading the table.',
    }),
  ], { title: 'Probability from Tables' });
  assert.ok(codes(echoed).includes('lint_hint_gives_answer'));

  const clean = lintLessonBlocks([cleanCheck('c1')], { title: 'Solve Equations' });
  assert.ok(!codes(clean).includes('lint_hint_gives_answer'));
});

test('meta prompts fire; ordinary why-prompts do not', () => {
  const meta = lintLessonBlocks([
    check('c1', {
      prompt: 'Why is \\(\\frac{12}{20}\\) the correct setup for the probability?',
      choices: ['Because medium is the given group', 'Because green is the given group'],
      correct_index: 0,
    }),
  ], { title: 'Probability from Tables' });
  assert.ok(codes(meta).includes('lint_meta_prompt'));

  const fine = lintLessonBlocks([
    check('c1', {
      prompt: 'Why does the quadratic factor contain \\(-AB\\)?',
      choices: ['So the middle terms cancel', 'So the constant doubles'],
      correct_index: 0,
    }),
  ], { title: 'Advanced Factoring' });
  assert.ok(!codes(fine).includes('lint_meta_prompt'));
});

test('equivalent choices fire on reducible ratio pairs', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'What is the linear ratio?',
      choices: ['\\(4:5\\)', '\\(72:50\\)', '\\(36:25\\)', '\\(5:4\\)'],
      correct_index: 2,
    }),
  ], { title: 'Scale Factor' });
  const hit = result.warnings.find((w) => w.code === 'lint_equivalent_choices');
  assert.ok(hit);
  assert.match(hit.message, /B and C/);
});

// ─── structural rules ─────────────────────────────────────────────

test('figure references without an img on the slide fire', () => {
  const result = lintLessonBlocks([
    text('t1', '<p>Study the diagram of the triangle.</p><img src="/images/tri.svg" alt="triangle">'),
    check('c1', {
      prompt: 'In the diagram, which vertex corresponds to vertex B?',
      choices: ['\\(E\\)', '\\(F\\)'],
      correct_index: 0,
    }),
  ], { title: 'Similar Triangles' });
  const hits = result.warnings.filter((w) => w.code === 'lint_missing_figure');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].blockId, 'c1');
});

test('a pinned side-pane figure satisfies a figure reference', () => {
  const result = lintLessonBlocks([
    check('c1', {
      prompt: 'In the diagram, which vertex corresponds to vertex B?',
      choices: ['\\(E\\)', '\\(F\\)'],
      correct_index: 0,
      figure: { src: '/images/tri.svg', alt: 'Two similar triangles' },
    }),
  ], { title: 'Similar Triangles' });
  assert.equal(result.warnings.filter((w) => w.code === 'lint_missing_figure').length, 0);
});

test('retrieval distractors with no content overlap fire', () => {
  const result = lintLessonBlocks([
    check('final_retrieval', {
      prompt: 'Without looking back, which routine is correct?',
      choices: [
        'Bracket the two ideas, shrink each one, predict the relationship, then match a transition',
        'Read every choice aloud twice and pick the longest',
        'Bracket the two ideas, predict the relationship, then shrink each one',
      ],
      correct_index: 0,
    }),
  ], { title: 'Bracket the Pivot' });
  const hit = result.warnings.find((w) => w.code === 'lint_retrieval_nonsense_distractor');
  assert.ok(hit);
  assert.match(hit.message, /\bB\b/);
  assert.ok(!/\bC\b/.test(hit.message.replace(/content|sight/g, '')));
});

test('3+ consecutive checks and 3+ consecutive text blocks fire', () => {
  const result = lintLessonBlocks([
    text('t1', '<p>one</p>'),
    text('t2', '<p>two</p>'),
    text('t3', '<p>three</p>'),
    cleanCheck('c1'),
    cleanCheck('c2'),
    cleanCheck('c3'),
    text('t4', '<p>rest</p>'),
  ], { title: 'Pacing' });
  assert.ok(codes(result).includes('lint_text_run'));
  assert.ok(codes(result).includes('lint_check_run'));

  const fine = lintLessonBlocks([
    text('t1', '<p>one</p>'),
    cleanCheck('c1'),
    cleanCheck('c2'),
    text('t2', '<p>two</p>'),
  ], { title: 'Pacing' });
  assert.ok(!codes(fine).includes('lint_check_run'));
  assert.ok(!codes(fine).includes('lint_text_run'));
});

// ─── numeric-entry checks (plan 1.6) ────────────────────────────

test('numeric checks skip the choice rules but keep the hint rule', () => {
  const quiet = lintLessonBlocks([
    check('n1', { prompt: 'What is f(3)?', input: 'numeric', answer: '4', allow_retry: true,
      hint: 'Substitute 3 for x.', explanation: 'f(3) = 4.' }),
  ]);
  assert.deepEqual(codes(quiet), []);
  assert.equal(quiet.stats.numericCheckCount, 1);
  assert.equal(quiet.stats.checkCount, 0);

  const leaky = lintLessonBlocks([
    check('n2', { prompt: 'What is f(3)?', input: 'numeric', answer: '4', allow_retry: true,
      hint: 'Remember that f(3) = 4 here.' }),
  ]);
  assert.deepEqual(codes(leaky), ['lint_hint_gives_answer']);
});

test('lint_spr_candidate flags one-shot checks whose choices are all bare numbers', () => {
  const oneShot = check('m', { prompt: 'What is the value of x?', choices: ['3', '5', '7', '21'], correct_index: 0 });
  assert.ok(codes(lintLessonBlocks([oneShot])).includes('lint_spr_candidate'));

  // Retry checks keep their choices — the distractors are the teaching.
  const retry = check('m', { ...oneShot.content, allow_retry: true, hint: 'Solve for y first.' });
  assert.ok(!codes(lintLessonBlocks([retry])).includes('lint_spr_candidate'));

  // Ratios and percents are not student-produced-response answers.
  const ratio = check('m', { prompt: 'What is the ratio?', choices: ['4:5', '2:5', '16:25'], correct_index: 0 });
  assert.ok(!codes(lintLessonBlocks([ratio])).includes('lint_spr_candidate'));
  const pct = check('m', { prompt: 'What percent?', choices: ['48%', '80%', '60%'], correct_index: 1 });
  assert.ok(!codes(lintLessonBlocks([pct])).includes('lint_spr_candidate'));

  // Fractions count as numbers (the SAT takes 39/65 typed).
  const frac = check('m', { prompt: 'What is the probability?',
    choices: ['\\(\\frac{39}{65}\\)', '\\(\\frac{39}{60}\\)', '\\(\\frac{26}{65}\\)'], correct_index: 0 });
  assert.ok(codes(lintLessonBlocks([frac])).includes('lint_spr_candidate'));
});
