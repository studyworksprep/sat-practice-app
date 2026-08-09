#!/usr/bin/env node
// Copy a curated slice of real question content from the production
// bank into studyworks-dev, so local dev has content worth looking at.
//
// WHY A SCRIPT: a repeatable cross-project copy should keep the rows in
// one process rather than require someone to move ~123KB of question
// HTML by hand. That avoids a transcription step where one mangled
// backslash could silently corrupt a question, and makes recovery from
// dev drift straightforward.
//
// WHAT IT COPIES
//   questions_v2           the ids in scripts/seed-question-ids.txt
//   question_concept_tags  the tag links for those questions
// The concept_tags catalog itself is already seeded (107 rows).
//
// WHAT IT DELIBERATELY DOES NOT COPY
//   profiles / auth users / attempts / assignments — no real student
//   or staff data crosses over. Dev keeps its own synthetic users.
//   Identity columns on the copied rows (created_by, updated_by,
//   approved_by, last_fixed_by, and question_concept_tags.created_by)
//   are nulled: they are staff user ids, they would dangle against
//   dev's auth.users anyway, and nulling them is the anonymisation.
//
//   The *_rendered columns are also skipped. load-question.ts and
//   build-session-review.js both read `stem_rendered ?? stem_html`,
//   so new rows fall back to the raw \( … \) TeX, which exercises the
//   client-side MathJax path we want to inspect locally. Skipping the
//   derived content also roughly halves the payload.
//
// USAGE
//   PROD_SUPABASE_URL=https://noqtadytxyslkoetchrs.supabase.co \
//   PROD_SUPABASE_SECRET_KEY=... \
//   DEV_SUPABASE_URL=https://ikzhizgsawzjpuuznfid.supabase.co \
//   DEV_SUPABASE_SECRET_KEY=... \
//   node scripts/seed-dev-from-prod.mjs          # dry run (default)
//   node scripts/seed-dev-from-prod.mjs --write  # perform the import
//
// Secret keys come from the Supabase dashboard (Project Settings ->
// API Keys). Legacy PROD_SERVICE_ROLE_KEY / DEV_SERVICE_ROLE_KEY
// variables remain supported during Supabase's key migration. These
// are secrets: pass them in the environment, never in a committed file.
//
// REGENERATING THE ID LIST (run against prod, e.g. via the SQL editor).
// Picks 2 per skill across all 29 skills, preferring questions that
// carry TeX and a long stimulus, size-capped to keep payloads sane and
// to skip rows with base64 images inlined in the HTML:
//
//   with base as (
//     select id, skill_name,
//            (stem_html like '%\(%' or stem_html like '%\[%'
//             or coalesce(stimulus_html,'') like '%\(%') as tex,
//            length(coalesce(stimulus_html,'')) as stim_len,
//            length(coalesce(stem_html,''))+length(coalesce(stimulus_html,''))
//              +length(coalesce(rationale_html,''))+length(coalesce(options::text,'')) as bytes
//     from public.questions_v2
//     where is_published and not coalesce(is_broken,false) and deleted_at is null
//       and coalesce(stimulus_html,'') not like '%base64%'
//       and stem_html not like '%base64%'
//   ), ranked as (
//     select *, row_number() over (partition by skill_name
//         order by (tex)::int desc, (stim_len>800)::int desc, bytes, id) rn
//     from base where bytes between 200 and 6000
//   )
//   select string_agg(id::text, E'\n' order by id) from ranked where rn <= 2;

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ID_FILE = join(HERE, 'seed-question-ids.txt');
const CHUNK = 20;
const PROD_REF = 'noqtadytxyslkoetchrs';
const DEV_REF = 'ikzhizgsawzjpuuznfid';
const args = new Set(process.argv.slice(2));

const usage = `Usage: node scripts/seed-dev-from-prod.mjs [--dry-run | --write]

The default is a read-only dry run. Use --write explicitly to import the
curated question set from production into studyworks-dev.`;

if (args.has('--help')) {
  console.log(usage);
  process.exit(0);
}

const unknownArgs = [...args].filter((arg) => !['--dry-run', '--write'].includes(arg));
if (unknownArgs.length || (args.has('--dry-run') && args.has('--write'))) {
  console.error(unknownArgs.length ? `Unknown argument: ${unknownArgs.join(', ')}` : 'Choose either --dry-run or --write.');
  console.error(`\n${usage}`);
  process.exit(1);
}

const WRITE = args.has('--write');
const DRY = !WRITE;

// Content + provenance columns worth carrying across. Everything not
// listed here is either derived (the *_rendered pair, the hash), a
// counter that should restart at zero in dev, or an identity column.
const COPY_COLUMNS = [
  'id', 'question_type', 'stem_html', 'stimulus_html', 'rationale_html',
  'options', 'correct_answer', 'domain_code', 'domain_name', 'skill_code',
  'skill_name', 'difficulty', 'score_band', 'source', 'source_id',
  'source_external_id', 'display_code', 'hints',
];

function need(name) {
  const v = process.env[name];
  if (!v) {
    console.error(`Missing ${name}. See the usage block at the top of this file.`);
    process.exit(1);
  }
  return v;
}

function projectUrl(name, expectedRef) {
  const raw = need(name);
  let url;
  try {
    url = new URL(raw);
  } catch {
    console.error(`${name} is not a valid URL.`);
    process.exit(1);
  }
  const expectedOrigin = `https://${expectedRef}.supabase.co`;
  if (url.origin !== expectedOrigin || !['', '/'].includes(url.pathname)) {
    console.error(`${name} must be exactly ${expectedOrigin} (an optional trailing slash is allowed).`);
    process.exit(1);
  }
  return expectedOrigin;
}

function secretKey(name, legacyName) {
  const value = process.env[name] || process.env[legacyName];
  if (!value) {
    console.error(`Missing ${name} (or legacy ${legacyName}).`);
    process.exit(1);
  }
  return value;
}

const prodUrl = projectUrl('PROD_SUPABASE_URL', PROD_REF);
const devUrl = projectUrl('DEV_SUPABASE_URL', DEV_REF);
if (prodUrl === devUrl) {
  console.error('Production and development URLs must be different.');
  process.exit(1);
}

const serverAuth = {
  persistSession: false,
  autoRefreshToken: false,
  detectSessionInUrl: false,
};
const prod = createClient(prodUrl, secretKey('PROD_SUPABASE_SECRET_KEY', 'PROD_SERVICE_ROLE_KEY'), {
  auth: serverAuth,
});
const dev = createClient(devUrl, secretKey('DEV_SUPABASE_SECRET_KEY', 'DEV_SERVICE_ROLE_KEY'), {
  auth: serverAuth,
});

const chunk = (arr, n) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

async function main() {
  const ids = readFileSync(ID_FILE, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
  console.log(`${ids.length} question ids from ${ID_FILE}`);
  if (DRY) console.log('DRY RUN (default) — nothing will be written. Use --write to import.\n');

  // ---- questions ----------------------------------------------------
  let copied = 0;
  for (const batch of chunk(ids, CHUNK)) {
    const { data, error } = await prod
      .from('questions_v2')
      .select(COPY_COLUMNS.join(','))
      .in('id', batch);
    if (error) throw new Error(`prod read failed: ${error.message}`);
    const returned = new Set(data.map((question) => question.id));
    const missing = batch.filter((id) => !returned.has(id));
    if (missing.length) throw new Error(`prod read missed ${missing.length} requested question(s): ${missing.join(', ')}`);

    // Counters restart in dev; the row is published and unbroken by
    // construction (the id list is filtered on exactly that).
    const rows = data.map((q) => ({
      ...q,
      is_published: true,
      is_broken: false,
      attempt_count: 0,
      correct_count: 0,
      created_by: null,
      updated_by: null,
      approved_by: null,
      last_fixed_by: null,
      pattern_id: null,
      deleted_at: null,
    }));

    if (WRITE) {
      const { error: wErr } = await dev.from('questions_v2').upsert(rows, { onConflict: 'id' });
      if (wErr) throw new Error(`dev write failed: ${wErr.message}`);
    }
    copied += rows.length;
    process.stdout.write(`\r  questions: ${copied}/${ids.length}`);
  }
  console.log('');

  // ---- concept tag links --------------------------------------------
  const { data: links, error: lErr } = await prod
    .from('question_concept_tags')
    .select('question_id,tag_id')
    .in('question_id', ids);
  if (lErr) throw new Error(`prod tag-link read failed: ${lErr.message}`);

  const tagIds = [...new Set(links.map((link) => link.tag_id))];
  if (tagIds.length) {
    const { data: devTags, error: tagErr } = await dev.from('concept_tags').select('id').in('id', tagIds);
    if (tagErr) throw new Error(`dev concept-tag read failed: ${tagErr.message}`);
    const present = new Set(devTags.map((tag) => tag.id));
    const missing = tagIds.filter((id) => !present.has(id));
    if (missing.length) throw new Error(`dev is missing ${missing.length} referenced concept tag(s): ${missing.join(', ')}`);
  }

  if (links.length && WRITE) {
    // created_by nulled — same reasoning as the question identity columns.
    const rows = links.map((l) => ({ ...l, created_by: null }));
    const { error: wErr } = await dev
      .from('question_concept_tags')
      .upsert(rows, { onConflict: 'question_id,tag_id', ignoreDuplicates: true });
    if (wErr) throw new Error(`dev tag-link write failed: ${wErr.message}`);
  }
  console.log(`  tag links: ${links.length}`);

  // ---- fidelity check ------------------------------------------------
  // Compare the exact HTML strings and parsed JSON values rather than
  // trusting the round trip. This is also an escaping check for TeX.
  if (WRITE) {
    const hash = (q) =>
      [q.stem_html, q.stimulus_html, q.rationale_html,
       JSON.stringify(q.options), JSON.stringify(q.correct_answer)].join('\u0000');
    const cols = 'id,stem_html,stimulus_html,rationale_html,options,correct_answer';
    let mismatched = 0;
    for (const batch of chunk(ids, CHUNK)) {
      const [prodResult, devResult] = await Promise.all([
        prod.from('questions_v2').select(cols).in('id', batch),
        dev.from('questions_v2').select(cols).in('id', batch),
      ]);
      if (prodResult.error) throw new Error(`prod fidelity read failed: ${prodResult.error.message}`);
      if (devResult.error) throw new Error(`dev fidelity read failed: ${devResult.error.message}`);
      const p = prodResult.data;
      const d = devResult.data;
      const devById = new Map((d ?? []).map((r) => [r.id, r]));
      for (const pr of p ?? []) {
        const dr = devById.get(pr.id);
        if (!dr || hash(dr) !== hash(pr)) {
          mismatched += 1;
          console.error(`\n  MISMATCH ${pr.id}`);
        }
      }
    }
    console.log(mismatched === 0
      ? '  fidelity: HTML exact and parsed JSON equivalent to prod'
      : `  fidelity: ${mismatched} MISMATCHED — investigate before using this data`);
    if (mismatched) process.exitCode = 1;
  }

  console.log('\nDone.');
}

main().catch((e) => {
  console.error('\n' + e.message);
  process.exit(1);
});
