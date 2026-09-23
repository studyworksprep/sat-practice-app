// Unit tests for the technique authoring contract shared by the
// Techniques catalog, the curriculum editor's inline create, and their
// Server Actions.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeTechniqueInput,
  skillCodesForSection,
  sectionOfSkills,
  describeDefaultSkills,
  TECHNIQUE_NAME_MAX,
} from './techniques.ts';

test('a technique needs a name and a "when to use it"', () => {
  assert.ok(!normalizeTechniqueInput({ name: '', description: 'x' }).ok);
  assert.ok(!normalizeTechniqueInput({ name: 'Regression', description: '  ' }).ok);
  const ok = normalizeTechniqueInput({ name: ' Solve by regression ', description: 'Two unknowns, one equation each.' });
  assert.ok(ok.ok);
  assert.equal(ok.value.name, 'Solve by regression');
  assert.equal(ok.value.processSummary, null);
  assert.equal(ok.value.section, null);
  assert.deepEqual(ok.value.skillCodes, []);
  assert.equal(ok.value.sequence, null);
});

test('skill codes are upper-cased, deduped, and must exist', () => {
  const ok = normalizeTechniqueInput({ name: 'Graphing', description: 'd', skillCodes: ['h.a.', 'H.A.', 'h.d.'] });
  assert.ok(ok.ok);
  assert.deepEqual(ok.value.skillCodes, ['H.A.', 'H.D.']);
  const bad = normalizeTechniqueInput({ name: 'Graphing', description: 'd', skillCodes: ['ZZZ'] });
  assert.ok(!bad.ok && /Unknown skill/.test(bad.error));
});

test('a section pin rejects default skills from the other section', () => {
  const bad = normalizeTechniqueInput({ name: 'GCBC', description: 'd', section: 'reading_writing', skillCodes: ['H.A.'] });
  assert.ok(!bad.ok && /not a Reading & Writing skill/.test(bad.error));
  const ok = normalizeTechniqueInput({ name: 'GCBC', description: 'd', section: 'reading_writing', skillCodes: ['BOU'] });
  assert.ok(ok.ok && ok.value.section === 'reading_writing');
  assert.ok(!normalizeTechniqueInput({ name: 'x', description: 'd', section: 'science' }).ok);
});

test('lengths and order are bounded', () => {
  const long = normalizeTechniqueInput({ name: 'n'.repeat(TECHNIQUE_NAME_MAX + 1), description: 'd' });
  assert.ok(!long.ok);
  assert.ok(!normalizeTechniqueInput({ name: 'n', description: 'd', sequence: '0' }).ok);
  const seq = normalizeTechniqueInput({ name: 'n', description: 'd', sequence: 3 });
  assert.ok(seq.ok && seq.value.sequence === 3);
});

test('section shortcuts and summaries', () => {
  const math = skillCodesForSection('math');
  const rw = skillCodesForSection('reading_writing');
  assert.ok(math.includes('H.A.') && !math.includes('BOU'));
  assert.ok(rw.includes('BOU') && !rw.includes('H.A.'));
  assert.equal(sectionOfSkills(['H.A.', 'H.D.']), 'math');
  assert.equal(sectionOfSkills(['H.A.', 'BOU']), null);
  assert.equal(sectionOfSkills([]), null);
  assert.equal(describeDefaultSkills(math), 'Every Math question');
  assert.equal(describeDefaultSkills(rw), 'Every Reading & Writing question');
  assert.equal(describeDefaultSkills([]), 'Only questions tagged to it');
  assert.match(describeDefaultSkills(['H.A.']), /Linear equations in one variable/);
  assert.match(describeDefaultSkills(['H.A.', 'H.B.', 'H.C.', 'H.D.']), /4 skills/);
});
