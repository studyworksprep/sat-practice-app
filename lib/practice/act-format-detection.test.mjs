import test from 'node:test';
import assert from 'node:assert/strict';
import { detectActFormat, assessActQuestions, combineActFormQuestions } from './act-format-detection.ts';
import { minutesLabel, sectionTimeLimitMs, buildSectionPlan } from './act-test-plan.ts';
const classic = { english: 75, math: 60, reading: 40, science: 40 };
const released = { english: 40, math: 41, reading: 27, science: 34 };
const full = { english: 50, math: 45, reading: 36, science: 40 };
const rows = counts => Object.entries(counts).flatMap(([section, n]) => Array.from({length:n}, (_, i) => ({section,source_ordinal:i+1})));

test('recognizes complete classic, enhanced released, and enhanced practice forms without metadata', () => {
  assert.deepEqual(detectActFormat(classic), {format:'classic',kind:'released',reviewReason:null});
  assert.deepEqual(detectActFormat(released), {format:'enhanced',kind:'released',reviewReason:null});
  assert.deepEqual(detectActFormat(full), {format:'enhanced',kind:'practice',reviewReason:null});
  assert.equal(detectActFormat({...full, math:41}).format,'enhanced');
  assert.equal(detectActFormat({...released,science:0}).reviewReason,null);
});

test('partial approvals and unknown counts require review, even with saved metadata', () => {
  for (const counts of [{}, {science:40}, {...released,math:20}, {...classic,english:74}]) {
    const result=detectActFormat(counts,{format:'enhanced'});
    assert.equal(result.format,null);
    assert.match(result.reviewReason,/Incomplete/);
  }
});

test('mixed signatures, overcounts, and invalid counts are conflicting', () => {
  for (const counts of [{...released,english:75},{...full,math:60},{...classic,math:61},{...released,math:-1},{...released,math:41.5}]) {
    assert.match(detectActFormat(counts).reviewReason,/Conflicting/);
  }
});

test('saved metadata cannot override contrary count evidence', () => {
  assert.match(detectActFormat(released,{format:'classic'}).reviewReason,/Saved format conflicts/);
  assert.equal(detectActFormat(released,{format:'enhanced',kind:'practice'}).reviewReason,null);
  assert.equal(detectActFormat(released,{kind:'practice'}).kind,'practice');
});

test('detects duplicate and missing question identities without rejecting omitted unscored numbering', () => {
  const input=rows(released);
  assert.equal(assessActQuestions(input).reviewReason,null);
  input[1].source_ordinal=1;
  assert.match(assessActQuestions(input).reviewReason,/duplicated/);
  input[1].source_ordinal=null;
  assert.match(assessActQuestions(input).reviewReason,/missing/);
  input[1].source_ordinal=45;
  assert.equal(assessActQuestions(input).reviewReason,null);
  input[1].source_ordinal=51;
  assert.match(assessActQuestions(input).reviewReason,/invalid/);
});

test('time labels preserve the exact section timer and accommodation', () => {
  assert.equal(minutesLabel(sectionTimeLimitMs('enhanced','math',41)), '45 min 30 sec');
  assert.equal(minutesLabel(sectionTimeLimitMs('enhanced','math',41,1.5)), '1 h 8 min 30 sec');
  assert.equal(minutesLabel(3599000), '59 min 59 sec');
  assert.equal(minutesLabel(3600000), '1 h');
  assert.equal(minutesLabel(0), '0 min');
  const plan=buildSectionPlan({format:detectActFormat(released).format,multiplier:1,questionsBySection:Object.fromEntries(Object.entries(released).map(([s,n])=>[s,Array.from({length:n},(_,i)=>s+i)]))});
  assert.deepEqual(plan.map(s=>minutesLabel(s.time_limit_ms)),['28 min','45 min 30 sec','30 min','34 min']);
});


test('25MC1 re-import includes Math already in the bank without double counting approved drafts', () => {
  const bank = rows({...released, math:45});
  const drafts = bank.filter(q => q.section !== 'math');
  const combined = combineActFormQuestions(bank, drafts);
  assert.equal(combined.length, 146);
  assert.deepEqual(assessActQuestions(combined, {format:'enhanced',kind:'practice'}),
    {format:'enhanced',kind:'practice',reviewReason:null});
  assert.match(assessActQuestions(drafts).reviewReason, /Incomplete/);
});

test('combining an import keeps duplicate drafts detectable and partial forms flagged', () => {
  const draft = {section:'english',source_ordinal:1};
  assert.match(assessActQuestions(combineActFormQuestions([draft], [draft,draft])).reviewReason, /duplicated/);
  assert.match(assessActQuestions(combineActFormQuestions([], [draft])).reviewReason, /Incomplete/);
});
