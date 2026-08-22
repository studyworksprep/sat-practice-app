#!/usr/bin/env node
// Plan step 1.5 — flip the tutor-confirmed transfer and retrieval checks
// to one-shot (allow_retry: false) across the lesson template specs.
// The designation list is the confirmed table in
// docs/lesson-transfer-checks-proposal-2026-08.md, keyed on stable block
// ids. Hints on flipped checks are left in place: they're inert on a
// one-shot check, and deleting authored content would make a revert
// lossy.
//
// The specs are hand-formatted JSON (small objects inline), so this
// edits the raw text surgically instead of JSON.parse → stringify, then
// re-parses both versions and asserts the ONLY change is the designated
// allow_retry flips. Safe to re-run: already-false designations are
// skipped.
//
// Run: node scripts/apply-one-shot-checks.mjs

import fs from 'node:fs';
import path from 'node:path';

const SPEC_DIR = 'docs/lesson-template-specs';

// file basename → confirmed one-shot block ids (transfer + retrieval).
const DESIGNATIONS = {
  'advanced-factoring-non-monic-trinomials-and-cubes.json': [
    'mixed_transfer_non_monic_one', 'mixed_transfer_non_monic_two', 'mixed_transfer_cubes',
    'retrieval_check',
  ],
  'boundaries-punctuation-order.json': [
    'practice_full_stop', 'practice_colon', 'practice_dash', 'practice_comma',
    'practice_serial_semicolon', 'final_retrieval',
  ],
  'boundaries-transition-word-placement-and-logic.json': [
    'transfer_before_full_stop', 'transfer_after_full_stop', 'final_retrieval',
  ],
  'command-of-evidence-clear-the-claim.json': [
    'aggregation_check', 'hard_bridge_check', 'final_retrieval',
  ],
  'custom-regression-from-data.json': [
    'transfer_setup_check', 'transfer_equation_check', 'final_retrieval_check',
  ],
  'desmos-list-tools.json': [
    'practice_transformed_total', 'practice_two_groups_mean', 'final_retrieval_check',
  ],
  'factor-out-greatest-common-factor.json': [
    'independent_transfer_one', 'independent_transfer_two', 'final_retrieval',
  ],
  'factoring-polynomials-gcf-trinomials-difference-of-squares.json': [
    'transfer_one', 'transfer_two', 'transfer_three', 'retrieval_check',
  ],
  'find-the-equation-with-my-numbers.json': [
    'independent_transfer', 'final_retrieval',
  ],
  'functions-and-function-notation.json': [
    'transfer_result_check', 'requested_expression_check', 'final_retrieval_check',
  ],
  'good-cop-bad-cop-reading-answers.json': [
    // No retrieval check exists yet; Phase 4.4 adds it.
    'final_question_check', 'final_wrong_choice_check',
  ],
  'inference-minimum-supported-conclusion.json': [
    'independent_transfer_check', 'final_retrieval_check',
  ],
  'my-numbers-strategy.json': [
    'independent_transfer_check', 'final_retrieval',
  ],
  'percentages-and-percent-change.json': [
    'practice_complex_result', 'final_retrieval_check',
  ],
  'probability-from-tables-favorable-over-total.json': [
    'transfer_given_probability_check', 'transfer_no_given_check', 'final_retrieval',
  ],
  'rates-and-units-in-two-variable-equations.json': [
    'independent_transfer_check', 'final_retrieval_check',
  ],
  'reading-comprehension-process-and-pre-answer.json': [
    'independent_transfer_one_check', 'independent_transfer_two_check', 'final_retrieval',
  ],
  'rhetorical-synthesis-goal-first.json': [
    'independent_transfer_check', 'final_retrieval_check',
  ],
  'right-triangle-trigonometry-sohcahtoa.json': [
    'independent_transfer_check', 'final_retrieval_check',
  ],
  'scale-factor-and-similar-shapes.json': [
    'practice_volume_to_area', 'practice_area_to_volume', 'final_retrieval_check',
  ],
  'similar-triangles.json': [
    'ordinary_transfer_check', 'right_altitude_transfer_check', 'final_retrieval_check',
  ],
  'solving-equations-by-graphing-x-intercepts.json': [
    'transfer_exact_check', 'practice_three_answer', 'final_retrieval_check',
  ],
  'solving-equations-with-regression.json': [
    'practice_system_setup', 'practice_method_choice', 'final_retrieval_check',
  ],
  'solving-systems-of-equations-by-graphing.json': [
    'transfer_answer_check', 'final_retrieval_check',
  ],
  'special-right-triangles-45-45-90-and-30-60-90.json': [
    'independent_square_transfer', 'independent_equilateral_variable_transfer',
    'final_retrieval_check',
  ],
  'special-systems-no-solution-and-infinitely-many.json': [
    'transfer_check', 'final_retrieval_check',
  ],
  'standard-deviation.json': [
    'transfer_order_sets', 'final_retrieval_check',
  ],
  'standard-regression-from-data.json': [
    'transfer_points_check', 'transfer_model_check', 'final_retrieval_check',
  ],
  'subject-verb-agreement-odd-one-out.json': [
    'independent_transfer_check', 'final_eligibility_check', 'retrieval_check',
  ],
  'surveys-sampling-and-margin-of-error.json': [
    'transfer_scope_check', 'transfer_statement_check', 'transfer_range_check',
    'final_retrieval',
  ],
  'transitions-bracket-the-pivot.json': [
    'independent_transfer_local_scale', 'final_retrieval',
  ],
  'words-in-context-read-predict-match.json': [
    'transfer_one_check', 'transfer_two_check', 'transfer_three_check', 'final_retrieval',
  ],
};

function findBlock(spec, id) {
  return (spec.blocks || []).find((b) => b?.id === id) || null;
}

function fail(message) {
  console.error(`✗ ${message}`);
  process.exitCode = 1;
}

let flipped = 0;
let skipped = 0;

for (const [file, ids] of Object.entries(DESIGNATIONS)) {
  const filePath = path.join(SPEC_DIR, file);
  if (!fs.existsSync(filePath)) {
    fail(`${file}: spec file not found`);
    continue;
  }
  const before = fs.readFileSync(filePath, 'utf8');
  const beforeSpec = JSON.parse(before);
  let raw = before;

  for (const id of ids) {
    const block = findBlock(beforeSpec, id);
    if (!block) {
      fail(`${file}: no block with id "${id}"`);
      continue;
    }
    if (block.block_type !== 'check') {
      fail(`${file}: block "${id}" is ${block.block_type}, not a check`);
      continue;
    }
    if (block.content?.allow_retry === false) {
      skipped += 1;
      continue;
    }

    const idMarker = `"id": "${id}"`;
    const idIdx = raw.indexOf(idMarker);
    if (idIdx < 0 || raw.indexOf(idMarker, idIdx + 1) >= 0) {
      fail(`${file}: id marker for "${id}" is missing or ambiguous in the raw text`);
      continue;
    }
    // allow_retry must belong to THIS block: it has to appear before the
    // next block starts (every spec block opens with "kind").
    const nextBlockIdx = raw.indexOf('"kind"', idIdx);
    const retryIdx = raw.indexOf('"allow_retry": true', idIdx);
    if (retryIdx < 0 || (nextBlockIdx >= 0 && retryIdx > nextBlockIdx)) {
      fail(`${file}: could not locate "allow_retry": true inside block "${id}"`);
      continue;
    }
    raw = `${raw.slice(0, retryIdx)}"allow_retry": false${raw.slice(retryIdx + '"allow_retry": true'.length)}`;
    flipped += 1;
  }

  if (process.exitCode) continue;

  // Verify: parse the edited text and assert the only differences are
  // the designated flips.
  const afterSpec = JSON.parse(raw);
  const revert = JSON.parse(raw);
  for (const id of ids) {
    const block = findBlock(afterSpec, id);
    if (block.content?.allow_retry !== false) {
      fail(`${file}: verification failed — "${id}" is not one-shot after the edit`);
    }
    const revertBlock = findBlock(revert, id);
    revertBlock.content.allow_retry = beforeSpec.blocks.find((b) => b?.id === id).content.allow_retry;
  }
  if (JSON.stringify(revert) !== JSON.stringify(beforeSpec)) {
    fail(`${file}: verification failed — the edit changed more than the designated flags`);
  }

  if (!process.exitCode && raw !== before) {
    fs.writeFileSync(filePath, raw);
  }
}

if (process.exitCode) {
  console.error('Aborted: fix the errors above (files with errors were not written).');
  process.exit(1);
}

console.log(`✓ ${flipped} checks flipped to one-shot, ${skipped} already one-shot, across ${Object.keys(DESIGNATIONS).length} specs.`);
