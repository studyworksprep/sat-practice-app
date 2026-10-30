import assert from 'node:assert/strict';
import test from 'node:test';
import { refreshTables } from './supabase-east-refresh.mjs';

const snapshot={tables:{'auth.users':{columns:'"id", "email"'},'public.questions':{columns:'"id", "stem"'}}};
const history={tables:{'supabase_migrations.schema_migrations':{columns:'"version"'}}};
test('refresh restricts the write set to exact existing COPY tables plus migration history',()=>{
 assert.deepEqual(refreshTables(snapshot,structuredClone(snapshot),history),['"auth"."users"','"public"."questions"','"supabase_migrations"."schema_migrations"']);
 assert.throws(()=>refreshTables(snapshot,{tables:{...snapshot.tables,'public.extra':{columns:'"id"'}}},history),/table set differs/);
 const changed=structuredClone(snapshot);changed.tables['auth.users'].columns='"id", "email", "extra"';
 assert.throws(()=>refreshTables(snapshot,changed,history),/columns differ/);
});
test('refresh rejects managed migration tables, unreviewed schemas, and unsafe identifiers',()=>{
 for(const name of ['auth.schema_migrations;DROP TABLE auth.users','supabase_migrations.schema_migrations','vault.secrets','public.a.b','public."unsafe"']){
  const data={tables:{[name]:{columns:'"id"'}}};
  assert.throws(()=>refreshTables(data,data,history),/Unexpected table identity/);
 }
 assert.throws(()=>refreshTables(snapshot,snapshot,{tables:{'supabase_migrations.extra':{columns:'"id"'}}}),/history tables/);
 for(const name of ['auth.schema_migrations','storage.migrations']){
  const data={tables:{[name]:{columns:'"version"'}}};
  assert.throws(()=>refreshTables(data,data,history),/platform migration tables/);
 }
});
