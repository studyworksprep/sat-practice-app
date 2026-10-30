import assert from 'node:assert/strict';
import test from 'node:test';
import { permissionPlan,normalizedGrants } from './supabase-east-permissions.mjs';
const owner={grantee:'postgres',privilege:'EXECUTE',grantable:false};
const auth={grantee:'authenticated',privilege:'EXECUTE',grantable:false};
const anon={grantee:'anon',privilege:'EXECUTE',grantable:false};
const fixture=(grants)=>({column_acl_count:0,objects:[{kind:'FUNCTION',identity:'public.private_stats(p_user uuid)',owner:'postgres',grants}]});

test('permission plan revokes destination defaults and replays only source grants',()=>{
 const plan=permissionPlan(fixture([owner,auth]),fixture([owner,auth,anon]));
 assert.equal(plan.changes.length,1);
 assert.match(plan.sql,/REVOKE ALL PRIVILEGES ON FUNCTION public.private_stats\(p_user uuid\) FROM "anon", "authenticated";/);
 assert.match(plan.sql,/GRANT EXECUTE .* TO "authenticated";/);
 assert.doesNotMatch(plan.sql,/GRANT .* TO "anon"/);
 assert.doesNotMatch(plan.sql,/FROM .*"postgres"/);
 assert.equal(permissionPlan(fixture([owner,auth]),fixture([owner,auth])).changes.length,0);
});

test('privilege comparisons deduplicate grants and retain effective grant options',()=>{
 assert.deepEqual(normalizedGrants([auth,{...auth,grantable:true},auth]),[{...auth,grantable:true}]);
 const plan=permissionPlan(fixture([owner,{...auth,grantable:true}]),fixture([owner,auth]));
 assert.match(plan.sql,/WITH GRANT OPTION/);
});

test('schema/ownership and column privilege changes stop automatic reconciliation',()=>{
 assert.throws(()=>permissionPlan(fixture([owner]),{...fixture([owner]),objects:[]}));
 assert.throws(()=>permissionPlan(fixture([owner]),{...fixture([owner]),column_acl_count:1}));
 assert.throws(()=>permissionPlan(fixture([owner]),fixture([{...owner,grantable:true}])));
 assert.throws(()=>normalizedGrants([{...anon,privilege:'EXECUTE; DROP SCHEMA public CASCADE'}]));
});
