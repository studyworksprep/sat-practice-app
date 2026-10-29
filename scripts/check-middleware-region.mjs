#!/usr/bin/env node
// Check the deployment artifact: accepting source config alone is insufficient.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const readJson = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
const { regions } = readJson('../vercel.json');
const { middleware } = readJson('../.next/server/middleware-manifest.json');
const entries = Object.values(middleware);
assert.ok(entries.length > 0, 'Regional Edge middleware is missing from the build');
for (const entry of entries) {
  const actual = typeof entry.regions === 'string' ? [entry.regions] : entry.regions;
  assert.deepEqual(actual, regions, `${entry.name} must run beside the application/database`);
}
console.log(`Middleware deployment region verified: ${regions.join(', ')}`);
