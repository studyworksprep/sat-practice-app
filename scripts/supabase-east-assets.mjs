#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { isDeepStrictEqual } from 'node:util';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { sourceHash } from '../lib/content/render-math.mjs';
import { PROJECTS, PRIVATE_DIR, project, query, migrationConnection, processEnv, run } from './supabase-east-migration.mjs';
import { checkpoint } from './supabase-east-restore.mjs';

export const OLD_STORAGE = `https://${PROJECTS.source.ref}.supabase.co/storage/v1/`;
export const NEW_STORAGE = `https://${PROJECTS.target.ref}.supabase.co/storage/v1/`;
const AUTH = { persistSession:false, autoRefreshToken:false, detectSessionInUrl:false };
const sqlString = (value) => value == null ? 'NULL' : `'${String(value).replaceAll("'","''")}'`;
const ident = (value) => `"${value.replaceAll('"','""')}"`;

export function validObjectPath(bucket, name) {
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(bucket) || !name || name.startsWith('/') || name.includes('\\')) throw new Error('Unexpected Storage object path.');
  for (const part of name.split('/')) {
    let decoded;
    try { decoded=decodeURIComponent(part); } catch { throw new Error('Invalid Storage path encoding.'); }
    if (!part || ['.','..'].includes(decoded) || decoded.includes('/') || decoded.includes('\\')) throw new Error('Unsafe Storage object path.');
  }
}

export function replaceStorage(value) {
  if (typeof value === 'string') return value.replaceAll(OLD_STORAGE,NEW_STORAGE);
  if (Array.isArray(value)) return value.map(replaceStorage);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k,v]) => [k.replaceAll(OLD_STORAGE,NEW_STORAGE),replaceStorage(v)]));
  return value;
}

export function cacheSeconds(value) {
  const match=String(value??'3600').match(/^(?:max-age=)?([0-9]+)$/);
  if (!match) throw new Error('Storage Cache-Control needs review before copying.');
  return match[1];
}

export function transformedQuestion(row) {
  const next=replaceStorage(row);
  // Preserve an already-stale/null cache marker. Only move a valid source
  // hash when the corresponding source fields change solely by URL mapping.
  if (row.rendered_source_hash && row.rendered_source_hash === sourceHash(row)) next.rendered_source_hash=sourceHash(next);
  return next;
}

export async function auditCopyUrls(lines,inventory) {
  const metadata=new Map(inventory.columns.map(c=>[`${c.table_schema}.${c.table_name}.${c.column_name}`,c]));
  const findings=new Map();const urlClasses={};let table=null,columns=[];
  for await(const line of lines){
    if(!table){
      const match=line.match(/^COPY "([^"]+)"\."([^"]+)" \((.*)\) FROM stdin;$/);
      if(match){table=`${match[1]}.${match[2]}`;columns=[...match[3].matchAll(/"([^"]+)"/g)].map(m=>m[1]);}
      else if(line.startsWith('COPY '))throw new Error('Unexpected COPY header in Storage URL audit.');
      continue;
    }
    if(line==='\\.'){table=null;continue;}
    if(!['public','_legacy'].includes(table.split('.')[0]))continue;
    const fields=line.split('\t');
    if(fields.length!==columns.length)throw new Error('Unexpected COPY field count in Storage URL audit.');
    for(let i=0;i<fields.length;i++){
      const parts=fields[i].split(OLD_STORAGE);
      if(parts.length===1)continue;
      const column=columns[i],key=`${table}.${column}`,meta=metadata.get(key);
      if(!meta||meta.is_generated!=='NEVER'||!['text','character varying','json','jsonb'].includes(meta.data_type))throw new Error('Storage URL found in an unsupported column; review before mapping.');
      const old=findings.get(key)??{table,column,rows:0,references:0};
      old.rows++;old.references+=parts.length-1;findings.set(key,old);
      for(const suffix of parts.slice(1)){
        const match=suffix.match(/^(object\/(?:public|sign|authenticated)\/|render\/image\/(?:public|sign)\/)/);
        const kind=match?.[1]??'unrecognized';urlClasses[kind]=(urlClasses[kind]??0)+1;
      }
    }
  }
  if(table)throw new Error('Incomplete COPY data in Storage URL audit.');
  return {columns:[...findings.values()].sort((a,b)=>`${a.table}.${a.column}`.localeCompare(`${b.table}.${b.column}`)),url_classes:urlClasses};
}

async function snapshotUrlAudit(cp){
  const lines=createInterface({input:createReadStream(join(cp.dir,'data.sql')),crlfDelay:Infinity});
  const audit=await auditCopyUrls(lines,cp.inventory.source.inventory);
  audit.source_data_sha256=cp.manifest.files['data.sql'];
  await writeFile(join(cp.dir,`source-url-audit-${Date.now()}.json`),JSON.stringify(audit,null,2)+'\n',{mode:0o600,flag:'wx'});
  return audit;
}

async function writeTarget(sql) {
  await project('target');
  const env=await migrationConnection('target');
  env.PGOPTIONS='-c statement_timeout=120000 -c lock_timeout=5000 -c timezone=UTC';
  env.PGAPPNAME='studyworks-east-migration-assets-target';
  await run('psql',['-X','-w','--quiet','--set','ON_ERROR_STOP=1'],{
    env:processEnv(env),input:`BEGIN; SET LOCAL ROLE postgres; SET LOCAL standard_conforming_strings=on; SET LOCAL session_replication_role=replica;\n${sql}\nCOMMIT;`,
  });
}

async function client(side) {
  const keys=JSON.parse(await readFile(join(PRIVATE_DIR,'settings',`${side}-keys.json`),'utf8'));
  const key=keys.find((k) => k.name==='service_role' && k.type==='legacy')?.api_key;
  if (!key) throw new Error(`${side}: server API key is not available in the private configuration export.`);
  return createClient(`https://${PROJECTS[side].ref}.supabase.co`,key,{auth:AUTH});
}

async function objects() {
  return query('target',"select coalesce(jsonb_agg(to_jsonb(o) order by bucket_id,name),'[]'::jsonb) from storage.objects o;");
}

async function storage(apply,cp) {
  const originals=await objects();
  const beforeBuckets=await query('target',"select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]'::jsonb) from storage.buckets b;");
  for (const item of originals) validObjectPath(item.bucket_id,item.name);
  console.log(JSON.stringify({phase:'Storage copy',objects:originals.length,buckets:beforeBuckets.length,apply}));
  if (!apply) return;
  const [source,target]=await Promise.all([client('source'),client('target')]);
  const files=[];
  for (const item of originals) {
    const downloaded=await source.storage.from(item.bucket_id).download(item.name);
    if (downloaded.error) throw new Error('Source Storage download failed; review object availability before retrying.');
    const bytes=Buffer.from(await downloaded.data.arrayBuffer());
    if (item.metadata?.size != null && Number(item.metadata.size)!==bytes.length) throw new Error('Source Storage file changed since the database snapshot.');
    const etag=(item.metadata?.eTag??item.metadata?.etag??'').replaceAll('"','');
    if (/^[a-f0-9]{32}$/i.test(etag) && createHash('md5').update(bytes).digest('hex')!==etag.toLowerCase()) throw new Error('Source Storage etag differs from the snapshot.');
    const uploaded=await target.storage.from(item.bucket_id).upload(item.name,bytes,{
      upsert:true, contentType:item.metadata?.mimetype??downloaded.data.type,
      cacheControl:cacheSeconds(item.metadata?.cacheControl),metadata:item.user_metadata??undefined,
    });
    if (uploaded.error) throw new Error('Destination Storage upload failed.');
    const check=await target.storage.from(item.bucket_id).download(item.name);
    if (check.error) throw new Error('Destination Storage download verification failed.');
    const copied=Buffer.from(await check.data.arrayBuffer());
    const hash=createHash('sha256').update(bytes).digest('hex');
    if (createHash('sha256').update(copied).digest('hex')!==hash) throw new Error('Storage byte comparison failed.');
    files.push({bucket:item.bucket_id,path:item.name,bytes:bytes.length,sha256:hash});
    if (files.length%10===0) console.log(`Storage files copied and byte-verified: ${files.length}/${originals.length}`);
  }
  const copied=await objects();
  const key=(o) => `${o.bucket_id}\0${o.name}`;
  const byKey=new Map(copied.map((o) => [key(o),o]));
  if (copied.length!==originals.length) throw new Error('Storage object count changed unexpectedly.');
  const ownerFixes=originals.filter((o) => {
    const now=byKey.get(key(o));
    if (!now || now.id!==o.id) throw new Error('Storage upsert did not preserve object identity.');
    return ['owner','owner_id','user_metadata'].some((field) => !isDeepStrictEqual(now[field],o[field]));
  });
  if (ownerFixes.length) {
    const rows=ownerFixes.map((o) => ({id:o.id,owner:o.owner,owner_id:o.owner_id,user_metadata:o.user_metadata}));
    await writeTarget(`WITH original AS (SELECT * FROM jsonb_populate_recordset(NULL::storage.objects,${sqlString(JSON.stringify(rows))}::jsonb))
      UPDATE storage.objects t SET owner=o.owner,owner_id=o.owner_id,user_metadata=o.user_metadata FROM original o WHERE t.id=o.id;`);
  }
  const finalObjects=await objects();
  const finalMap=new Map(finalObjects.map((o) => [key(o),o]));
  for (const o of originals) for (const field of ['id','owner','owner_id','user_metadata']) {
    if (!isDeepStrictEqual(o[field],finalMap.get(key(o))?.[field])) throw new Error('Storage ownership/metadata preservation failed.');
  }
  const afterBuckets=await query('target',"select coalesce(jsonb_agg(to_jsonb(b) order by id),'[]'::jsonb) from storage.buckets b;");
  if (!isDeepStrictEqual(beforeBuckets,afterBuckets)) throw new Error('Storage bucket configuration changed unexpectedly.');
  const report={completed_at:new Date().toISOString(),files,buckets:beforeBuckets.length,ownership_repairs:ownerFixes.length,passed:true};
  const path=join(cp.dir,`storage-verification-${Date.now()}.json`);
  await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({storage_verified:true,files:files.length,bytes:files.reduce((n,f)=>n+f.bytes,0),ownership_repairs:ownerFixes.length,report:path}));
}

async function rewrite(apply,cp) {
  const audit=await snapshotUrlAudit(cp);
  if (audit.url_classes['object/sign/'] || audit.url_classes['render/image/sign/'] || audit.url_classes.unrecognized) throw new Error('Signed or unrecognized Storage URLs require a separate migration.');
  const inventory=cp.inventory;
  const groups=new Map();
  for (const entry of audit.columns) {
    if (!groups.has(entry.table)) groups.set(entry.table,[]);
    groups.get(entry.table).push(entry.column);
  }
  const before=[];
  const updates=[];
  let hashUpdates=0;
  for (const [name,columns] of groups) {
    const [schema,table]=name.split('.');
    if (!['public','_legacy'].includes(schema) || !table) throw new Error('Unexpected table in URL audit.');
    const qualified=`${ident(schema)}.${ident(table)}`;
    const conditions=columns.map((c) => `strpos(${ident(c)}::text,${sqlString(OLD_STORAGE)})>0`).join(' OR ');
    const rows=await query('target',`select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from ${qualified} t where ${conditions};`);
    const expected=rows.map((row) => table==='questions_v2'?transformedQuestion(row):replaceStorage(row));
    before.push({name,qualified,conditions,rows,expected});
    const assignments=columns.map((column) => {
      const metadata=inventory.source.inventory.columns.find((c) => c.table_schema===schema && c.table_name===table && c.column_name===column);
      if (!metadata || metadata.is_generated!=='NEVER' || !['text','character varying','json','jsonb'].includes(metadata.data_type)) throw new Error('Unsupported URL column type.');
      const cast=({text:'text','character varying':'text',json:'json',jsonb:'jsonb'})[metadata.data_type];
      return `${ident(column)}=replace(${ident(column)}::text,${sqlString(OLD_STORAGE)},${sqlString(NEW_STORAGE)})::${cast}`;
    });
    updates.push(`UPDATE ${qualified} SET ${assignments.join(',')} WHERE ${conditions};`);
    if (table==='questions_v2') {
      const patches=rows.flatMap((row,i) => row.rendered_source_hash!==expected[i].rendered_source_hash?[{id:row.id,hash:expected[i].rendered_source_hash}]:[]);
      hashUpdates+=patches.length;
      for (const patch of patches) updates.push(`UPDATE ${qualified} SET rendered_source_hash=${sqlString(patch.hash)} WHERE id=${sqlString(patch.id)}::uuid;`);
    }
  }
  const count=before.reduce((n,t)=>n+t.rows.length,0);
  console.log(JSON.stringify({phase:'Storage URL mapping',tables:before.length,rows:count,valid_render_hashes_updated:hashUpdates,apply}));
  if (!apply) return;
  await writeFile(join(cp.dir,`url-mapping-before-${Date.now()}.json`),JSON.stringify(before,null,2)+'\n',{mode:0o600,flag:'wx'});
  await writeTarget(updates.join('\n'));
  for (const table of before) {
    const ids=table.rows.map((row)=>sqlString(row.id)).join(',');
    if (!ids) continue;
    const rows=await query('target',`select coalesce(jsonb_agg(to_jsonb(t) order by id),'[]'::jsonb) from ${table.qualified} t where id in (${ids});`);
    if (!isDeepStrictEqual(rows,table.expected)) throw new Error(`Unexpected row changes after Storage URL mapping: ${table.name}.`);
    const remaining=await query('target',`select json_build_object('remaining',count(*)) from ${table.qualified} where ${table.conditions};`);
    if (remaining.remaining) throw new Error('Old Storage URLs remain after mapping.');
  }
  const report={completed_at:new Date().toISOString(),tables:before.map((t)=>({table:t.name,rows:t.rows.length})),rows:count,render_hashes_updated:hashUpdates,all_other_row_fields_preserved:true,old_storage_urls_remaining:0,passed:true};
  const path=join(cp.dir,`url-mapping-verification-${Date.now()}.json`);
  await writeFile(path,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
  console.log(JSON.stringify({...report,report:path}));
}

async function main(){
  const args=process.argv.slice(2);
  if (args.length<2 || args.length>3 || !['audit','storage','rewrite'].includes(args[1]) || (args[2] && args[2]!=='--apply')) throw new Error('Usage: node --env-file=<private access.env> scripts/supabase-east-assets.mjs <backup-dir> <audit | storage | rewrite> [--apply]');
  const cp=await checkpoint(args[0]);
  await project('target');
  if(args[1]==='audit')console.log(JSON.stringify(await snapshotUrlAudit(cp)));
  else if (args[1]==='storage') await storage(args[2]==='--apply',cp);
  else await rewrite(args[2]==='--apply',cp);
}

if (process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  main().catch((error)=>{console.error(error.message);process.exitCode=1;});
}
