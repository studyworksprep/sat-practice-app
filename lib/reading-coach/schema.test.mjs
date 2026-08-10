// Unit tests for the ReadingCoachItemSpec validator (PR 1).
//
// The three checked-in fixture items are the positive cases — they
// must validate for both draft-save and publish. The negative cases
// mutate a deep copy of the Darwin fixture one defect at a time and
// assert the validator names the right path.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  htmlTextContent,
  parseReadingCoachItemSpecText,
  validateReadingCoachItemSpec,
} from './schema.ts';

const FIXTURES_DIR = new URL('./__fixtures__/items/', import.meta.url);

function loadFixture(name) {
  return JSON.parse(readFileSync(new URL(name, FIXTURES_DIR), 'utf8'));
}

function darwin() {
  return structuredClone(loadFixture('darwin-natural-selection-main-idea.json'));
}

function expectErrorAt(result, pathPrefix) {
  assert.equal(result.ok, false, 'expected validation to fail');
  assert.ok(
    result.errors.some((e) => e.path.startsWith(pathPrefix)),
    `expected an error at "${pathPrefix}", got: ${result.errors
      .map((e) => `${e.path}: ${e.message}`)
      .join('; ')}`,
  );
}

test('every checked-in fixture validates for draft and publish', () => {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  assert.ok(files.length >= 3, `expected at least 3 fixtures, found ${files.length}`);
  for (const file of files) {
    const spec = loadFixture(file);
    const draft = validateReadingCoachItemSpec(spec);
    assert.equal(
      draft.ok,
      true,
      `${file} (draft): ${draft.ok ? '' : JSON.stringify(draft.errors)}`,
    );
    const publish = validateReadingCoachItemSpec(spec, { forPublish: true });
    assert.equal(
      publish.ok,
      true,
      `${file} (publish): ${publish.ok ? '' : JSON.stringify(publish.errors)}`,
    );
  }
});

test('fixtures cover the three processing modes and three task types', () => {
  const files = readdirSync(FIXTURES_DIR).filter((f) => f.endsWith('.json'));
  const specs = files.map(loadFixture);
  const modes = new Set(specs.map((s) => s.processingMode));
  const tasks = new Set(specs.map((s) => s.taskType));
  assert.ok(modes.size >= 3, `processing modes covered: ${[...modes].join(', ')}`);
  assert.ok(tasks.size >= 3, `task types covered: ${[...tasks].join(', ')}`);
});

test('rejects a spec that is not an object', () => {
  assert.equal(validateReadingCoachItemSpec(null).ok, false);
  assert.equal(validateReadingCoachItemSpec([]).ok, false);
  assert.equal(validateReadingCoachItemSpec('x').ok, false);
});

test('parse helper reports JSON errors and non-object roots', () => {
  assert.ok('error' in parseReadingCoachItemSpecText('not json'));
  assert.ok('error' in parseReadingCoachItemSpecText('[1, 2]'));
  assert.ok('spec' in parseReadingCoachItemSpecText('{"a": 1}'));
});

test('exactly four choices are required', () => {
  const spec = darwin();
  spec.choices = spec.choices.slice(0, 3);
  expectErrorAt(validateReadingCoachItemSpec(spec), 'choices');
});

test('exactly one correct choice — two corrects rejected', () => {
  const spec = darwin();
  spec.choices[1].correct = true;
  expectErrorAt(validateReadingCoachItemSpec(spec), 'choices');
});

test('exactly one correct choice — zero corrects rejected', () => {
  const spec = darwin();
  spec.choices[0].correct = false;
  expectErrorAt(validateReadingCoachItemSpec(spec), 'choices');
});

test('duplicate choice labels rejected', () => {
  const spec = darwin();
  spec.choices[1].label = 'A';
  expectErrorAt(validateReadingCoachItemSpec(spec), 'choices[1].label');
});

test('every choice needs a rationale', () => {
  const spec = darwin();
  spec.choices[2].rationaleHtml = '   ';
  expectErrorAt(validateReadingCoachItemSpec(spec), 'choices[2].rationaleHtml');
});

test('permission_pending rights: draft ok, publish blocked', () => {
  const spec = darwin();
  spec.source.rightsStatus = 'permission_pending';
  assert.equal(validateReadingCoachItemSpec(spec).ok, true);
  expectErrorAt(
    validateReadingCoachItemSpec(spec, { forPublish: true }),
    'source.rightsStatus',
  );
});

test('at least one processing unit required', () => {
  const spec = darwin();
  spec.processingUnits = [];
  expectErrorAt(validateReadingCoachItemSpec(spec), 'processingUnits');
});

test('duplicate processing-unit keys rejected', () => {
  const spec = darwin();
  spec.processingUnits[1].key = spec.processingUnits[0].key;
  expectErrorAt(validateReadingCoachItemSpec(spec), 'processingUnits[1].key');
});

test('empty required-idea lists rejected where the plan requires them', () => {
  for (const [mutate, path] of [
    [(s) => { s.taskRubric.requiredIdeas = []; }, 'taskRubric.requiredIdeas'],
    [(s) => { s.passageRubric.requiredIdeas = []; }, 'passageRubric.requiredIdeas'],
    [(s) => { s.passageRubric.requiredRelations = []; }, 'passageRubric.requiredRelations'],
    [(s) => { s.preanswerRubric.requiredIdeas = []; }, 'preanswerRubric.requiredIdeas'],
    [(s) => { s.processingUnits[0].requiredIdeas = []; }, 'processingUnits[0].requiredIdeas'],
  ]) {
    const spec = darwin();
    mutate(spec);
    expectErrorAt(validateReadingCoachItemSpec(spec), path);
  }
});

test('slug must be kebab-case', () => {
  const spec = darwin();
  spec.slug = 'Not A Slug';
  expectErrorAt(validateReadingCoachItemSpec(spec), 'slug');
});

test('difficulty outside 1-3 rejected', () => {
  const spec = darwin();
  spec.difficulty = 4;
  expectErrorAt(validateReadingCoachItemSpec(spec), 'difficulty');
});

test('unknown enum values rejected', () => {
  const spec = darwin();
  spec.genre = 'poetry';
  expectErrorAt(validateReadingCoachItemSpec(spec), 'genre');
});

test('script tags are stripped from HTML fields', () => {
  const spec = darwin();
  spec.passageHtml = '<p>Fine text.</p><script>alert(1)</script>';
  const result = validateReadingCoachItemSpec(spec);
  assert.equal(result.ok, true, JSON.stringify(result.ok ? '' : result.errors));
  assert.ok(!result.spec.passageHtml.includes('<script'));
  assert.ok(result.spec.passageHtml.includes('Fine text.'));
});

test('HTML that sanitizes to nothing is rejected', () => {
  const spec = darwin();
  spec.questionStemHtml = '<script>alert(1)</script>';
  expectErrorAt(validateReadingCoachItemSpec(spec), 'questionStemHtml');
});

test('validated spec is normalized: trimmed strings, sanitized HTML', () => {
  const spec = darwin();
  spec.title = '  Padded title  ';
  spec.taskRubric.requiredIdeas = ['  padded idea  '];
  const result = validateReadingCoachItemSpec(spec);
  assert.equal(result.ok, true);
  assert.equal(result.spec.title, 'Padded title');
  assert.deepEqual(result.spec.taskRubric.requiredIdeas, ['padded idea']);
});

test('htmlTextContent strips tags and entities', () => {
  assert.equal(htmlTextContent('<p>a <em>b</em>&nbsp;c</p>'), 'a b c');
  assert.equal(htmlTextContent('<script>x()</script>'), 'x()');
  assert.equal(htmlTextContent(''), '');
});
