#!/usr/bin/env node
// CI hygiene gate — two one-way ratchets. Run: node scripts/check-code-hygiene.mjs
//
// 1. TypeScript ratchet. The TS policy says new files are .ts/.tsx and
//    existing .js/.jsx files convert opportunistically. This check makes
//    the policy self-enforcing: the count of .js/.jsx files under app/
//    and lib/ may only go DOWN. When you convert a file, lower the
//    baseline below to the new count (the error message tells you the
//    number). Adding a new .js/.jsx file fails the build — write it as
//    .ts/.tsx instead.
//
// 2. Retired-terms check. Docs and comments in this repo have a history
//    of describing machinery that no longer exists, which misleads both
//    humans and coding agents. Terms tied to retired patterns are
//    forbidden outside the allowlisted historical documents.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

// ── 1. TypeScript ratchet ────────────────────────────────────────────
// Baseline last lowered 2026-07-12 (seam conversions: supabase/server,
// api/auth, api/paginate, externalAuth).
const JS_FILE_BASELINE = 315;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const codeFiles = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))];
const jsFiles = codeFiles.filter((f) => /\.(js|jsx)$/.test(f));

let failed = false;

if (jsFiles.length > JS_FILE_BASELINE) {
  failed = true;
  console.error(
    `✗ TypeScript ratchet: ${jsFiles.length} .js/.jsx files under app/+lib/ ` +
    `(baseline ${JS_FILE_BASELINE}). New code must be .ts/.tsx — do not add ` +
    `untyped files. If you renamed/split existing .js files 1:1, update ` +
    `JS_FILE_BASELINE in scripts/check-code-hygiene.mjs with a justification.`,
  );
} else if (jsFiles.length < JS_FILE_BASELINE) {
  console.log(
    `✓ TypeScript ratchet: ${jsFiles.length} .js/.jsx files (baseline ` +
    `${JS_FILE_BASELINE}) — conversions happened; lower JS_FILE_BASELINE to ` +
    `${jsFiles.length} to lock them in.`,
  );
} else {
  console.log(`✓ TypeScript ratchet: ${jsFiles.length} .js/.jsx files (at baseline).`);
}

// ── 2. Retired-terms check ──────────────────────────────────────────
// Terms that only exist in retired architecture. Case-sensitive where
// casing matters. Historical documents that legitimately describe the
// old world are allowlisted by path prefix.
const RETIRED_TERMS = [
  'question_id_map',
  'ui_version',
  'resolveLegacyQuestionIds',
  'Question Bank', // pre-rebuild student nav tab; current tab is "Practice"
  'Smart Review', // pre-rebuild review queue; current surface is Review drills
];

const ALLOWLIST_PREFIXES = [
  'docs/architecture-plan.md',
  'docs/decommission-plan.md',
  'docs/greenfield-build-plan.md',
  'docs/lesson-builder-feature-audit-2026-04-25.md',
  'docs/lesson-authoring-integration-contract-2026-04-25.md',
  'docs/history/',
  'supabase/migrations/', // migration SQL is an immutable historical record
  'scripts/check-code-hygiene.mjs', // this file names the terms
  'tests/', // specs may assert on legacy fixtures
];

const scanFiles = [
  ...codeFiles,
  ...walk(join(ROOT, 'docs')),
  ...walk(join(ROOT, 'components')),
].filter((f) => /\.(js|jsx|ts|tsx|md|mjs)$/.test(f));

const hits = [];
for (const file of scanFiles) {
  const rel = relative(ROOT, file);
  if (ALLOWLIST_PREFIXES.some((p) => rel.startsWith(p))) continue;
  const text = readFileSync(file, 'utf8');
  for (const term of RETIRED_TERMS) {
    if (text.includes(term)) {
      const line = text.slice(0, text.indexOf(term)).split('\n').length;
      hits.push(`${rel}:${line} — "${term}"`);
    }
  }
}

if (hits.length > 0) {
  failed = true;
  console.error(
    `✗ Retired terms found (these describe machinery that no longer exists;\n` +
    `  fix the text or, for a genuinely historical doc, add it to the\n` +
    `  allowlist in scripts/check-code-hygiene.mjs):`,
  );
  for (const h of hits) console.error(`    ${h}`);
} else {
  console.log('✓ Retired-terms check: clean.');
}

process.exit(failed ? 1 : 0);
