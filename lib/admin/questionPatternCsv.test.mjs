// Unit tests for the pattern-catalog CSV contract.
//
// This module is the only thing standing between a hand-edited
// spreadsheet and admin-authored reference data that students read, so
// the cases that matter are the ones where a naive parser silently
// corrupts input: prose fields containing commas, spreadsheet quoting,
// and taxonomy codes that look plausible but do not exist.

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePatternCsv,
  planPatternImport,
  parseDelimitedText,
  patternCsvTemplate,
  patternKey,
} from './questionPatternCsv.ts';

const HEADER = 'domain_code,skill_code,name,recognition_cue,process_summary,sequence';

test('quoted commas stay inside their field', () => {
  const csv = [
    HEADER,
    '"SEC","BOU","Boundaries","Two clauses, one blank, punctuation-only answers.","Split it, test each side.",1',
  ].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(issues.length, 0);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].recognitionCue, 'Two clauses, one blank, punctuation-only answers.');
  assert.equal(rows[0].processSummary, 'Split it, test each side.');
});

test('doubled quotes and embedded newlines survive', () => {
  const csv = [
    HEADER,
    '"SEC","BOU","Quote handling","He said ""stop"" mid-sentence.","Line one',
    'Line two",2',
  ].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(issues.length, 0);
  assert.equal(rows[0].recognitionCue, 'He said "stop" mid-sentence.');
  assert.equal(rows[0].processSummary, 'Line one\nLine two');
});

test('header aliases and reordered columns are accepted', () => {
  const csv = ['cue,name,skill,domain', 'When you see X,Pattern X,BOU,SEC'].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(issues.length, 0);
  assert.deepEqual(
    { d: rows[0].domainCode, s: rows[0].skillCode, n: rows[0].name, c: rows[0].recognitionCue },
    { d: 'SEC', s: 'BOU', n: 'Pattern X', c: 'When you see X' },
  );
});

test('tab-separated paste is detected', () => {
  const tab = String.fromCharCode(9);
  const csv = [
    ['domain_code', 'skill_code', 'name', 'recognition_cue'].join(tab),
    ['Q', 'Q.B.', 'Percent change', 'Original and new amount given'].join(tab),
  ].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(issues.length, 0);
  assert.equal(rows[0].skillCode, 'Q.B.');
  assert.equal(rows[0].name, 'Percent change');
});

test('a BOM does not corrupt the first header', () => {
  const csv = ['﻿domain_code,skill_code,name,recognition_cue', 'SEC,BOU,Name,Cue'].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(issues.length, 0);
  assert.equal(rows.length, 1);
});

test('missing required headers fail the whole file, not each row', () => {
  const { rows, issues } = parsePatternCsv('domain_code,skill_code\nSEC,BOU');
  assert.equal(rows.length, 0);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /missing required columns: name, recognition_cue/);
});

test('taxonomy codes are validated, with the owning domain named', () => {
  const csv = [
    HEADER,
    'SEC,WIC,Wrong domain,Cue,,1',
    'ZZ,BOU,Bad domain,Cue,,1',
    'SEC,NOPE,Bad skill,Cue,,1',
  ].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(rows.length, 0);
  assert.equal(issues.length, 3);
  assert.match(issues[0].message, /belongs to domain CAS, not SEC/);
  assert.match(issues[1].message, /unknown domain_code "ZZ"/);
  assert.match(issues[2].message, /unknown skill_code "NOPE"/);
});

test('error lines point at the source line, counting blanks and wrapped fields', () => {
  const csv = [
    HEADER,
    '',
    '"SEC","BOU","Wrapped","Line one',
    'line two",,1',
    'SEC,NOPE,Broken,Cue,,1',
  ].join('\n');
  const { issues } = parsePatternCsv(csv);
  assert.equal(issues.length, 1);
  assert.equal(issues[0].line, 5);
});

test('blank sequence appends after the existing patterns for that skill', () => {
  const csv = [HEADER, 'SEC,BOU,First new,Cue,,', 'SEC,BOU,Second new,Cue,,'].join('\n');
  const plan = planPatternImport({
    parsed: parsePatternCsv(csv),
    existing: [
      { id: 'a', test_type: 'sat', domain_code: 'SEC', skill_code: 'BOU', name: 'Existing', sequence: 4 },
    ],
    mode: 'skip',
  });
  assert.deepEqual(
    plan.creates.map((c) => [c.row.name, c.sequence]),
    [
      ['First new', 5],
      ['Second new', 6],
    ],
  );
});

test('skip mode leaves an existing pattern alone; update mode rewrites it', () => {
  const csv = [HEADER, 'SEC,BOU,boundaries,New cue,New process,3'].join('\n');
  const existing = [
    { id: 'a', test_type: 'sat', domain_code: 'SEC', skill_code: 'BOU', name: 'Boundaries', sequence: 1 },
  ];

  const skipped = planPatternImport({ parsed: parsePatternCsv(csv), existing, mode: 'skip' });
  assert.equal(skipped.creates.length, 0);
  assert.equal(skipped.updates.length, 0);
  assert.equal(skipped.skips.length, 1);

  const updated = planPatternImport({ parsed: parsePatternCsv(csv), existing, mode: 'update' });
  assert.equal(updated.creates.length, 0);
  assert.equal(updated.updates.length, 1);
  // Case-only difference is a rename of the same row, never a second row.
  assert.equal(updated.updates[0].id, 'a');
  assert.equal(updated.updates[0].existingName, 'Boundaries');
  assert.equal(updated.updates[0].row.name, 'boundaries');
  assert.equal(updated.updates[0].sequence, 3);
});

test('update mode keeps the existing order when the file leaves sequence blank', () => {
  const csv = [HEADER, 'SEC,BOU,Boundaries,New cue,,'].join('\n');
  const plan = planPatternImport({
    parsed: parsePatternCsv(csv),
    existing: [
      { id: 'a', test_type: 'sat', domain_code: 'SEC', skill_code: 'BOU', name: 'Boundaries', sequence: 7 },
    ],
    mode: 'update',
  });
  assert.equal(plan.updates[0].sequence, 7);
});

test('a name repeated within one file is reported once, not imported twice', () => {
  const csv = [HEADER, 'SEC,BOU,Same,Cue A,,1', 'SEC,BOU,SAME,Cue B,,2'].join('\n');
  const plan = planPatternImport({ parsed: parsePatternCsv(csv), existing: [], mode: 'skip' });
  assert.equal(plan.creates.length, 1);
  assert.equal(plan.issues.length, 1);
  assert.match(plan.issues[0].message, /duplicate of line 2/);
});

test('the same name under different skills is not a duplicate', () => {
  const csv = [HEADER, 'SEC,BOU,Shared name,Cue,,1', 'SEC,FSS,Shared name,Cue,,1'].join('\n');
  const plan = planPatternImport({ parsed: parsePatternCsv(csv), existing: [], mode: 'skip' });
  assert.equal(plan.creates.length, 2);
  assert.equal(plan.issues.length, 0);
});

test('sequence must be a positive whole number', () => {
  const csv = [HEADER, 'SEC,BOU,Name,Cue,,0', 'SEC,FSS,Name,Cue,,1.5', 'SEC,BOU,Other,Cue,,x'].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(rows.length, 0);
  assert.equal(issues.length, 3);
  for (const issue of issues) assert.match(issue.message, /whole number of 1 or more/);
});

test('unrecognized columns warn but do not block the import', () => {
  const csv = ['domain_code,skill_code,name,recognition_cue,notes', 'SEC,BOU,Name,Cue,ignore me'].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(issues.length, 1);
  assert.match(issues[0].message, /Ignoring unrecognized column: notes/);
});

test('trailing newlines and blank rows produce no phantom patterns', () => {
  const csv = [HEADER, 'SEC,BOU,Name,Cue,,1', '', '   ', ''].join('\n');
  const { rows, issues } = parsePatternCsv(csv);
  assert.equal(rows.length, 1);
  assert.equal(issues.length, 0);
});

test('an empty file reports itself rather than throwing', () => {
  const { rows, issues } = parsePatternCsv('');
  assert.equal(rows.length, 0);
  assert.equal(issues[0].message, 'File is empty.');
});

test('the shipped template parses clean and round-trips', () => {
  const { rows, issues } = parsePatternCsv(patternCsvTemplate());
  assert.equal(issues.length, 0);
  assert.equal(rows.length, 2);
  const plan = planPatternImport({
    parsed: parsePatternCsv(patternCsvTemplate()),
    existing: [],
    mode: 'skip',
  });
  assert.equal(plan.creates.length, 2);
  assert.equal(plan.issues.length, 0);
});

test('patternKey ignores case and surrounding space in the name only', () => {
  assert.equal(patternKey('sat', 'SEC', 'BOU', ' Name '), patternKey('sat', 'SEC', 'BOU', 'name'));
  assert.notEqual(patternKey('sat', 'SEC', 'BOU', 'Name'), patternKey('sat', 'SEC', 'FSS', 'Name'));
});

test('parseDelimitedText reports the line a record starts on', () => {
  const records = parseDelimitedText('a,b\n"multi\nline",c\nlast,row');
  assert.deepEqual(
    records.map((r) => r.line),
    [1, 2, 4],
  );
  assert.deepEqual(records[1].cells, ['multi\nline', 'c']);
});
