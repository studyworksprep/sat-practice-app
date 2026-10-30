#!/usr/bin/env node
// Preparation only: all database connections in this tool are read-only.
// Restore, settings changes, Storage writes, and production cutover are
// separate operations performed after the exported artifacts are reviewed.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, readFileSync, readdirSync } from 'node:fs';
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECTS = Object.freeze({
  source: { ref: 'noqtadytxyslkoetchrs', region: 'us-west-2' },
  target: { ref: 'yggbqwlvscuzuqqpwzpj', region: 'us-east-1' },
});
export const PRIVATE_DIR = '/private/tmp/studyworks-east-migration';
const USAGE = `Usage:
  node --env-file=/private/tmp/studyworks-east-migration/access.env \\
    scripts/supabase-east-migration.mjs <check-access | inventory | backup>

check-access  Validate both project identities and read-only DB connectivity.
inventory     Save schema/security metadata and exact table counts privately.
backup        Export roles, schema, data, history, and custom managed objects.

No command changes application data or the deployment. Without database
passwords, the tool requests Supabase-managed short-lived migration logins;
all queries/exports still enforce read-only mode. Backup requires the
official Supabase CLI dry-run scripts prepared in the private directory and
the official postgres:17-alpine Docker image. Credentials are never printed.
`;

export function connectionEnv(raw, side) {
  const project = PROJECTS[side];
  if (!project) throw new Error('Unknown migration side.');
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${side}: missing or invalid PostgreSQL URL.`); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || url.hash || url.pathname !== '/postgres') {
    throw new Error(`${side}: use a PostgreSQL connection URL for the postgres database.`);
  }
  const user = decodeURIComponent(url.username);
  const direct = url.hostname === `db.${project.ref}.supabase.co` && user === 'postgres';
  const pooler = new RegExp(`^aws-[0-9]+-${project.region}\\.pooler\\.supabase\\.com$`).test(url.hostname)
    && user === `postgres.${project.ref}`;
  if ((!direct && !pooler) || (url.port && url.port !== '5432')) {
    throw new Error(`${side}: URL must identify ${project.ref}, using a direct connection or Session pooler on port 5432.`);
  }
  for (const [key, value] of url.searchParams) {
    if (key !== 'sslmode' || !['require', 'verify-ca', 'verify-full'].includes(value)) {
      throw new Error(`${side}: unsupported connection parameter; only an SSL-enforcing sslmode is allowed.`);
    }
  }
  let password;
  try { password = decodeURIComponent(url.password); } catch { throw new Error(`${side}: password must be URL-encoded.`); }
  if (!password || password.includes('[YOUR-PASSWORD]')) throw new Error(`${side}: insert the database password in the URL.`);
  return {
    PGHOST: url.hostname, PGPORT: '5432', PGUSER: user,
    PGPASSWORD: password, PGDATABASE: 'postgres',
    PGSSLMODE: url.searchParams.get('sslmode') || 'require',
    PGCONNECT_TIMEOUT: '15', PGAPPNAME: 'studyworks-east-migration-readonly',
    PGOPTIONS: '-c default_transaction_read_only=on -c statement_timeout=120000 -c lock_timeout=5000 -c timezone=UTC',
  };
}

export function connectionHint(raw, side) {
  if (!PROJECTS[side]) throw new Error('Unknown migration side.');
  if (!raw?.trim()) return 'temporary';
  let url;
  try { url = new URL(raw); } catch { throw new Error(`${side}: invalid connection setting.`); }
  if (['postgres:', 'postgresql:'].includes(url.protocol)) {
    connectionEnv(raw, side);
    return 'password';
  }
  if (url.origin === `https://${PROJECTS[side].ref}.supabase.co` && url.pathname === '/' && !url.search && !url.hash && !url.username && !url.password) {
    return 'temporary';
  }
  throw new Error(`${side}: connection setting must identify the expected project.`);
}

export async function management(side, path = '', body) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('Missing SUPABASE_ACCESS_TOKEN in the private access.env file.');
  const response = await fetch(`https://api.supabase.com/v1/projects/${PROJECTS[side].ref}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30000),
  });
  const result = await response.json();
  if (!response.ok) {
    const missing = Array.isArray(result.missing_permissions) ? result.missing_permissions.filter((p) => /^[a-z_]+$/.test(p)).join(', ') : '';
    throw new Error(`${side}: management access returned HTTP ${response.status}${missing ? `; missing permissions: ${missing}` : ''}.`);
  }
  return result;
}

const temporaryConnections = new Map();
export async function migrationConnection(side) {
  const raw = process.env[side === 'source' ? 'SOURCE_DATABASE_URL' : 'TARGET_DATABASE_URL'];
  if (connectionHint(raw, side) === 'password') return connectionEnv(raw, side);
  const cached = temporaryConnections.get(side);
  if (cached && cached.expires > Date.now() + 60000) return { ...cached.env };
  const project = PROJECTS[side];
  const poolers = await management(side, '/config/database/pooler');
  const primary = poolers.find((p) => p.database_type === 'PRIMARY');
  if (!primary) throw new Error(`${side}: primary pooler configuration was not returned.`);
  // Reuse the strict project/host checks before requesting a login. Session
  // pooling uses 5432 even when the config URI describes transaction pooling.
  const env = connectionEnv(`postgresql://postgres.${project.ref}:placeholder@${primary.db_host}:5432/postgres`, side);
  // The read-only-user login cannot access managed Auth data. This is the
  // same short-lived migration login used by the CLI; database transactions
  // and pg_dump connections independently enforce read-only execution.
  const login = await management(side, '/cli/login-role', { read_only: false });
  if (login.role !== 'cli_login_postgres' || typeof login.password !== 'string' || !login.password || !Number.isFinite(login.ttl_seconds) || login.ttl_seconds <= 0 || login.ttl_seconds > 3600) {
    throw new Error(`${side}: unexpected temporary login response.`);
  }
  env.PGUSER = `${login.role}.${project.ref}`;
  env.PGPASSWORD = login.password;
  temporaryConnections.set(side, { env, expires: Date.now() + login.ttl_seconds * 1000 });
  console.log(`${side}: temporary migration login issued; expires in ${login.ttl_seconds}s. Queries and exports remain read-only.`);
  return { ...env };
}

export function stripPlaceholderConnection(script) {
  // Only remove known placeholder exports from inspected CLI --dry-run output.
  // Never interpolate credentials into a shell script or command-line argument.
  const expected = { PGHOST: '127.0.0.1', PGPORT: '5432', PGUSER: 'postgres', PGPASSWORD: '', PGDATABASE: 'postgres' };
  for (const [key, value] of Object.entries(expected)) {
    const line = `export ${key}="${value}"`;
    if (script.split('\n').filter((entry) => entry === line).length !== 1) {
      throw new Error('Unexpected official dump script connection block; review it before use.');
    }
    script = script.replace(`${line}\n`, '');
  }
  if (/^export PG[A-Z_]*=/m.test(script)) throw new Error('Unexpected connection override in dump script.');
  return script;
}

export function processEnv(pgEnv = {}) {
  // Avoid inherited libpq service/connection overrides.
  return { ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith('PG'))), ...pgEnv };
}

export async function run(executable, args, { input, env = process.env, outputFile } = {}) {
  const output = outputFile ? createWriteStream(outputFile, { flags: 'wx', mode: 0o600 }) : null;
  const child = spawn(executable, args, { env, stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '';
  let stderr = '';
  if (output) child.stdout.pipe(output);
  else child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const close = new Promise((res, rej) => { child.once('error', rej); child.once('close', res); });
  const written = output ? new Promise((res, rej) => { output.once('finish', res); output.once('error', rej); }) : Promise.resolve();
  child.stdin.on('error', () => {}); // An early subprocess exit is handled below.
  child.stdin.end(input ?? '');
  const code = await close;
  await written;
  if (code !== 0) {
    // psql errors can contain row values. Keep full errors private as well.
    const log = join(PRIVATE_DIR, `error-${Date.now()}.log`);
    for (const secret of [env.PGPASSWORD, process.env.SUPABASE_ACCESS_TOKEN].filter(Boolean)) {
      stderr = stderr.replaceAll(secret, '[redacted]');
    }
    await writeFile(log, stderr, { mode: 0o600 });
    throw new Error(`${executable} failed (exit ${code}); details saved privately in ${log}.`);
  }
  return stdout.trim();
}

export async function query(side, sql) {
  const env = processEnv(await migrationConnection(side));
  const text = await run('psql', ['--no-psqlrc', '--no-password', '--quiet', '--tuples-only', '--no-align', '--set', 'ON_ERROR_STOP=1'], { input: `BEGIN READ ONLY; SET LOCAL ROLE postgres;\n${sql}\nCOMMIT;`, env });
  return JSON.parse(text);
}

export async function project(side) {
  const expected = PROJECTS[side];
  const result = await management(side);
  if ((result.id ?? result.ref) !== expected.ref || result.region !== expected.region || result.status !== 'ACTIVE_HEALTHY') {
    throw new Error(`${side}: project identity, region, or health does not match the migration plan.`);
  }
  return { ref: expected.ref, region: result.region, name: result.name, status: result.status };
}

export const INVENTORY_SQL = `
select jsonb_build_object(
  'captured_at', now(),
  'postgres_version', current_setting('server_version'),
  'read_only', current_setting('transaction_read_only'),
  'database_bytes', pg_database_size(current_database()),
  'auth_users', (select count(*) from auth.users),
  'vault_secrets', (select count(*) from vault.secrets),
  'custom_estimators', (select count(*) from pg_operator o join pg_proc p on p.oid=o.oprrest where o.oid>=16384 and p.pronamespace <> 'pg_catalog'::regnamespace),
  'extensions', (select coalesce(jsonb_agg(to_jsonb(e)), '[]') from (select extname,extversion from pg_extension order by extname) e),
  'tables', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (
    select n.nspname as schema, c.relname as name, c.relrowsecurity as rls, c.relforcerowsecurity as force_rls,
      ((xpath('//row_count/text()',query_to_xml(format('select count(*) as row_count from %I.%I',n.nspname,c.relname),false,true,'')))[1]::text)::bigint as rows
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where c.relkind in ('r','p') and n.nspname in ('public','_legacy','auth','supabase_migrations')
    order by n.nspname,c.relname
  ) t),
  'columns', (select coalesce(jsonb_agg(to_jsonb(c)), '[]') from (
    select table_schema,table_name,column_name,ordinal_position,data_type,udt_name,is_nullable,column_default,is_generated,generation_expression
    from information_schema.columns where table_schema in ('public','_legacy','auth') order by table_schema,table_name,ordinal_position
  ) c),
  'policies', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from (select * from pg_policies where schemaname in ('public','_legacy','auth','storage') order by schemaname,tablename,policyname) p),
  'custom_managed_triggers', (select coalesce(jsonb_agg(to_jsonb(t)), '[]') from (
    select n.nspname as schema,c.relname as table_name,t.tgname as name,pg_get_triggerdef(t.oid) as definition
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
    where n.nspname in ('auth','storage') and pn.nspname not in ('auth','storage') and not t.tgisinternal order by 1,2,3
  ) t),
  'storage', (select coalesce(jsonb_agg(to_jsonb(b)), '[]') from (
    select b.id,b.public,b.file_size_limit,b.allowed_mime_types,count(o.id) as objects,
      coalesce(sum(case when o.metadata->>'size' ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0) as bytes
    from storage.buckets b left join storage.objects o on o.bucket_id=b.id group by b.id order by b.id
  ) b),
  'publications', (select coalesce(jsonb_agg(to_jsonb(p)), '[]') from (
    select pubname,schemaname,tablename from pg_publication_tables order by pubname,schemaname,tablename
  ) p)
);`;

export const MANAGED_SQL = `
select jsonb_build_object(
  'triggers', (select coalesce(string_agg(replace(pg_get_triggerdef(t.oid),'CREATE TRIGGER ','CREATE OR REPLACE TRIGGER ') || ';', E'\n'), '')
    from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace
    join pg_proc p on p.oid=t.tgfoid join pg_namespace pn on pn.oid=p.pronamespace
    where n.nspname in ('auth','storage') and pn.nspname not in ('auth','storage') and not t.tgisinternal),
  'policies', (select coalesce(string_agg(format(
    'CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s;', policyname,schemaname,tablename,permissive,cmd,
    (select string_agg(case when r='public' then 'PUBLIC' else quote_ident(r) end,', ') from unnest(roles) r),
    case when qual is null then '' else ' USING (' || qual || ')' end,
    case when with_check is null then '' else ' WITH CHECK (' || with_check || ')' end
  ), E'\n'), '') from pg_policies where schemaname in ('auth','storage'))
);`;

async function inventories() {
  const checks = await Promise.all(['source', 'target'].map(async (side) => ({
    side, project: await project(side), inventory: await query(side, INVENTORY_SQL),
  })));
  for (const check of checks) {
    if (check.inventory.read_only !== 'on') throw new Error('Connection must be read-only.');
  }
  return Object.fromEntries(checks.map(({ side, ...data }) => [side, data]));
}

function summarize(result) {
  return Object.fromEntries(Object.entries(result).map(([side, { project, inventory: i }]) => [side, {
    ...project, postgres_version: i.postgres_version, database_bytes: i.database_bytes,
    application_tables: i.tables.filter((t) => ['public', '_legacy'].includes(t.schema)).length,
    auth_users: i.auth_users, storage_objects: i.storage.reduce((sum, b) => sum + b.objects, 0),
    managed_policies: i.policies.filter((p) => ['auth', 'storage'].includes(p.schemaname)).length,
    custom_managed_triggers: i.custom_managed_triggers.length, read_only: i.read_only,
  }]));
}

async function privateJson(file, value) {
  await writeFile(file, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
}

async function backup(result) {
  // This operation only exports the source. A populated rehearsal target
  // must not prevent a later, fresh source snapshot; restore guards live
  // in the separate initial-restore and populated-refresh tools.
  if (result.source.inventory.vault_secrets || result.source.inventory.custom_estimators) {
    throw new Error('Vault/custom-operator migration requires separate review before proceeding.');
  }
  const imageInfo = JSON.parse(await run('docker', ['image', 'inspect', 'postgres:17-alpine']));
  const image = imageInfo[0]?.RepoDigests?.find((entry) => /^postgres@sha256:[a-f0-9]{64}$/.test(entry));
  if (!image) throw new Error('Pull the official postgres:17-alpine image first.');
  const version = await run('docker', ['run', '--rm', image, 'pg_dump', '--version']);
  if (!/PostgreSQL\) 17\./.test(version)) throw new Error('A PostgreSQL 17 dump client is required.');
  const dir = join(PRIVATE_DIR, `backup-${new Date().toISOString().replaceAll(':','-')}`);
  await mkdir(dir, { mode: 0o700 });
  await privateJson(join(dir, 'inventory.json'), result);
  for (const name of ['roles', 'schema', 'data', 'history-schema', 'history-data']) {
    const path = join(PRIVATE_DIR, `official-${name}-dump.sh`);
    if (!existsSync(path)) throw new Error(`Missing inspected official dump script: ${path}`);
    const script = stripPlaceholderConnection(await readFile(path, 'utf8'));
    const pgEnv = await migrationConnection('source');
    pgEnv.PGOPTIONS = '-c default_transaction_read_only=on -c statement_timeout=0 -c lock_timeout=5000 -c timezone=UTC';
    const env = processEnv(pgEnv);
    const args = ['run', '--rm', '--interactive', ...Object.keys(pgEnv).flatMap((key) => ['--env', key]), image, 'sh', '-se'];
    console.log(`Exporting ${name} (source connection is read-only)...`);
    await run('docker', args, { input: script, env, outputFile: join(dir, `${name}.sql`) });
  }
  const managed = await query('source', MANAGED_SQL);
  await writeFile(join(dir, 'managed-objects.sql'), `-- Review before restoring into the east project.\n${managed.triggers}\n${managed.policies}\n`, { mode: 0o600, flag: 'wx' });
  const files = {};
  for (const file of readdirSync(dir).sort()) files[file] = createHash('sha256').update(readFileSync(join(dir, file))).digest('hex');
  await privateJson(join(dir, 'manifest.json'), {
    source: PROJECTS.source, target: PROJECTS.target, pg_dump: version, image,
    official_cli_version: '2.122.0', captured_at: new Date().toISOString(),
    phase: 'rehearsal', writes_frozen: false, files,
  });
  console.log(`Backup saved privately: ${dir}`);
  console.log('This is a rehearsal snapshot. Production remains writable; final cutover requires a fresh export during the agreed write freeze.');
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length === 1 && ['--help','-h'].includes(args[0])) { console.log(USAGE); return; }
  if (args.length !== 1 || !['check-access','inventory','backup'].includes(args[0])) throw new Error(USAGE);
  await mkdir(PRIVATE_DIR, { recursive: true, mode: 0o700 });
  await chmod(PRIVATE_DIR, 0o700);
  // Reject switched source/target URLs before making any network request.
  connectionHint(process.env.SOURCE_DATABASE_URL, 'source');
  connectionHint(process.env.TARGET_DATABASE_URL, 'target');
  if (args[0] === 'check-access') {
    const result = await Promise.all(['source','target'].map(async (side) => ({
      side, project: await project(side), database: await query(side, "select json_build_object('postgres_version',current_setting('server_version'),'read_only',current_setting('transaction_read_only'));"),
    })));
    if (result.some((r) => r.database.read_only !== 'on')) throw new Error('Read-only access check failed.');
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  const result = await inventories();
  console.log(JSON.stringify(summarize(result), null, 2));
  if (args[0] === 'backup') await backup(result);
  else {
    const file = join(PRIVATE_DIR, `inventory-${Date.now()}.json`);
    await privateJson(file, result);
    console.log(`Detailed inventory saved privately: ${file}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error.message); process.exitCode = 1; });
}
