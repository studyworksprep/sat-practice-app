import assert from 'node:assert/strict';
import test from 'node:test';
import { freezeTables,freezeSql } from './supabase-east-freeze.mjs';
test('freeze requires known schemas and safely quoted exact table identities',()=>{
 assert.deepEqual(freezeTables(['storage.objects','auth.users']),['"auth"."users"','"storage"."objects"']);
 for(const names of [[],['public.a','public.a'],['vault.secrets'],['public.a;drop'],['public.a.b']])assert.throws(()=>freezeTables(names));
});
test('durable freeze covers all write operations and has an exact noncascading undo',()=>{
 const sql=freezeSql(['public.profiles','auth.users']);
 assert.match(sql.lock,/IN SHARE MODE;/);
 assert.equal((sql.install.match(/BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE/g)??[]).length,2);
 assert.match(sql.install,/SQLSTATE 'PT503'/);
 assert.equal((sql.release.match(/DROP TRIGGER/g)??[]).length,2);
 assert.doesNotMatch(sql.release,/CASCADE/);
 assert.doesNotMatch(sql.install,/SECURITY DEFINER/);
 const managed=freezeSql(['auth.custom_oauth_providers','auth.users','public.profiles']);
 assert.match(managed.lock,/custom_oauth_providers/);
 assert.doesNotMatch(managed.install,/custom_oauth_providers/);
 assert.equal(managed.guardedTables,2);
});
