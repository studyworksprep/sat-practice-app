#!/usr/bin/env node
// repair-sat6-rw-m2-hard.mjs
// ─────────────────────────────────────────────────────────────────────
// One-off repair for "SAT Practice Test 6 (Adaptive)" RW Module 2 Hard
// route. The 27 practice_test_module_items for that module were built
// from the wrong source: ordinals 1, 3, 5 contain RW M2 Hard #23, #25,
// #27; ordinals 2, 4 happen to contain the correct RW content; ordinals
// 6–27 contain Math Module 1 #1–22 wholesale. The entire adaptive-hard
// RW route is effectively a math module, and a Bluebook-uploaded
// student attempt that routed into Hard ended up with their Math
// content superimposed on top of an RW slot, which is what surfaced
// the issue.
//
// This script does two things, gated by flags:
//
//   (default, read-only)
//     Match each of the 27 expected RW M2 Hard questions against the
//     `questions` table by `source_external_id` and `question_id`,
//     report which ones were found, pick the best `question_version_id`
//     per matched question, and print a summary.
//
//   --apply
//     In addition to matching, actually overwrite the 27 rows in
//     `practice_test_module_items` for the target module so their
//     `question_version_id`s point at the correct questions. Refuses
//     to run if any ordinal failed to match. Also refuses to run if
//     the target module has an attempt count >0 unless --force-attempts
//     is also passed (there are existing attempts you may want to
//     clean up first).
//
// Usage:
//   node --env-file=.env.local scripts/repair-sat6-rw-m2-hard.mjs
//   node --env-file=.env.local scripts/repair-sat6-rw-m2-hard.mjs --apply
//   node --env-file=.env.local scripts/repair-sat6-rw-m2-hard.mjs --apply --force-attempts
//
// The expected question list is embedded below, pulled from the
// Bluebook "MyPractice" Details JSON for SAT Practice Test 6 Reading
// section (Module 2, Hard route). Fields per entry:
//   ordinal       — 1-based position in the module (1..27)
//   externalId    — College Board external UUID  (→ questions.source_external_id)
//   questionId    — College Board question UUID  (→ questions.question_id)
//   correctChoice — A/B/C/D, for sanity-checking
//   primary       — College Board PRIMARY_CLASS_CD, for domain sanity check
//   hint          — short human-readable stem preview, for the report
// ─────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Run with `node --env-file=.env.local`.');
  process.exit(1);
}

const svc = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const argv = new Set(process.argv.slice(2));
const APPLY = argv.has('--apply');
const FORCE_ATTEMPTS = argv.has('--force-attempts');

const TEST_NAME = 'SAT Practice Test 6 (Adaptive)';
const TARGET_SUBJECT = 'RW';
const TARGET_MODULE_NUMBER = 2;
const TARGET_ROUTE_CODE = 'HARD';

const EXPECTED = [
  { ordinal: 1,  externalId: 'f46e5ae7-df68-4fff-9fed-f7c1c9be6f1c', questionId: 'bf3b95b0-1d6e-4f11-86fb-c82fcc34a667', correctChoice: 'A', primary: 'CAS', hint: 'War of 1812 — "tenuous" place in historical memory' },
  { ordinal: 2,  externalId: 'c2c803b2-12ef-43e1-9e6f-fd55ed2b943f', questionId: '88939500-6ca3-4750-8695-afb043818cde', correctChoice: 'B', primary: 'CAS', hint: 'Kelmscott Press — "manifest in"' },
  { ordinal: 3,  externalId: '38f9b682-b22b-4740-ad52-2d8ba39ce79f', questionId: '9e603ebe-b3ed-4d01-bb61-badf9e33cb77', correctChoice: 'B', primary: 'CAS', hint: 'Social media research senior citizens — "Redressing"' },
  { ordinal: 4,  externalId: 'cc4c76e5-535b-4376-baf9-3c6a772c0cf3', questionId: 'af0cc43a-c967-433d-89f6-d20c24ebee78', correctChoice: 'D', primary: 'CAS', hint: 'Baldwin Giovanni\'s Room — "disputing"' },
  { ordinal: 5,  externalId: '10aedcfb-dfe1-4eac-b1d2-89f7c794f9eb', questionId: 'f478d70d-e128-41a9-b459-dbea77f8a809', correctChoice: 'A', primary: 'CAS', hint: 'William H. Johnson underlined sentence function' },
  { ordinal: 6,  externalId: '77d9e3c0-d312-40eb-a54b-06a3589a4335', questionId: 'fdf15629-65ef-4db7-8315-aabfbc44d758', correctChoice: 'C', primary: 'CAS', hint: 'Chicano movement / Herrera underlined portion' },
  { ordinal: 7,  externalId: '4d2152ad-3e95-4ca9-91a8-423758f25623', questionId: '70248a22-fa3e-4c0d-9d0c-598ab47174dc', correctChoice: 'D', primary: 'INI', hint: 'Bosco Verticale skeptics' },
  { ordinal: 8,  externalId: 'c62128d3-85ec-4b5a-8f7e-cedfc5850c29', questionId: '4458e7bd-8e6e-4cbe-b29f-2983efdbf5aa', correctChoice: 'C', primary: 'INI', hint: 'Asiedu natural-resource extraction main idea' },
  { ordinal: 9,  externalId: '8544d09c-adf1-4069-8362-343c6a32fd8c', questionId: '7ac2d7e8-cf0a-4397-a84d-a7ef99e59550', correctChoice: 'C', primary: 'INI', hint: 'Huang/Seager NH3 biosignature' },
  { ordinal: 10, externalId: 'ed118154-f369-47fe-850a-70e12f3794d8', questionId: 'fe800141-d349-4da8-8720-ad73ea1e01af', correctChoice: 'D', primary: 'INI', hint: 'Wordsworth "Lines Written in Early Spring" quotation' },
  { ordinal: 11, externalId: '9d1ab342-87cd-4c5f-8c7e-dbd44981b5e0', questionId: 'ffa072ff-7d08-4f5f-8531-4a27a025d1c5', correctChoice: 'D', primary: 'INI', hint: 'Ibáñez sugar maple radial growth graph' },
  { ordinal: 12, externalId: '704122ea-86c8-4130-a534-dde9ec1a52b1', questionId: '261ec1ec-c0f2-4dce-ba6b-cdf950563ceb', correctChoice: 'D', primary: 'INI', hint: 'TMAO piezophiles supporting finding' },
  { ordinal: 13, externalId: '6537fc25-1318-49e9-9e1e-dcc07604c519', questionId: 'c0908c13-f977-4319-b422-b1a4405ef5df', correctChoice: 'B', primary: 'INI', hint: 'Persad irrigation/aquifer table' },
  { ordinal: 14, externalId: '8b422b91-e8e0-4fa8-9042-bde638fd7c71', questionId: '2e1f8f32-a777-4054-8d3c-eb9c67653469', correctChoice: 'A', primary: 'INI', hint: 'Gidna captive lions stereotypic behavior' },
  { ordinal: 15, externalId: '33508a17-8255-4313-80e7-c1bf9cd505b3', questionId: 'a1a8e9ee-1343-42a8-bad9-dc8ddfcffa21', correctChoice: 'A', primary: 'SEC', hint: 'Escoffier Le Guide Culinaire — epitomize' },
  { ordinal: 16, externalId: 'e402c9de-ec5c-4fe3-ae02-d6233c202224', questionId: 'e5233e18-d8ef-4b79-a361-a7ff52c217b7', correctChoice: 'B', primary: 'SEC', hint: 'Pinhole camera — works. Because' },
  { ordinal: 17, externalId: '849dbfd4-a703-4e5f-9a77-444840ef8712', questionId: 'c2b041dc-bc0a-4e73-946b-1594350ffd7c', correctChoice: 'B', primary: 'SEC', hint: 'Marie-Denise Villers portrait' },
  { ordinal: 18, externalId: '27dcef67-fa3b-4d14-8bc9-703bcc36b1b1', questionId: '398a4dfe-3b11-4f3c-8635-b37d7abd3782', correctChoice: 'B', primary: 'SEC', hint: 'Sophie Calle photographs — described, from hair…' },
  { ordinal: 19, externalId: 'ed257044-3bd8-403a-8ea6-516cc4ebcac5', questionId: '48b2fd4d-9a97-404c-9d02-d07751af5778', correctChoice: 'C', primary: 'SEC', hint: 'Richard Serra — Serra, intending' },
  { ordinal: 20, externalId: '0e4cc810-98b3-497e-b9cd-7415d29d1aef', questionId: 'a27008d8-837f-4f06-8a6c-f9a3dd7237d6', correctChoice: 'B', primary: 'SEC', hint: 'Byropsis algae toxins — increase' },
  { ordinal: 21, externalId: '2ff3132b-4962-463f-892c-bc76a6db68bf', questionId: 'df7e4310-6a5e-4095-8a4d-d0128cca6627', correctChoice: 'D', primary: 'EOI', hint: 'Jelly Roll Morton transition — though' },
  { ordinal: 22, externalId: 'c8957ff2-9674-47a3-a4d1-718331694c42', questionId: '6e69009b-e13e-4f0f-8de1-093b9f828c54', correctChoice: 'B', primary: 'EOI', hint: 'Henry James editions transition — in fact' },
  { ordinal: 23, externalId: '475f0dde-a4ec-4f91-b2b4-de36e7b1a6ca', questionId: 'b099e609-170e-4ff8-8862-0a7563ac5a4b', correctChoice: 'B', primary: 'EOI', hint: 'Darwin/Wallace transition — then' },
  { ordinal: 24, externalId: '093a41fa-36ba-4d68-a521-381fa328114e', questionId: '934e6e18-8f0c-47cf-b548-5763b0e9d6b3', correctChoice: 'B', primary: 'EOI', hint: 'Dairy cows diurnal/nocturnal transition — In other words' },
  { ordinal: 25, externalId: '6368be96-9720-4d31-8ba0-50e38b991f78', questionId: '2875489a-df1e-4144-8250-f3d290da9662', correctChoice: 'A', primary: 'EOI', hint: 'P waves / S waves similarity notes' },
  { ordinal: 26, externalId: '476f7e8b-5191-4fec-b811-5afc910ecdb4', questionId: '6cbdaa37-5611-4ed9-a29b-2c01a68526ce', correctChoice: 'D', primary: 'EOI', hint: 'California red-legged frog FWS classification notes' },
  { ordinal: 27, externalId: '459668c5-8725-4aa8-8529-d73621d54e4c', questionId: 'f9d46a4f-cb95-4517-9bd8-4502007fb6a5', correctChoice: 'C', primary: 'EOI', hint: 'Arab dhow replica materials notes' },
];

// SAT domain codes → section, for domain-sanity-check output.
const RW_DOMAINS = new Set(['CAS', 'INI', 'SEC', 'EOI']);

// ─── main ──────────────────────────────────────────────────────────────
async function main() {
  // 1. Locate the target practice_test_module row.
  const { data: test, error: testErr } = await svc
    .from('practice_tests')
    .select('id, name')
    .eq('name', TEST_NAME)
    .maybeSingle();
  if (testErr || !test) {
    console.error(`Could not find practice_tests row for "${TEST_NAME}": ${testErr?.message || 'not found'}`);
    process.exit(1);
  }

  const { data: modRow, error: modErr } = await svc
    .from('practice_test_modules')
    .select('id, subject_code, module_number, route_code')
    .eq('practice_test_id', test.id)
    .eq('subject_code', TARGET_SUBJECT)
    .eq('module_number', TARGET_MODULE_NUMBER)
    .eq('route_code', TARGET_ROUTE_CODE)
    .maybeSingle();
  if (modErr || !modRow) {
    console.error(`Could not find ${TARGET_SUBJECT}/${TARGET_MODULE_NUMBER}/${TARGET_ROUTE_CODE} module for "${TEST_NAME}": ${modErr?.message || 'not found'}`);
    process.exit(1);
  }
  console.log(`Target module: practice_test_modules.id = ${modRow.id} (${TEST_NAME} — ${TARGET_SUBJECT}/M${TARGET_MODULE_NUMBER}/${TARGET_ROUTE_CODE})`);

  // 2. Load the current items so we can show the diff at the end.
  const { data: currentItems, error: currentErr } = await svc
    .from('practice_test_module_items')
    .select('id, ordinal, question_version_id')
    .eq('practice_test_module_id', modRow.id)
    .order('ordinal', { ascending: true });
  if (currentErr) {
    console.error(`Failed to load current module items: ${currentErr.message}`);
    process.exit(1);
  }
  console.log(`Current module items: ${currentItems?.length || 0}`);

  // 3. Match expected questions against the `questions` table.
  const externalIds = EXPECTED.map((e) => e.externalId);
  const questionIds = EXPECTED.map((e) => e.questionId);

  const { data: byExt, error: extErr } = await svc
    .from('questions')
    .select('id, question_id, source_external_id')
    .in('source_external_id', externalIds);
  if (extErr) {
    console.error(`Query by source_external_id failed: ${extErr.message}`);
    process.exit(1);
  }

  const { data: byQid, error: qidErr } = await svc
    .from('questions')
    .select('id, question_id, source_external_id')
    .in('question_id', questionIds);
  if (qidErr) {
    console.error(`Query by question_id failed: ${qidErr.message}`);
    process.exit(1);
  }

  // Build two lookup maps.
  const byExternal = new Map();
  for (const q of byExt || []) {
    if (q.source_external_id) byExternal.set(q.source_external_id, q);
  }
  const byQuestionId = new Map();
  for (const q of byQid || []) {
    if (q.question_id) byQuestionId.set(q.question_id, q);
  }

  // 4. For each expected row, decide which `questions.id` we'll use.
  const resolved = EXPECTED.map((e) => {
    const viaExt = byExternal.get(e.externalId);
    const viaQid = byQuestionId.get(e.questionId);
    const pick = viaExt || viaQid;
    return {
      ...e,
      question_uuid: pick?.id || null,
      matched_by: viaExt ? 'source_external_id' : viaQid ? 'question_id' : null,
      db_row: pick || null,
    };
  });

  // 5. For every matched question_uuid, fetch its question_versions and
  //    decide which to use. Strategy: prefer a version that's already
  //    referenced by other practice_test_module_items (for any module),
  //    since that's the "in use" version. Tiebreaker: any version.
  const matchedUuids = resolved.filter((r) => r.question_uuid).map((r) => r.question_uuid);
  const { data: allVersions, error: versErr } = matchedUuids.length
    ? await svc
        .from('question_versions')
        .select('id, question_id')
        .in('question_id', matchedUuids)
    : { data: [] };
  if (versErr) {
    console.error(`question_versions fetch failed: ${versErr.message}`);
    process.exit(1);
  }

  const versionsByQuestion = new Map();
  for (const v of allVersions || []) {
    if (!versionsByQuestion.has(v.question_id)) versionsByQuestion.set(v.question_id, []);
    versionsByQuestion.get(v.question_id).push(v);
  }

  // Fetch usage counts for each version across practice_test_module_items
  // (so we can pick the one that's already linked elsewhere).
  const allVersionIds = (allVersions || []).map((v) => v.id);
  const usageByVersion = new Map();
  if (allVersionIds.length) {
    // Query in batches of 100 in case the list is large.
    for (let i = 0; i < allVersionIds.length; i += 100) {
      const slice = allVersionIds.slice(i, i + 100);
      const { data: links, error: linkErr } = await svc
        .from('practice_test_module_items')
        .select('question_version_id')
        .in('question_version_id', slice);
      if (linkErr) {
        console.error(`practice_test_module_items lookup failed: ${linkErr.message}`);
        process.exit(1);
      }
      for (const l of links || []) {
        usageByVersion.set(l.question_version_id, (usageByVersion.get(l.question_version_id) || 0) + 1);
      }
    }
  }

  // Pick the best version per question.
  const withVersion = resolved.map((r) => {
    if (!r.question_uuid) return { ...r, question_version_id: null, version_pick_reason: 'no question match' };
    const versions = versionsByQuestion.get(r.question_uuid) || [];
    if (versions.length === 0) return { ...r, question_version_id: null, version_pick_reason: 'no question_versions row' };
    if (versions.length === 1) {
      return { ...r, question_version_id: versions[0].id, version_pick_reason: 'only version' };
    }
    // Multiple versions — prefer one already referenced elsewhere.
    const sorted = [...versions].sort((a, b) => (usageByVersion.get(b.id) || 0) - (usageByVersion.get(a.id) || 0));
    const top = sorted[0];
    const topUsage = usageByVersion.get(top.id) || 0;
    return {
      ...r,
      question_version_id: top.id,
      version_pick_reason: topUsage > 0
        ? `most-linked of ${versions.length} versions (used ${topUsage}x)`
        : `first of ${versions.length} unlinked versions`,
      ambiguous_versions: versions.length > 1 ? versions.map((v) => v.id) : undefined,
    };
  });

  // 6. Report.
  console.log('\n─── Match report ───');
  let matchedCount = 0;
  let missingCount = 0;
  for (const r of withVersion) {
    const tag = r.question_version_id ? '✓' : '✗';
    const how = r.matched_by ? `[${r.matched_by}]` : '[UNMATCHED]';
    const dom = RW_DOMAINS.has(r.primary) ? r.primary : `${r.primary}!!`;
    const current = currentItems?.find((c) => c.ordinal === r.ordinal);
    const same = current?.question_version_id === r.question_version_id ? ' (already correct)' : '';
    console.log(
      `  ${tag} #${String(r.ordinal).padStart(2, '0')} ${how.padEnd(22)} ${dom} ${r.hint}${same}`
    );
    if (r.question_version_id) matchedCount++;
    else missingCount++;
  }
  console.log(`\nMatched: ${matchedCount}/${EXPECTED.length}.  Missing: ${missingCount}.`);

  // 7. Domain sanity check — every entry should have a RW primary code.
  const nonRw = withVersion.filter((r) => !RW_DOMAINS.has(r.primary));
  if (nonRw.length) {
    console.warn(`\n⚠ ${nonRw.length} expected entries have non-RW primary_class_cd — typo in the embedded list?`);
  }

  if (!APPLY) {
    console.log('\nRead-only run. Pass --apply to perform the repair.');
    return;
  }

  // ─── APPLY PATH ──────────────────────────────────────────────────────
  if (missingCount > 0) {
    console.error(`\nRefusing to --apply: ${missingCount} expected questions are missing from the DB.`);
    console.error('Re-import the missing questions first, or share the unmatched list so we can map them by hand.');
    process.exit(2);
  }

  // Check for existing attempts against this module.
  const { data: existingAttempts, error: existingErr } = await svc
    .from('practice_test_module_attempts')
    .select('id')
    .eq('practice_test_module_id', modRow.id);
  if (existingErr) {
    console.error(`Failed to check for existing attempts: ${existingErr.message}`);
    process.exit(1);
  }
  const attemptCount = existingAttempts?.length || 0;
  if (attemptCount > 0 && !FORCE_ATTEMPTS) {
    console.error(`\nRefusing to --apply: ${attemptCount} existing practice_test_module_attempts reference the broken module.`);
    console.error('Those attempts are linked to the wrong question_version_ids. Either:');
    console.error('  (a) delete them first (they are all against the broken content anyway), or');
    console.error('  (b) re-run with --force-attempts to repair the module in place and clean the attempts up separately.');
    process.exit(2);
  }

  console.log('\n─── Applying repair ───');
  let updated = 0;
  const errors = [];
  for (const r of withVersion) {
    const current = currentItems?.find((c) => c.ordinal === r.ordinal);
    if (!current) {
      errors.push({ ordinal: r.ordinal, error: 'no existing module_item row at this ordinal' });
      continue;
    }
    if (current.question_version_id === r.question_version_id) {
      updated++; // idempotent no-op
      continue;
    }
    const { error: updErr } = await svc
      .from('practice_test_module_items')
      .update({ question_version_id: r.question_version_id })
      .eq('id', current.id);
    if (updErr) {
      errors.push({ ordinal: r.ordinal, error: updErr.message });
      continue;
    }
    updated++;
  }

  console.log(`Updated ${updated}/${EXPECTED.length} rows.`);
  if (errors.length) {
    console.error('\nErrors:');
    for (const e of errors) console.error(`  #${e.ordinal}: ${e.error}`);
    process.exit(2);
  }
  console.log('✓ Repair complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
