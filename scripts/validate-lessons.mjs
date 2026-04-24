#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { validateLessonBlocks } from '../lib/lesson/lesson-validation.mjs';

async function main() {
  const input = process.argv[2];
  if (!input) {
    console.error('Usage: node scripts/validate-lessons.mjs <lesson-json-file>');
    process.exit(1);
  }

  const fullPath = path.resolve(process.cwd(), input);
  const raw = await fs.readFile(fullPath, 'utf8');
  const parsed = JSON.parse(raw);

  const lessons = Array.isArray(parsed) ? parsed : [parsed];
  let totalErrors = 0;

  for (const lesson of lessons) {
    const lessonId = lesson.id || lesson.title || 'unknown_lesson';
    const blocks = Array.isArray(lesson.blocks) ? lesson.blocks : [];
    const report = validateLessonBlocks(blocks);
    totalErrors += report.summary.errorCount;

    console.log(`\nLesson: ${lessonId}`);
    console.log(`Errors: ${report.summary.errorCount}, Warnings: ${report.summary.warningCount}`);
    for (const line of report.workflowVisualization || []) console.log(`  ${line}`);

    for (const issue of [...report.errors, ...report.warnings]) {
      console.log(`  [${issue.severity}] ${issue.code} (${issue.blockId || 'n/a'}) ${issue.message}`);
      if (issue.path) console.log(`    path: ${issue.path}`);
      if (issue.suggestion) console.log(`    fix: ${issue.suggestion}`);
    }
  }

  if (totalErrors > 0) {
    console.error(`\nValidation failed with ${totalErrors} error(s).`);
    process.exit(1);
  }

  console.log('\nValidation passed with no errors.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
