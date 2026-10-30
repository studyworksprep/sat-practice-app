import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { assertEmptyTarget, assertAuthColumns, copyFingerprints, compareFingerprints } from './supabase-east-restore.mjs';

test('restore refuses existing application tables, accounts, or files', () => {
  const empty={tables:[],auth_users:0,storage:[]};
  assert.doesNotThrow(() => assertEmptyTarget(empty));
  for(const state of [
    {...empty,tables:[{schema:'public',name:'profiles'}]},
    {...empty,tables:[{schema:'_legacy',name:'questions'}]},
    {...empty,tables:[{schema:'supabase_migrations',name:'schema_migrations'}]},
    {...empty,auth_users:1},
    {...empty,storage:[{objects:1}]},
  ]) assert.throws(() => assertEmptyTarget(state));
});

test('managed Auth schema changes must be reviewed before restoring', () => {
  const source={columns:[{table_schema:'auth',column_name:'id',data_type:'uuid'}]};
  assert.doesNotThrow(() => assertAuthColumns(source,structuredClone(source)));
  assert.throws(() => assertAuthColumns(source,{columns:[]}));
  assert.throws(() => assertAuthColumns(source,{columns:[{table_schema:'auth',column_name:'id',data_type:'text'}]}));
});

test('COPY comparison ignores row order but detects duplicates, changed bytes, columns, and sequence state', async () => {
  const dir=await mkdtemp(join(tmpdir(),'east-copy-test-'));
  try {
    const path=join(dir,'data.sql');
    const dump=(rows,columns='"id", "content"',seq=2) => `COPY "public"."questions" (${columns}) FROM stdin;\n${rows.join('\n')}\n\\.\nSELECT pg_catalog.setval('"public"."questions_id_seq"', ${seq}, true);\n`;
    const fingerprint=async(text) => {await writeFile(path,text);return copyFingerprints(path);};
    const rows=['1\t\\\\frac{1}{2}\\n-- quoted content — π','2\t{"value":"x"}'];
    const original=await fingerprint(dump(rows));
    assert.deepEqual(compareFingerprints(original,await fingerprint(dump([...rows].reverse()))),[]);
    assert.deepEqual(compareFingerprints(original,await fingerprint(dump([...rows,rows[0]]))),['public.questions']);
    assert.deepEqual(compareFingerprints(original,await fingerprint(dump([rows[0]+'x',rows[1]]))),['public.questions']);
    assert.deepEqual(compareFingerprints(original,await fingerprint(dump(rows,'"id", "different"'))),['public.questions']);
    assert.deepEqual(compareFingerprints(original,await fingerprint(dump(rows,undefined,3))),['sequence values']);
    await assert.rejects(fingerprint('COPY "public"."q" ("id") FROM stdin;\n1\n'),/Incomplete/);
  } finally {await rm(dir,{recursive:true,force:true});}
});
