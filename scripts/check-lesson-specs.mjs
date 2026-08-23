#!/usr/bin/env node
// CI gate + report for the lesson spec corpus (plan step 2.1).
//
// Two layers, deliberately different in strictness:
//   1. VALIDATOR (lesson-validation.mjs) — structural errors FAIL the
//      build. Every spec must compile and validate.
//   2. LINTER (lesson-lint.mjs) — item-quality heuristics are printed
//      as a per-lesson report with corpus totals, and NEVER fail the
//      build: each finding is closed or deferred by a human via
//      docs/lesson-lint-punch-list-2026-08.md.
//
// Run: node scripts/check-lesson-specs.mjs

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const SPEC_DIR = path.join(repoRoot, 'docs', 'lesson-template-specs');

const [{ parseLessonTemplateSpecText, compileLessonTemplateSpec }, { validateLessonBlocks }, { lintLessonBlocks }] =
  await Promise.all([
    import(pathToFileURL(path.join(repoRoot, 'lib', 'lesson', 'template-import.mjs')).href),
    import(pathToFileURL(path.join(repoRoot, 'lib', 'lesson', 'lesson-validation.mjs')).href),
    import(pathToFileURL(path.join(repoRoot, 'lib', 'lesson', 'lesson-lint.mjs')).href),
  ]);

const files = fs.readdirSync(SPEC_DIR).filter((f) => f.endsWith('.json')).sort();
let hardFailures = 0;
let totalWarnings = 0;
let totalChecks = 0;
let totalKeyedLongest = 0;
const byCode = new Map();
let worstLesson = { title: null, rate: 0 };

for (const file of files) {
  const parsed = parseLessonTemplateSpecText(fs.readFileSync(path.join(SPEC_DIR, file), 'utf8'));
  if (parsed.error) {
    console.error(`✗ ${file}: JSON parse failed — ${parsed.error}`);
    hardFailures += 1;
    continue;
  }
  const compiled = compileLessonTemplateSpec(parsed.spec);
  const compileErrors = compiled.issues.filter((i) => i.severity === 'error');
  const validation = validateLessonBlocks(compiled.blocks);
  if (compileErrors.length > 0 || validation.summary.errorCount > 0) {
    console.error(`✗ ${file}: ${compileErrors.length} compile + ${validation.summary.errorCount} validator errors`);
    for (const issue of [...compileErrors, ...validation.errors]) {
      console.error(`    [${issue.code ?? 'compile'}] ${issue.path ?? issue.blockId ?? ''}: ${issue.message}`);
    }
    hardFailures += 1;
    continue;
  }

  const { warnings, stats } = lintLessonBlocks(compiled.blocks, { title: parsed.spec.title });
  totalWarnings += warnings.length;
  totalChecks += stats.checkCount;
  totalKeyedLongest += stats.keyedLongestCount;
  if (stats.keyedLongestRate > worstLesson.rate) {
    worstLesson = { title: parsed.spec.title || file, rate: stats.keyedLongestRate };
  }
  for (const w of warnings) byCode.set(w.code, (byCode.get(w.code) || 0) + 1);

  const label = `${parsed.spec.title || file} — ${warnings.length} lint warning${warnings.length === 1 ? '' : 's'}, keyed-longest ${stats.keyedLongestCount}/${stats.checkCount}`;
  console.log(warnings.length > 0 ? `⚠ ${label}` : `✓ ${label}`);
  for (const w of warnings) {
    console.log(`    [${w.code}] step ${w.step} (${w.blockId}): ${w.message}`);
  }
}

console.log('');
console.log(`Corpus: ${files.length} specs, ${totalChecks} checks, ${totalWarnings} lint warnings.`);
console.log(`Keyed-longest rate: ${(100 * totalKeyedLongest / Math.max(1, totalChecks)).toFixed(1)}% (${totalKeyedLongest}/${totalChecks}); target < 30% corpus-wide, no lesson above 50%.`);
if (worstLesson.title) {
  console.log(`Highest lesson keyed-longest rate: ${worstLesson.title} at ${(100 * worstLesson.rate).toFixed(0)}%.`);
}
for (const [code, n] of [...byCode.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${code}: ${n}`);
}

if (hardFailures > 0) {
  console.error(`\n✗ ${hardFailures} spec(s) failed validation.`);
  process.exit(1);
}
console.log('\n✓ All specs validate. Lint findings are warnings only — see docs/lesson-lint-punch-list-2026-08.md.');
