import test from 'node:test';
import assert from 'node:assert/strict';
import {scorableAnswer} from './answers.ts';
test('publication requires a usable SAT answer',()=>{
  for(const value of ['4','.1764 or .1765 or 3/17','-2/3','0']) assert.equal(scorableAnswer('spr',value),true);
  for(const value of ['',null,'[]','banana','1/0','Infinity','1 or ']) assert.equal(scorableAnswer('spr',value),false);
  assert.equal(scorableAnswer('mcq','B'),true);assert.equal(scorableAnswer('mcq','Z'),false);
});

import {rationaleAnswer} from './answers.ts';
test('extracts only explicit answer statements and equivalent listed forms',()=>{
 assert.equal(rationaleAnswer('spr',String.raw`The correct answer is $\frac{3}{2}$. Add the equations. Note that 3/2 and 1.5 are examples of ways to enter a correct answer.`),'3/2, 1.5');
 assert.equal(rationaleAnswer('spr','The correct answer is .25 . Explanation.'),'.25');
 assert.equal(rationaleAnswer('spr','The correct answer is -2.5. Explanation.'),'-2.5');
 assert.equal(rationaleAnswer('spr','The correct answer is 0. Explanation.'),'0');
 assert.equal(rationaleAnswer('mcq','Choice c is correct. Choice A is incorrect.'),'C');
 for(const value of ['Solving gives y=4.','The correct answer is 4 meters.','The correct answer is between 4 and 5.','The correct answer is 1/0.']) assert.equal(rationaleAnswer('spr',value),null);
 assert.equal(rationaleAnswer('mcq','Choice A is correct. Choice B is correct.'),null);
 assert.equal(rationaleAnswer('spr','The correct answer is 4. Note that 5 and 6 are examples of ways to enter a correct answer.'),'4');
});
