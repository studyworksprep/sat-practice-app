import test from 'node:test';
import assert from 'node:assert/strict';
import {scorableAnswer} from './answers.ts';
test('publication requires a usable SAT answer',()=>{
  for(const value of ['4','.1764 or .1765 or 3/17','-2/3','0']) assert.equal(scorableAnswer('spr',value),true);
  for(const value of ['',null,'[]','banana','1/0','Infinity','1 or ']) assert.equal(scorableAnswer('spr',value),false);
  assert.equal(scorableAnswer('mcq','B'),true);assert.equal(scorableAnswer('mcq','Z'),false);
});
