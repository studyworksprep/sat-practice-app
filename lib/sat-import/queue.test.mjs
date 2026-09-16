import test from 'node:test';
import assert from 'node:assert/strict';
import {initialChoice,readiness,queueProblem,completed} from './queue.ts';
const item={id:'new',insertToken:'signed',hasAnswer:true,difficulty:null,imported:{question:{taxonomy:{domain_name:null,skill_name:null}}},matches:[]};
const approved={...initialChoice('set-a'),preference:'Prefer imported',confirmed:true,selected:true,section:'M'};
test('bulk eligibility requires a rendering choice and explicit review',()=>{
  assert.match(readiness(item,initialChoice('set-a')),/Choose which rendering/);
  assert.match(readiness(item,{...approved,confirmed:false}),/Confirm/);
  assert.equal(readiness(item,approved),null);
  assert.match(readiness(item,{...approved,preference:'Needs editing'}),/editing/);
  assert.match(readiness(item,{...approved,batchId:''}),/set/);
  assert.match(readiness(item,{...approved,destination:'regular'}),/metadata/);
  assert.match(readiness({...item,hasAnswer:false},{...approved,publish:true}),/answer/);
});
test('existing, imported and unavailable snapshot choices remain distinct',()=>{
  const existing={...item,matches:[{id:'bank',applyToken:null,applyBlocked:'Snapshot is read-only'}]};
  assert.match(readiness(existing,{...approved,matchId:null}),/Choose the existing/);
  assert.equal(readiness(existing,{...approved,matchId:'bank'}),'Snapshot is read-only');
  assert.equal(readiness(existing,{...approved,matchId:'bank',preference:'Keep existing'}),null);
});
test('the queue refuses duplicate targets and completed records but allows a failed item to retry',()=>{
  const existing={...item,matches:[{id:'bank',applyToken:'signed',applyBlocked:null}]};
  const choice={...approved,matchId:'bank'};
  assert.match(queueProblem([existing,{...existing,id:'second'}],{new:choice,second:choice},{}),/same bank question/);
  assert.match(readiness(item,approved,{status:'success',message:'Done'}),/Already completed/);
  assert.equal(readiness(item,approved,{status:'error',message:'Retry'}),null);
  assert.equal(completed({status:'kept',message:'Kept'}),true);
});

test('combining a stimulus requires per-question confirmation even in bulk',()=>{
 const q={...item,matches:[{id:'bank',applyToken:'signed',applyBlocked:null,requiresStimulusConfirmation:true}]};
 const choice={...approved,matchId:'bank'};
 assert.match(readiness(q,choice),/stimulus/);
 assert.equal(readiness(q,{...choice,stimulusIncluded:true}),null);
 assert.equal(readiness(q,{...choice,preference:'Keep existing'}),null);
});

test('new metadata-free questions require an explicit section while known domains supply it',()=>{
 assert.match(readiness(item,{...approved,section:''}),/Choose Math/);
 const known={...item,imported:{question:{taxonomy:{domain_name:'Algebra',skill_name:null}}}};
 assert.equal(readiness(known,{...approved,section:''}),null);
});

test('confirmed false positives insert new questions without replacement eligibility',()=>{
 const q={...item,matches:[{id:'bank',applyToken:null,applyBlocked:'Answers differ'}]};
 assert.equal(readiness(q,{...approved,importAsNew:true}),null);
 assert.match(readiness({...q,insertToken:null},{...approved,importAsNew:true}),/cannot be inserted/);
 assert.equal(queueProblem([q,{...q,id:'second'}],{new:{...approved,importAsNew:true,matchId:'bank'},second:{...approved,importAsNew:true,matchId:'bank'}},{}),null);
});

test('batch approval skips editing holds, unresolved duplicates and completed items',async()=>{
 const {approveBatch}=await import('./queue.ts');
 const known={...item,difficulty:2,imported:{question:{taxonomy:{domain_name:'Algebra',skill_name:'Linear functions'}}}};
 const qs=[known,{...known,id:'edit'},{...known,id:'duplicate',matches:[{id:'bank',applyToken:'signed',applyBlocked:null}]},{...known,id:'done'},{...known,id:'dismissed',matches:[{id:'bank',applyToken:null,applyBlocked:'Answers differ'}]},{...known,id:'noanswer',hasAnswer:false}];
 const choices=Object.fromEntries(qs.map(q=>[q.id,{...initialChoice(),selected:true}]));
 choices.edit.preference='Needs editing';choices.dismissed.importAsNew=true;
 const result=approveBatch(qs,choices,{done:{status:'success',message:'Done'}},{destination:'regular',batchId:'',publish:true,section:'RW'});
 assert.deepEqual(result.approved,['new','dismissed']);
 assert.deepEqual(result.skipped,['edit','duplicate','noanswer']);
 assert.equal(result.choices.new.confirmed,true);assert.equal(result.choices.new.section,'M');
 assert.equal(result.choices.edit.preference,'Needs editing');assert.equal(result.choices.duplicate.importAsNew,false);
 assert.equal(result.choices.duplicate.selected,false);assert.equal(result.choices.done.confirmed,false);
});
