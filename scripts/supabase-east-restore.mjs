#!/usr/bin/env node
// Restore only into the fixed, newly created east project. Production source
// access is read-only and lives in the preparation tool. No deployment switch.
import { createReadStream } from 'node:fs';
import { readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createInterface } from 'node:readline';
import { join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PROJECTS, PRIVATE_DIR, INVENTORY_SQL, project, query, migrationConnection,
  processEnv, run, stripPlaceholderConnection,
} from './supabase-east-migration.mjs';

const FILES = ['roles.sql','schema.sql','data.sql','history-schema.sql','history-data.sql','managed-objects.sql','inventory.json'];

async function shaFile(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

export function assertEmptyTarget(inventory) {
  if (inventory.tables.some((t) => ['public','_legacy','supabase_migrations'].includes(t.schema)) || inventory.auth_users || inventory.storage.some((b) => b.objects)) {
    throw new Error('Destination contains application data; automatic restore refuses to overwrite it.');
  }
}

export function assertAuthColumns(source, target) {
  const columns = (inventory) => inventory.columns.filter((c) => c.table_schema === 'auth');
  if (JSON.stringify(columns(source)) !== JSON.stringify(columns(target))) {
    throw new Error('Managed Auth columns differ; review schema compatibility before restore.');
  }
}

export async function copyFingerprints(path) {
  const tables = {};
  const sequences = [];
  let table = null;
  let hashes = [];
  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    if (table) {
      if (line === '\\.') {
        hashes.sort();
        tables[table.key] = { columns: table.columns, rows: hashes.length, sha256: createHash('sha256').update(hashes.join('')).digest('hex') };
        table = null; hashes = [];
      } else hashes.push(createHash('sha256').update(line).digest('hex'));
      continue;
    }
    const match = line.match(/^COPY "([^"]+)"\."([^"]+)" \((.*)\) FROM stdin;$/);
    if (match) table = { key: `${match[1]}.${match[2]}`, columns: match[3] };
    else if (/^COPY /.test(line)) throw new Error('Unexpected COPY header; fingerprint parser needs review.');
    else if (/^SELECT pg_catalog\.setval\(/.test(line)) sequences.push(line);
  }
  if (table) throw new Error('Incomplete COPY data in export.');
  if (!Object.keys(tables).length) throw new Error('No COPY tables in export.');
  return { tables, sequences: sequences.sort() };
}

export function compareFingerprints(source, target) {
  const differences = [];
  for (const name of new Set([...Object.keys(source.tables), ...Object.keys(target.tables)])) {
    if (JSON.stringify(source.tables[name]) !== JSON.stringify(target.tables[name])) differences.push(name);
  }
  if (JSON.stringify(source.sequences) !== JSON.stringify(target.sequences)) differences.push('sequence values');
  return differences.sort();
}

async function checkpoint(dir) {
  const actual = await realpath(dir);
  const base = await realpath(PRIVATE_DIR);
  if (!actual.startsWith(base + sep)) throw new Error('Backup must be inside the private migration directory.');
  const manifest = JSON.parse(await readFile(join(actual, 'manifest.json'),'utf8'));
  if (manifest.source.ref !== PROJECTS.source.ref || manifest.target.ref !== PROJECTS.target.ref) throw new Error('Backup project identities do not match.');
  if (!/^postgres@sha256:[a-f0-9]{64}$/.test(manifest.image)) throw new Error('Backup does not pin an official PostgreSQL client image.');
  for (const file of FILES) {
    if (await shaFile(join(actual, file)) !== manifest.files[file]) throw new Error(`Backup checksum failed: ${file}`);
  }
  const inventory = JSON.parse(await readFile(join(actual,'inventory.json'),'utf8'));
  return { dir: actual, manifest, inventory };
}

async function dumpTarget(checkpoint, name) {
  const pgEnv = await migrationConnection('target');
  pgEnv.PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=0 -c lock_timeout=5000 -c timezone=UTC';
  const script = stripPlaceholderConnection(await readFile(join(PRIVATE_DIR, `official-${name}-dump.sh`),'utf8'));
  const path = join(checkpoint.dir, `target-${name}-${Date.now()}.sql`);
  await run('docker', ['run','--rm','--interactive',...Object.keys(pgEnv).flatMap((key) => ['--env',key]),checkpoint.manifest.image,'sh','-se'], {
    input: script, env: processEnv(pgEnv), outputFile: path,
  });
  return path;
}

async function verify(cp) {
  console.log('Exporting destination data read-only for a comparison against the source snapshot...');
  const targetData = await dumpTarget(cp,'data');
  const targetHistory = await dumpTarget(cp,'history-data');
  const [source, target, historySource, historyTarget] = await Promise.all([
    copyFingerprints(join(cp.dir,'data.sql')), copyFingerprints(targetData),
    copyFingerprints(join(cp.dir,'history-data.sql')), copyFingerprints(targetHistory),
  ]);
  const inventory = await query('target', INVENTORY_SQL);
  const differences = [...compareFingerprints(source,target), ...compareFingerprints(historySource,historyTarget)];
  const original = cp.inventory.source.inventory;
  if (JSON.stringify(original.policies) !== JSON.stringify(inventory.policies)) differences.push('policy definitions');
  if (JSON.stringify(original.custom_managed_triggers) !== JSON.stringify(inventory.custom_managed_triggers)) differences.push('managed trigger definitions');
  const tableShape = (i) => i.tables.filter((t) => ['public','_legacy'].includes(t.schema)).map(({ schema,name,rls,force_rls }) => ({ schema,name,rls,force_rls }));
  if (JSON.stringify(tableShape(original)) !== JSON.stringify(tableShape(inventory))) differences.push('application tables/RLS');
  assertAuthColumns(original,inventory);
  const report = {
    verified_at: new Date().toISOString(), source: PROJECTS.source.ref, target: PROJECTS.target.ref,
    snapshot: cp.dir, application_tables: tableShape(inventory).length,
    auth_users: inventory.auth_users, policies: inventory.policies.length,
    data_tables_compared: Object.keys(source.tables).length,
    data_rows_compared: Object.values(source.tables).reduce((sum,t) => sum+t.rows,0),
    differences, passed: differences.length === 0,
  };
  await writeFile(join(cp.dir, `restore-verification-${Date.now()}.json`),JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify(report,null,2));
  if (differences.length) throw new Error('Restored destination differs from the export; review private verification artifacts before proceeding.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2 || args[0].startsWith('--') || (args[1] && !['--apply','--verify'].includes(args[1]))) {
    throw new Error('Usage: node --env-file=<private access.env> scripts/supabase-east-restore.mjs <backup-dir> [--apply | --verify]\nDefault: review the restore plan without changing data.');
  }
  const cp = await checkpoint(args[0]);
  const identity = await project('target');
  if (identity.ref !== PROJECTS.target.ref || identity.region !== PROJECTS.target.region) throw new Error('Unexpected destination project.');
  if (args[1] === '--verify') { await verify(cp); return; }
  const target = await query('target',INVENTORY_SQL);
  assertEmptyTarget(target);
  assertAuthColumns(cp.inventory.source.inventory,target);
  const data = await copyFingerprints(join(cp.dir,'data.sql'));
  console.log(JSON.stringify({
    phase:'restore rehearsal',source:PROJECTS.source.ref,target:identity,
    application_tables:cp.inventory.source.inventory.tables.filter((t) => ['public','_legacy'].includes(t.schema)).length,
    auth_users:cp.inventory.source.inventory.auth_users,
    rows_in_export:Object.values(data.tables).reduce((sum,t) => sum+t.rows,0),
    checksums_verified:true,target_empty:true,auth_columns_match:true,apply:args[1]==='--apply',
  },null,2));
  if (args[1] !== '--apply') return;
  const pgEnv = await migrationConnection('target');
  // The only writable connection in this tool is hard-wired to the new target.
  pgEnv.PGOPTIONS = '-c statement_timeout=0 -c lock_timeout=5000 -c timezone=UTC';
  pgEnv.PGAPPNAME = 'studyworks-east-migration-restore-target';
  const files = ['roles.sql','schema.sql','history-schema.sql','data.sql','history-data.sql','managed-objects.sql'];
  const guard = `SET ROLE postgres; DO $guard$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','_legacy','supabase_migrations') AND c.relkind IN ('r','p'))
      OR EXISTS (SELECT 1 FROM auth.users) OR EXISTS (SELECT 1 FROM storage.objects)
    THEN RAISE EXCEPTION 'Destination is no longer empty'; END IF;
  END $guard$;`;
  console.log('Restoring into the empty east project in one transaction...');
  await run('psql', ['-X','-w','--quiet','--single-transaction','--set','ON_ERROR_STOP=1','--command',guard,...files.flatMap((name) => ['--file',join(cp.dir,name)])], { env: processEnv(pgEnv) });
  console.log('Restore transaction committed. Starting snapshot comparison.');
  await verify(cp);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode=1; });
}
