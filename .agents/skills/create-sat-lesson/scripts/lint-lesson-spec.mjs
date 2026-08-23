#!/usr/bin/env node
// Item-quality lint for one lesson spec (plan step 2.1). Sibling to
// validate-lesson-spec.mjs: the validator gates structure (errors); this
// reports quality heuristics (always warnings — exit 0 unless the spec
// fails to compile). Run after every content edit alongside the
// validator; the corpus-wide CI report lives in
// scripts/check-lesson-specs.mjs.

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const input = process.argv[2];
if (!input) {
  console.error('Usage: node .agents/skills/create-sat-lesson/scripts/lint-lesson-spec.mjs <lesson-json-file>');
  process.exit(1);
}

const repoRoot = process.cwd();
const [{ parseLessonTemplateSpecText, compileLessonTemplateSpec }, { lintLessonBlocks }] =
  await Promise.all([
    import(pathToFileURL(path.join(repoRoot, 'lib', 'lesson', 'template-import.mjs')).href),
    import(pathToFileURL(path.join(repoRoot, 'lib', 'lesson', 'lesson-lint.mjs')).href),
  ]);

const raw = await fs.readFile(path.resolve(repoRoot, input), 'utf8');
const parsed = parseLessonTemplateSpecText(raw);
if (parsed.error) {
  console.error(`JSON parse failed: ${parsed.error}`);
  process.exit(1);
}

const compiled = compileLessonTemplateSpec(parsed.spec);
if (compiled.issues.some((i) => i.severity === 'error')) {
  console.error('Spec does not compile — run the validator first.');
  process.exit(1);
}

const { warnings, stats } = lintLessonBlocks(compiled.blocks, { title: parsed.spec.title });

console.log(`Lesson: ${parsed.spec.title || path.basename(input)}`);
console.log(`Checks: ${stats.checkCount}; keyed-longest: ${stats.keyedLongestCount} (${Math.round(stats.keyedLongestRate * 100)}%)`);
console.log(`Lint warnings: ${warnings.length}`);
for (const w of warnings) {
  console.log(`[${w.code}] step ${w.step} (${w.blockId}): ${w.message}${w.detail ? ` — ${w.detail}` : ''}`);
}
if (warnings.length === 0) console.log('No lint findings.');
