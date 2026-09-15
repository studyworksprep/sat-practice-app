import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionFromDomain} from './section.ts';
test('known domains determine section without guessing for missing taxonomy',()=>{
 assert.equal(sectionFromDomain('Algebra'),'M');
 assert.equal(sectionFromDomain('Craft and Structure'),'RW');
 for(const value of [null,'','Unknown'])assert.equal(sectionFromDomain(value),null);
});
