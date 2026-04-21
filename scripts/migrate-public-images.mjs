#!/usr/bin/env node
// One-time migration: copy every questions_v2 <img src="…"> reference
// that points at /public/images or /public/graphs into the
// question-figures Supabase Storage bucket, and rewrite the HTML so
// every image lives in one place. Content-addressed (sha256 + ext)
// filenames match the convention the OptionsEditor already uses, so
// figures uploaded by admins and figures migrated from the repo
// share a namespace and dedup against each other.
//
// Usage (normally via .github/workflows/migrate-public-images.yml):
//   SUPABASE_URL=…
//   SUPABASE_SERVICE_ROLE_KEY=…
//   node scripts/migrate-public-images.mjs [--dry-run]
//
// --dry-run prints what it would do and leaves the bucket and DB
// untouched. Without --dry-run the script mutates prod — meant for
// manual GHA invocation only.
//
// Discovery. The script queries questions_v2 for every distinct
// src="…" value, filters to non-data-URI paths, and reads each
// corresponding file from public/<path>. Anything not found on disk
// is reported but not fatal — the run still succeeds, the row
// simply doesn't get rewritten.
//
// Rewrite. For each referenced path, the script uploads the bytes
// (upsert: true — repeated uploads of identical content are no-ops),
// builds a mapping { oldPath → publicUrl }, then visits every row
// and replaces every exact occurrence of each oldPath in stem_html /
// stimulus_html / rationale_html / options (serialized via JSON to
// survive the jsonb round-trip). Rendered columns are nulled so the
// next render pass picks the row up; rendered_source_hash clears
// for the same reason.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { extname, resolve, join } from 'node:path';

const dryRun = process.argv.includes('--dry-run');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const BUCKET = 'question-figures';
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Repo public/ — the GHA workflow checks out at repo root, so this
// resolves relative to that.
const PUBLIC_ROOT = resolve('public');

// ──────────────────────────────────────────────────────────────
// 1. Discover every non-data-URI src referenced across all fields.
// ──────────────────────────────────────────────────────────────

async function discoverReferences() {
  // Use a raw SELECT with regex to extract all <img src="…"> values.
  // supabase-js doesn't have a .regex endpoint, so do the regex
  // client-side over the full HTML blobs.
  const { data: rows, error } = await supabase
    .from('questions_v2')
    .select('id, stem_html, stimulus_html, rationale_html, options')
    .is('deleted_at', null);
  if (error) throw new Error(`discover SELECT failed: ${error.message}`);

  const paths = new Set();
  const rowsWithRefs = [];

  for (const row of rows) {
    const blob =
      (row.stem_html ?? '') + '\n' +
      (row.stimulus_html ?? '') + '\n' +
      (row.rationale_html ?? '') + '\n' +
      (row.options == null ? '' : JSON.stringify(row.options));

    const found = new Set();
    for (const m of blob.matchAll(/<img[^>]*\ssrc=["']([^"']+)["']/g)) {
      const src = m[1];
      if (src.startsWith('data:')) continue;
      if (src.startsWith('http')) continue;
      // Only repo-served paths — /images/… or /graphs/… etc.
      if (!src.startsWith('/')) continue;
      found.add(src);
      paths.add(src);
    }
    if (found.size > 0) rowsWithRefs.push({ ...row, refs: found });
  }

  return { paths: Array.from(paths).sort(), rowsWithRefs };
}

// ──────────────────────────────────────────────────────────────
// 2. Upload each referenced file. Returns {oldPath: newPublicUrl}.
// ──────────────────────────────────────────────────────────────

async function uploadFiles(paths) {
  const mapping = {};
  const missing = [];

  for (const oldPath of paths) {
    const diskPath = join(PUBLIC_ROOT, oldPath.startsWith('/') ? oldPath.slice(1) : oldPath);
    if (!existsSync(diskPath)) {
      missing.push(oldPath);
      continue;
    }

    const buf = readFileSync(diskPath);
    const hash = createHash('sha256').update(buf).digest('hex');
    const ext = (extname(oldPath).slice(1) || 'bin').toLowerCase();
    const bucketPath = `${hash}.${ext}`;
    const contentType = contentTypeFor(ext);

    if (dryRun) {
      console.log(`[dry-run] would upload ${oldPath} (${buf.length}b) → ${BUCKET}/${bucketPath}`);
    } else {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(bucketPath, buf, { contentType, upsert: true });
      if (error) {
        console.error(`  upload failed for ${oldPath}: ${error.message}`);
        continue;
      }
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(bucketPath);
    mapping[oldPath] = data.publicUrl;
    console.log(`  ${oldPath} → ${bucketPath}`);
  }

  return { mapping, missing };
}

function contentTypeFor(ext) {
  switch (ext) {
    case 'png':  return 'image/png';
    case 'svg':  return 'image/svg+xml';
    case 'gif':  return 'image/gif';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    default:     return 'application/octet-stream';
  }
}

// ──────────────────────────────────────────────────────────────
// 3. For each row with refs, str-replace old paths with new URLs
//    across all four fields and UPDATE.
// ──────────────────────────────────────────────────────────────

async function rewriteRows(rowsWithRefs, mapping) {
  let updated = 0;
  let skipped = 0;

  for (const row of rowsWithRefs) {
    const update = {};
    let anyChanged = false;

    for (const field of ['stem_html', 'stimulus_html', 'rationale_html']) {
      const before = row[field];
      if (before == null) continue;
      const after = rewriteString(before, mapping);
      if (after !== before) {
        update[field] = after;
        anyChanged = true;
      }
    }

    if (row.options != null) {
      const beforeJson = JSON.stringify(row.options);
      const afterJson = rewriteString(beforeJson, mapping);
      if (afterJson !== beforeJson) {
        update.options = JSON.parse(afterJson);
        anyChanged = true;
      }
    }

    if (!anyChanged) {
      skipped++;
      continue;
    }

    // Clear rendered columns + hash so the next render pass picks
    // this row up.
    update.stem_rendered        = null;
    update.stimulus_rendered    = null;
    update.rationale_rendered   = null;
    update.options_rendered     = null;
    update.rendered_source_hash = null;
    update.rendered_at          = null;

    if (dryRun) {
      console.log(`[dry-run] would update row ${row.id} (fields: ${Object.keys(update).filter(k => !k.startsWith('rendered') && k !== 'rendered_at' && k !== 'rendered_source_hash').join(',')})`);
      updated++;
      continue;
    }

    const { error } = await supabase
      .from('questions_v2')
      .update(update)
      .eq('id', row.id);
    if (error) {
      console.error(`  UPDATE failed for ${row.id}: ${error.message}`);
      continue;
    }
    updated++;
  }

  return { updated, skipped };
}

function rewriteString(s, mapping) {
  let out = s;
  for (const [oldPath, newUrl] of Object.entries(mapping)) {
    // Replace every exact occurrence. oldPath is a well-formed URL
    // segment starting with /, so simple string replaceAll is safe
    // against regex-escaping issues.
    out = out.split(oldPath).join(newUrl);
  }
  return out;
}

// ──────────────────────────────────────────────────────────────
// Main
// ──────────────────────────────────────────────────────────────

async function main() {
  console.log(`Migration mode: ${dryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log(`Bucket: ${BUCKET}`);
  console.log();

  console.log('Discovering references…');
  const { paths, rowsWithRefs } = await discoverReferences();
  console.log(`  ${paths.length} distinct paths across ${rowsWithRefs.length} rows.`);
  console.log();

  if (paths.length === 0) {
    console.log('Nothing to migrate.');
    return;
  }

  console.log('Uploading files…');
  const { mapping, missing } = await uploadFiles(paths);
  console.log(`  ${Object.keys(mapping).length} uploaded, ${missing.length} missing on disk.`);
  if (missing.length > 0) {
    console.log('  Missing:');
    for (const p of missing) console.log(`    ${p}`);
  }
  console.log();

  console.log('Rewriting rows…');
  const { updated, skipped } = await rewriteRows(rowsWithRefs, mapping);
  console.log(`  ${updated} rows updated, ${skipped} skipped (all refs missing from mapping).`);
  console.log();

  console.log(`Done${dryRun ? ' (dry run — nothing changed)' : ''}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
