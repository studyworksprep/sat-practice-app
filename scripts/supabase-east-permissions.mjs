#!/usr/bin/env node
// Supabase project defaults can add grants during object creation. pg_dump's
// additive ACL restore does not necessarily remove them. Reconcile exact
// effective grants on the new target, without changing the source.
import { writeFile } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVATE_DIR,project,query,migrationConnection,processEnv,run } from './supabase-east-migration.mjs';

export const ACL_SQL=`
WITH objects AS (
 SELECT 'SCHEMA'::text AS kind,format('%I',n.nspname) AS identity,n.nspowner AS owner,n.nspacl AS acl,'n'::"char" AS default_kind
 FROM pg_namespace n WHERE n.nspname IN ('public','_legacy')
 UNION ALL
 SELECT CASE WHEN c.relkind='S' THEN 'SEQUENCE' ELSE 'TABLE' END,
   format('%I.%I',n.nspname,c.relname),c.relowner,c.relacl,CASE WHEN c.relkind='S' THEN 's'::"char" ELSE 'r'::"char" END
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('public','_legacy') AND c.relkind IN ('r','p','v','m','f','S')
 UNION ALL
 SELECT 'FUNCTION',format('%I.%I(%s)',n.nspname,p.proname,pg_get_function_identity_arguments(p.oid)),p.proowner,p.proacl,'f'::"char"
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname IN ('public','_legacy') AND p.prokind='f'
 UNION ALL
 SELECT 'TYPE',format('%I.%I',n.nspname,t.typname),t.typowner,t.typacl,'T'::"char"
 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
 WHERE n.nspname IN ('public','_legacy') AND t.typtype IN ('e','d','r','m')
)
SELECT jsonb_build_object(
 'objects',(SELECT coalesce(jsonb_agg(jsonb_build_object(
   'kind',o.kind,'identity',o.identity,'owner',pg_get_userbyid(o.owner),
   'grants',(SELECT coalesce(jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type),'[]'::jsonb)
     FROM aclexplode(coalesce(o.acl,acldefault(o.default_kind,o.owner))) a)
 ) ORDER BY o.kind,o.identity),'[]'::jsonb) FROM objects o),
 'column_acl_count',(SELECT count(*) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','_legacy') AND a.attnum>0 AND NOT a.attisdropped AND a.attacl IS NOT NULL)
);`;

const PRIVILEGES=new Set(['SELECT','INSERT','UPDATE','DELETE','TRUNCATE','REFERENCES','TRIGGER','MAINTAIN','USAGE','EXECUTE','CREATE']);
const KINDS=new Set(['SCHEMA','TABLE','SEQUENCE','FUNCTION','TYPE']);
const quote=(value)=>`"${value.replaceAll('"','""')}"`;
const role=(value)=>value==='PUBLIC'?'PUBLIC':quote(value);
const key=(o)=>`${o.kind}:${o.identity}`;

export function normalizedGrants(entries){
 const result=new Map();
 for(const entry of entries){
  if(!PRIVILEGES.has(entry.privilege)||typeof entry.grantee!=='string'||typeof entry.grantable!=='boolean')throw new Error('Unexpected privilege metadata.');
  const id=`${entry.grantee}\0${entry.privilege}`;
  const previous=result.get(id);
  result.set(id,{grantee:entry.grantee,privilege:entry.privilege,grantable:entry.grantable||previous?.grantable||false});
 }
 return [...result.values()].sort((a,b)=>`${a.grantee}\0${a.privilege}`.localeCompare(`${b.grantee}\0${b.privilege}`));
}

export function permissionPlan(source,target){
 if(source.column_acl_count||target.column_acl_count)throw new Error('Column-specific privileges require a separate review.');
 const existing=new Map(target.objects.map(o=>[key(o),o]));
 if(source.objects.length!==target.objects.length)throw new Error('Object counts differ; privilege reconciliation cannot change the schema.');
 const changes=[];const sql=[];
 for(const expected of source.objects){
  if(!KINDS.has(expected.kind))throw new Error('Unexpected object kind.');
  const current=existing.get(key(expected));
  if(!current||current.owner!==expected.owner)throw new Error('Object identity or owner differs.');
  const want=normalizedGrants(expected.grants),have=normalizedGrants(current.grants);
  if(isDeepStrictEqual(want,have))continue;
  // Preserve the owner's own ACL and all ownership semantics.
  if(!isDeepStrictEqual(want.filter(g=>g.grantee===expected.owner),have.filter(g=>g.grantee===expected.owner)))throw new Error('Owner privileges differ; review before reconciling.');
  const roles=[...new Set([...want,...have].map(g=>g.grantee).filter(r=>r!==expected.owner))].sort();
  if(roles.length)sql.push(`REVOKE ALL PRIVILEGES ON ${expected.kind} ${expected.identity} FROM ${roles.map(role).join(', ')};`);
  for(const grant of want.filter(g=>g.grantee!==expected.owner)){
   if(grant.grantee==='PUBLIC'&&grant.grantable)throw new Error('PUBLIC cannot hold grant options.');
   sql.push(`GRANT ${grant.privilege} ON ${expected.kind} ${expected.identity} TO ${role(grant.grantee)}${grant.grantable?' WITH GRANT OPTION':''};`);
  }
  changes.push({kind:expected.kind,identity:expected.identity,before:have,after:want});
 }
 return {changes,sql:sql.join('\n')};
}

async function main(){
 const args=process.argv.slice(2);
 if(args.length>1||(args[0]&&args[0]!=='--apply'))throw new Error('Usage: node --env-file=<private access.env> scripts/supabase-east-permissions.mjs [--apply]');
 await Promise.all([project('source'),project('target')]);
 const [source,target]=await Promise.all([query('source',ACL_SQL),query('target',ACL_SQL)]);
 const plan=permissionPlan(source,target);
 const path=join(PRIVATE_DIR,`permission-reconciliation-${Date.now()}.json`);
 await writeFile(path,JSON.stringify({source,target,plan},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({objects_compared:source.objects.length,objects_with_grant_differences:plan.changes.length,changed_kinds:plan.changes.reduce((a,c)=>({...a,[c.kind]:(a[c.kind]??0)+1}),{}),column_acl_count:source.column_acl_count,apply:args[0]==='--apply',private_plan:path}));
 if(args[0]!=='--apply'||!plan.changes.length)return;
 const pg=await migrationConnection('target');pg.PGOPTIONS='-c statement_timeout=120000 -c lock_timeout=5000';pg.PGAPPNAME='studyworks-east-permission-reconciliation-target';
 await run('psql',['-X','-w','--quiet','--set','ON_ERROR_STOP=1'],{env:processEnv(pg),input:`BEGIN; SET LOCAL ROLE postgres;\n${plan.sql}\nCOMMIT;`});
 const final=await query('target',ACL_SQL);
 const remaining=permissionPlan(source,final);
 if(remaining.changes.length)throw new Error('Destination grants still differ from the source.');
 const report={verified_at:new Date().toISOString(),objects:source.objects.length,reconciled:plan.changes.length,remaining_differences:0,source_modified:false,passed:true};
 await writeFile(join(PRIVATE_DIR,`permission-verification-${Date.now()}.json`),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(report));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
