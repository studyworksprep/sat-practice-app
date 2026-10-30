import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

test('retired migration CLIs reject candidate writes before credentials, snapshots, or network access',()=>{
 const cases=[
  ['restore',['/nonexistent-snapshot','--apply']],
  ['refresh',['/nonexistent-snapshot','--apply']],
  ['assets',['/nonexistent-snapshot','storage','--apply']],
  ['assets',['/nonexistent-snapshot','rewrite','--apply']],
  ['permissions',['--apply']],
  ['freeze',['/nonexistent-snapshot','--rehearse-target']],
 ];
 for(const [name,args] of cases){
  const file=fileURLToPath(new URL(`./supabase-east-${name}.mjs`,import.meta.url));
  const result=spawnSync(process.execPath,[file,...args],{encoding:'utf8',timeout:10000});
  assert.equal(result.status,1,name);
  assert.match(result.stderr,/Candidate mutation commands are retired/,name);
 }
});
