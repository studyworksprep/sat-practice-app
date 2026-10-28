import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_GROUP_SIZE,
  buildUserContent,
  groupByPassage,
  parseRatings,
  questionKey,
} from './estimate.ts';

function q(overrides = {}) {
  return {
    id: overrides.id ?? `id-${overrides.source_ordinal ?? 'x'}`,
    source_test: 'ACT-2022-April-E25',
    section: 'english',
    source_ordinal: 1,
    stimulus_html: '<p>Passage one</p>',
    stem_html: '<p>1.</p>',
    options: [
      { label: 'A', content_html: 'NO CHANGE', is_correct: true },
      { label: 'B', content_html: 'alt', is_correct: false },
    ],
    ...overrides,
  };
}

test('groupByPassage buckets questions by form + section + passage, sorted by ordinal', () => {
  const groups = groupByPassage([
    q({ source_ordinal: 3 }),
    q({ source_ordinal: 1 }),
    q({ source_ordinal: 16, stimulus_html: '<p>Passage two</p>' }),
    q({ source_ordinal: 2 }),
    q({ source_ordinal: 1, section: 'reading', stimulus_html: '<p>Passage one</p>', id: 'r1' }),
  ]);
  assert.equal(groups.length, 3);
  assert.deepEqual(groups[0].questions.map((x) => x.source_ordinal), [1, 2, 3]);
  assert.equal(groups[0].label, 'ACT-2022-April-E25 · english · Q1–Q3');
  assert.equal(groups[1].questions[0].source_ordinal, 16);
  assert.equal(groups[1].label, 'ACT-2022-April-E25 · english · Q16');
  assert.equal(groups[2].section, 'reading');
});

test('groupByPassage gives standalone questions their own group and chunks big passages', () => {
  const solo = groupByPassage([
    q({ source_ordinal: 1, stimulus_html: null, id: 's1' }),
    q({ source_ordinal: 2, stimulus_html: '   ', id: 's2' }),
  ]);
  assert.equal(solo.length, 2);
  assert.equal(solo[0].stimulusHtml, null);

  const big = groupByPassage(
    Array.from({ length: MAX_GROUP_SIZE + 5 }, (_, i) => q({ source_ordinal: i + 1 })),
  );
  assert.equal(big.length, 2);
  assert.equal(big[0].questions.length, MAX_GROUP_SIZE);
  assert.equal(big[1].questions.length, 5);
});

test('questionKey is the ordinal when present, else the id', () => {
  assert.equal(questionKey(q({ source_ordinal: 12 })), '12');
  assert.equal(questionKey(q({ source_ordinal: null, id: 'abc' })), 'abc');
});

test('buildUserContent sends the passage once and keys every question', () => {
  const [group] = groupByPassage([q({ source_ordinal: 1 }), q({ source_ordinal: 2 })]);
  const text = buildUserContent(group);
  assert.match(text, /^Section: English\. Form: ACT-2022-April-E25\. Questions in this group: 2\./);
  assert.equal(text.split('<p>Passage one</p>').length - 1, 1);
  const json = JSON.parse(text.slice(text.indexOf('Questions (JSON):\n') + 'Questions (JSON):\n'.length));
  assert.deepEqual(json.map((x) => x.key), ['1', '2']);
  assert.equal(json[0].options[0].is_correct, true);
});

test('parseRatings maps keys back to question ids and converts the level', () => {
  const [group] = groupByPassage([q({ source_ordinal: 1 }), q({ source_ordinal: 2 })]);
  const r = parseRatings(
    { ratings: [
      { key: '2', difficulty: '4', reason: 'Subtle idiom.' },
      { key: '1', difficulty: 2, reason: 'Comma rule.' },
    ] },
    group,
  );
  assert.deepEqual(r.errors, []);
  assert.deepEqual(
    r.estimates.map((e) => [e.questionId, e.difficulty, e.reason]),
    [['id-2', 4, 'Subtle idiom.'], ['id-1', 2, 'Comma rule.']],
  );
});

test('parseRatings keeps the good entries and reports the bad ones', () => {
  const [group] = groupByPassage([q({ source_ordinal: 1 }), q({ source_ordinal: 2 }), q({ source_ordinal: 3 })]);
  const r = parseRatings(
    { ratings: [
      { key: '1', difficulty: '3', reason: 'ok' },
      { key: '1', difficulty: '5', reason: 'dup' },
      { key: '9', difficulty: '2', reason: 'unknown' },
      { key: '2', difficulty: '7', reason: 'range' },
    ] },
    group,
  );
  assert.deepEqual(r.estimates.map((e) => e.key), ['1']);
  assert.equal(r.errors.length, 4);
  assert.match(r.errors[0], /rated more than once/);
  assert.match(r.errors[1], /unknown question key "9"/);
  assert.match(r.errors[2], /"7" is not 1–5/);
  assert.match(r.errors[3], /Unrated questions: 2, 3\./);
});

test('parseRatings rejects a response with no ratings array', () => {
  const [group] = groupByPassage([q({ source_ordinal: 1 })]);
  const r = parseRatings({ nope: true }, group);
  assert.deepEqual(r.estimates, []);
  assert.equal(r.errors.length, 1);
});
