#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const input = process.argv[2];

if (!input) {
  console.error('Usage: node .agents/skills/create-sat-lesson/scripts/validate-lesson-spec.mjs <lesson-json-file>');
  process.exit(1);
}

const repoRoot = process.cwd();
const inputPath = path.resolve(repoRoot, input);
const importerPath = path.join(repoRoot, 'lib', 'lesson', 'template-import.mjs');
const validatorPath = path.join(repoRoot, 'lib', 'lesson', 'lesson-validation.mjs');

const [{ parseLessonTemplateSpecText, compileLessonTemplateSpec }, { validateLessonBlocks }] =
  await Promise.all([
    import(pathToFileURL(importerPath).href),
    import(pathToFileURL(validatorPath).href),
  ]);

const raw = await fs.readFile(inputPath, 'utf8');
const parsed = parseLessonTemplateSpecText(raw);

if (parsed.error) {
  console.error(`JSON parse failed: ${parsed.error}`);
  process.exit(1);
}

const compiled = compileLessonTemplateSpec(parsed.spec);
const compileErrors = compiled.issues.filter((item) => item.severity === 'error');
const compileWarnings = compiled.issues.filter((item) => item.severity === 'warning');
const validation = validateLessonBlocks(compiled.blocks);

console.log(`Lesson: ${parsed.spec.title || path.basename(inputPath)}`);
console.log(`Compiled blocks: ${compiled.blocks.length}`);
console.log(`Compiler errors: ${compileErrors.length}; warnings: ${compileWarnings.length}`);
console.log(`Validator errors: ${validation.summary.errorCount}; warnings: ${validation.summary.warningCount}`);

for (const item of [...compiled.issues, ...validation.errors, ...validation.warnings]) {
  const location = item.path || item.blockId || 'n/a';
  console.log(`[${item.severity}] ${location}: ${item.message}`);
  if (item.suggestion) console.log(`  fix: ${item.suggestion}`);
}

if (compileErrors.length > 0 || validation.summary.errorCount > 0) {
  process.exit(1);
}

console.log('Lesson template validation passed with no errors.');
