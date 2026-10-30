#!/usr/bin/env node
// Build a temporary write-freeze bridge and a durable source write guard.
// The CLI only plans or rehearses on the candidate; it cannot freeze production.
import { join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PRIVATE_DIR,project,query,migrationConnection,processEnv,run,assertCandidateWritePhase } from './supabase-east-migration.mjs';
import { checkpoint,copyFingerprints } from './supabase-east-restore.mjs';

const SCHEMA='_studyworks_east_cutover';
const TRIGGER='studyworks_east_cutover_readonly';
export function freezeTables(names){
 if(!names.length||new Set(names).size!==names.length)throw new Error('Freeze requires a unique nonempty table list.');
 return names.sort().map(name=>{
  const parts=name.split('.');
  if(parts.length!==2||!['public','_legacy','auth','storage','supabase_migrations'].includes(parts[0])||parts.some(p=>!/^[_a-z][_a-z0-9]*$/.test(p)))throw new Error('Unexpected freeze table identity.');
  return parts.map(p=>`"${p}"`).join('.');
 });
}

export function freezeSql(names){
 const tables=freezeTables([...names]);
 // After cutover, guard the actual application data, Auth user records,
 // and final Storage metadata. Leave platform-owned OAuth/session internals
 // alone: some newer managed tables allow CREATE TRIGGER but not DROP.
 // The transient lock still covers the complete snapshot while copying it.
 const guarded=names.filter(n=>['public','_legacy','supabase_migrations'].includes(n.split('.')[0])||['auth.users','storage.objects','storage.buckets'].includes(n));
 const guardTables=freezeTables(guarded);
 return {
  guardedTables:guarded.length,
  // Hold in one dedicated connection until the snapshot/file copy completes.
  // Ordinary reads and pg_dump remain possible. If this connection is lost,
  // abandon that snapshot and do not proceed with the production switch.
  lock:`LOCK TABLE ${tables.join(', ')} IN SHARE MODE;`,
  // Install only AFTER the final export, while still holding the locks in
  // that same transaction, so these guards never enter the east restore.
  install:`CREATE SCHEMA "${SCHEMA}" AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA "${SCHEMA}" FROM PUBLIC;
CREATE FUNCTION "${SCHEMA}".reject_writes() RETURNS trigger LANGUAGE plpgsql SET search_path=pg_catalog AS $freeze$
BEGIN RAISE SQLSTATE 'PT503' USING MESSAGE='This database has moved. Reload Studyworks and sign in again.'; END;
$freeze$;
REVOKE ALL ON FUNCTION "${SCHEMA}".reject_writes() FROM PUBLIC;
${guardTables.map(t=>`CREATE TRIGGER "${TRIGGER}" BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON ${t} FOR EACH STATEMENT EXECUTE FUNCTION "${SCHEMA}".reject_writes();`).join('\n')}`,
  // No CASCADE: rollback must remove precisely the known guard objects.
  release:`${guardTables.map(t=>`DROP TRIGGER "${TRIGGER}" ON ${t};`).join('\n')}
DROP FUNCTION "${SCHEMA}".reject_writes();
DROP SCHEMA "${SCHEMA}";`,
 };
}

async function main(){
 const args=process.argv.slice(2);
 if(args.length<1||args.length>2||args[0].startsWith('--')||(args[1]&&args[1]!=='--rehearse-target'))throw new Error('Usage: node --env-file=<private access.env> scripts/supabase-east-freeze.mjs <backup-dir> [--rehearse-target]');
 if(args[1]==='--rehearse-target')assertCandidateWritePhase();
 const cp=await checkpoint(args[0]);await project('target');
 const data=await copyFingerprints(join(cp.dir,'data.sql'));
 const names=[...Object.keys(data.tables),'supabase_migrations.schema_migrations'];
 const sql=freezeSql(names);
 const state=await query('target',`SELECT json_build_object('existing_guard_schema',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='${SCHEMA}'));`);
 if(state.existing_guard_schema)throw new Error('An existing cutover guard needs review before rehearsing.');
 console.log(JSON.stringify({phase:'candidate write-freeze rehearsal',tables:names.length,source_modified:false,rehearse:args[1]==='--rehearse-target'}));
 if(args[1]!=='--rehearse-target')return;
 const probes=[
  'UPDATE auth.users SET updated_at=updated_at WHERE false',
  'UPDATE storage.objects SET name=name WHERE false',
  'UPDATE public.profiles SET id=id WHERE false',
 ].map(statement=>`DO $probe$ BEGIN BEGIN ${statement}; RAISE EXCEPTION 'Write guard did not fire'; EXCEPTION WHEN SQLSTATE 'PT503' THEN NULL; END; END $probe$;`).join('\n');
 const pg=await migrationConnection('target');
 pg.PGOPTIONS='-c statement_timeout=30000 -c lock_timeout=5000 -c timezone=UTC';
 pg.PGAPPNAME='east-candidate-durable-freeze-rehearsal';
 // Everything, including create/drop permissions on managed tables, is
 // checked in a rolled-back transaction. No guard is left on the candidate.
 await run('psql',['-X','-w','-q','--set','ON_ERROR_STOP=1'],{env:processEnv(pg),outputFile:join(PRIVATE_DIR,`freeze-rehearsal-phases-${Date.now()}.log`),input:`BEGIN; SET LOCAL ROLE postgres;\n${sql.lock}\n${sql.install}\nSELECT 'guards_installed';\n${probes}\nSELECT 'probes_passed';\nSELECT count(*) FROM public.profiles;\n${sql.release}\nSELECT 'guards_removed';\nROLLBACK;`});
 const final=await query('target',`SELECT json_build_object('guard_schema_remaining',EXISTS(SELECT 1 FROM pg_namespace WHERE nspname='${SCHEMA}'),'guard_triggers_remaining',(SELECT count(*) FROM pg_trigger WHERE tgname='${TRIGGER}'));`);
 if(final.guard_schema_remaining||final.guard_triggers_remaining)throw new Error('Candidate guard cleanup verification failed.');
 console.log(JSON.stringify({tables_locked:names.length,durable_guard_tables:sql.guardedTables,auth_user_storage_application_writes_blocked:true,guard_create_and_drop_permissions_verified:true,candidate_guard_objects_remaining:0,source_modified:false,passed:true}));
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))main().catch(error=>{console.error(error.message);process.exitCode=1;});
