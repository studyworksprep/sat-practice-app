#!/usr/bin/env node
// Replace only the non-production east candidate's data. No source writes,
// deployment changes, schema drops, or cascading truncation are permitted.
import { readFile,writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PROJECTS,PRIVATE_DIR,INVENTORY_SQL,project,query,migrationConnection,processEnv,run,assertCandidateWritePhase } from './supabase-east-migration.mjs';
import { checkpoint,dumpTarget,copyFingerprints,assertAuthColumns,verify } from './supabase-east-restore.mjs';

// Exact schema dumps reviewed after the initial restore and ACL correction.
// The destination differs only in grant ordering and PostgreSQL 17.11's
// associative-AND rendering of two checked score constraints. Stop on any
// further DDL drift; do not broadly normalize SQL or ignore new differences.
export const REVIEWED_SOURCE_SCHEMA='026fa16ebe6ab8c54e5db60d99026c4964700f34d79159ecb9762e11e0a59400';
export const REVIEWED_TARGET_SCHEMA='e47ac682f04a637de368079821581c5bb547d5ee748b7c14cb665692ed02e913';

export function refreshTables(source,current,history){
 const names=Object.keys(source.tables).sort();
 if(JSON.stringify(names)!==JSON.stringify(Object.keys(current.tables).sort()))throw new Error('Candidate COPY table set differs from the source snapshot.');
 if(JSON.stringify(Object.keys(history.tables))!==JSON.stringify(['supabase_migrations.schema_migrations']))throw new Error('Unexpected migration-history tables.');
 for(const name of names){
  const parts=name.split('.');
  if(['auth.schema_migrations','storage.migrations'].includes(name))throw new Error('Managed platform migration tables must never be refreshed.');
  if(parts.length!==2||!['public','_legacy','auth','storage'].includes(parts[0])||parts.some(p=>!/^[_a-z][_a-z0-9]*$/.test(p)))throw new Error('Unexpected table identity in data export.');
  if(source.tables[name].columns!==current.tables[name].columns)throw new Error('Candidate COPY columns differ from the source snapshot.');
 }
 return [...names,'supabase_migrations.schema_migrations'].map(n=>n.split('.').map(p=>`"${p}"`).join('.'));
}

async function main(){
 const args=process.argv.slice(2);
 if(args.length<1||args.length>2||args[0].startsWith('--')||(args[1]&&args[1]!=='--apply'))throw new Error('Usage: node --env-file=<private access.env> scripts/supabase-east-refresh.mjs <backup-dir> [--apply]');
 if(args[1]==='--apply')assertCandidateWritePhase();
 const cp=await checkpoint(args[0]);
 await project('target');
 if(cp.manifest.files['schema.sql']!==REVIEWED_SOURCE_SCHEMA)throw new Error('Source schema changed; review and rehearse the new schema before refreshing.');
 const schemaFile=await dumpTarget(cp,'schema');
 const schemaHash=createHash('sha256').update(await readFile(schemaFile)).digest('hex');
 if(schemaHash!==REVIEWED_TARGET_SCHEMA)throw new Error('Candidate schema or grants changed since review.');
 const inventory=await query('target',INVENTORY_SQL);
 assertAuthColumns(cp.inventory.source.inventory,inventory);
 // Keep a private copy of candidate activity before replacing it, and use
 // its COPY headers to guard the managed Auth/Storage column sets.
 const previousData=await dumpTarget(cp,'data');
 const previousHistory=await dumpTarget(cp,'history-data');
 const [source,current,history,currentHistory]=await Promise.all([
  copyFingerprints(join(cp.dir,'data.sql')),copyFingerprints(previousData),
  copyFingerprints(join(cp.dir,'history-data.sql')),copyFingerprints(previousHistory),
 ]);
 const tables=refreshTables(source,current,history);
 if(history.tables['supabase_migrations.schema_migrations'].columns!==currentHistory.tables['supabase_migrations.schema_migrations']?.columns)throw new Error('Migration-history columns differ.');
 const incomingForeignKeys=await query('target',`SELECT coalesce(jsonb_agg(jsonb_build_object('referencing',conrelid::regclass::text,'referenced',confrelid::regclass::text)),'[]'::jsonb)
 FROM pg_constraint WHERE contype='f' AND confrelid IN (${tables.map(t=>`'${t}'::regclass`).join(',')}) AND conrelid NOT IN (${tables.map(t=>`'${t}'::regclass`).join(',')});`);
 if(incomingForeignKeys.length)throw new Error('Foreign keys from tables outside the refresh require review; cascading truncation is forbidden.');
 console.log(JSON.stringify({phase:'candidate data refresh',source:PROJECTS.source.ref,target:PROJECTS.target.ref,snapshot:cp.dir,tables:tables.length,sourceSchemaReviewed:true,targetSchemaReviewed:true,candidateBackupSaved:true,apply:args[1]==='--apply'}));
 if(args[1]!=='--apply')return;
 const pg=await migrationConnection('target');
 pg.PGOPTIONS='-c statement_timeout=0 -c lock_timeout=5000 -c timezone=UTC';
 pg.PGAPPNAME='studyworks-east-refresh-candidate-only';
 // A single transaction with RESTRICT (the default) preserves the previous
 // candidate on any COPY/constraint error. Never truncate managed migration
 // tables or extend the write set through CASCADE.
 // Managed Auth sequences belong to supabase_auth_admin. CONTINUE IDENTITY
 // avoids an ownership-only reset; the export's setval statements restore
 // exact source sequence state, which the subsequent fingerprint check verifies.
 const guard=`SET ROLE postgres; SET LOCAL session_replication_role=replica; TRUNCATE TABLE ${tables.join(', ')} CONTINUE IDENTITY RESTRICT;`;
 await run('psql',['-X','-w','--quiet','--single-transaction','--set','ON_ERROR_STOP=1','--command',guard,'--file',join(cp.dir,'data.sql'),'--file',join(cp.dir,'history-data.sql')],{env:processEnv(pg)});
 await verify(cp);
 const finalSchema=await dumpTarget(cp,'schema');
 if(createHash('sha256').update(await readFile(finalSchema)).digest('hex')!==REVIEWED_TARGET_SCHEMA)throw new Error('Candidate schema changed during data refresh.');
 const report={verified_at:new Date().toISOString(),source:PROJECTS.source.ref,target:PROJECTS.target.ref,snapshot:cp.dir,tables:tables.length,candidate_backup:[previousData,previousHistory],source_modified:false,passed:true};
 await writeFile(join(cp.dir,`refresh-verification-${Date.now()}.json`),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify(report));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
