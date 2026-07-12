#!/usr/bin/env node
// Generates docs/authorization-matrix.md from code.
//
// Enumerates every server entry point and the auth guards it calls:
//   - Route handlers:  app/**/route.{js,ts}      (exported HTTP methods)
//   - Server Actions:  files containing 'use server' (exported async fns)
//   - Middleware:      proxy.js
//
// Guard detection is file-level (which guard calls appear in the file),
// not per-function — precise enough to answer "does this entry point
// have ANY auth?" and to diff over time, without needing a full AST
// pass. Entry points with NO detected guard are flagged loudly.
//
// The hand-written 2026-05-04 matrix (with its per-row analysis) is
// preserved at docs/history/authorization-matrix-2026-05-04.md.
//
// Run: node scripts/generate-auth-matrix.mjs   (CI verifies freshness)

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;

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

const GUARDS = [
  // [display name, detection regex]
  ['requireRole', /requireRole\(\s*\[([^\]]*)\]/g],
  ['requireUser', /\brequireUser\(/],
  ['requireWriter', /\brequireWriter\(/],
  ['assertWriter', /\bassertWriter\(/],
  ['requireServiceRole', /requireServiceRole\(/],
  ['requireExternalApiAccess', /requireExternalApiAccess\(/],
  ['validateExternalApiKey', /validateExternalApiKey\(/],
  ['stripe signature', /constructEvent\(/],
  ['rateLimit', /\brateLimit\(/],
  ['service client (RLS bypass)', /createServiceClient\(/],
];

function detectGuards(text) {
  const found = [];
  for (const [name, re] of GUARDS) {
    if (name === 'requireRole') {
      const roles = new Set();
      for (const m of text.matchAll(re)) {
        m[1]
          .split(',')
          .map((r) => r.replace(/['"`\s]/g, ''))
          .filter(Boolean)
          .forEach((r) => roles.add(r));
      }
      if (roles.size > 0) {
        found.push(`requireRole[${[...roles].sort().join('|')}]`);
      } else {
        // Called with a variable (e.g. requireRole(TUTOR_ROLES)) —
        // resolve the constant's literal if it's defined in-file,
        // otherwise report the variable name.
        const dyn = text.match(/requireRole\(\s*(\w+)\s*\)/);
        if (dyn) {
          const constDef = text.match(
            new RegExp(`${dyn[1]}[^=]*=\\s*\\[([^\\]]*)\\]`),
          );
          if (constDef) {
            const resolved = constDef[1]
              .split(',')
              .map((r) => r.replace(/['"`\s]/g, ''))
              .filter(Boolean)
              .sort()
              .join('|');
            found.push(`requireRole[${resolved}]`);
          } else {
            found.push(`requireRole(${dyn[1]})`);
          }
        }
      }
    } else if (re.test(text)) {
      found.push(name);
    }
  }
  return found;
}

function exportedHttpMethods(text) {
  const methods = [];
  for (const m of text.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b/g)) {
    methods.push(m[1]);
  }
  return methods;
}

function exportedActionNames(text) {
  const names = [];
  for (const m of text.matchAll(/export\s+async\s+function\s+(\w+)/g)) {
    names.push(m[1]);
  }
  return names;
}

const allFiles = [...walk(join(ROOT, 'app')), ...walk(join(ROOT, 'lib'))]
  .filter((f) => /\.(js|jsx|ts|tsx)$/.test(f));

const routes = [];
const actions = [];

for (const file of allFiles) {
  const rel = relative(ROOT, file);
  const text = readFileSync(file, 'utf8');

  if (/\/route\.(js|ts)$/.test(rel)) {
    const urlPath = '/' + rel
      .replace(/^app\//, '')
      .replace(/\/route\.(js|ts)$/, '')
      .replace(/\([^)]*\)\//g, ''); // strip route groups
    routes.push({
      path: urlPath,
      file: rel,
      methods: exportedHttpMethods(text).join(', ') || '—',
      guards: detectGuards(text),
    });
  } else if (/^\s*['"]use server['"]/m.test(text)) {
    actions.push({
      file: rel,
      fns: exportedActionNames(text),
      guards: detectGuards(text),
    });
  }
}

routes.sort((a, b) => a.path.localeCompare(b.path));
actions.sort((a, b) => a.file.localeCompare(b.file));

const proxyText = readFileSync(join(ROOT, 'proxy.js'), 'utf8');
const proxyGuards = detectGuards(proxyText);

const unguardedRoutes = routes.filter((r) => r.guards.length === 0);
const unguardedActions = actions.filter((a) => a.guards.length === 0);

function guardCell(guards) {
  return guards.length > 0 ? guards.join(' + ') : '⚠️ **none detected**';
}

const lines = [];
lines.push('# Authorization matrix (generated)');
lines.push('');
lines.push('> **Status: Generated document — do not edit by hand.**');
lines.push('> Produced by `scripts/generate-auth-matrix.mjs`; CI fails if this');
lines.push('> file is stale. Guard detection is file-level: it answers "which');
lines.push('> auth guards does this entry point\'s file call," not which guard');
lines.push('> wraps which line. RLS remains the authoritative layer beneath');
lines.push('> all of it (`can_view()` + per-table policies). The hand-written');
lines.push('> 2026-05-04 matrix with per-row analysis is preserved at');
lines.push('> `docs/history/authorization-matrix-2026-05-04.md`.');
lines.push('');
lines.push('## Middleware (`proxy.js`)');
lines.push('');
lines.push(`Runs on every matched request. Detected: ${proxyGuards.join(', ') || 'session refresh only'}.`);
lines.push('');
lines.push('## HTTP route handlers');
lines.push('');
lines.push('| Path | Methods | Guards (file-level) |');
lines.push('|---|---|---|');
for (const r of routes) {
  lines.push(`| \`${r.path}\` | ${r.methods} | ${guardCell(r.guards)} |`);
}
lines.push('');
lines.push('## Server Actions');
lines.push('');
lines.push('| Module | Exported actions | Guards (file-level) |');
lines.push('|---|---|---|');
for (const a of actions) {
  const fns = a.fns.length > 0 ? a.fns.map((f) => `\`${f}\``).join(', ') : '—';
  lines.push(`| \`${a.file}\` | ${fns} | ${guardCell(a.guards)} |`);
}
lines.push('');
lines.push('## Attention list');
lines.push('');
if (unguardedRoutes.length === 0 && unguardedActions.length === 0) {
  lines.push('Every enumerated entry point calls at least one guard. ✅');
} else {
  lines.push('Entry points with **no detected guard** (verify each is');
  lines.push('deliberately public, or fix):');
  lines.push('');
  for (const r of unguardedRoutes) lines.push(`- Route \`${r.path}\` (${r.file})`);
  for (const a of unguardedActions) lines.push(`- Actions module \`${a.file}\``);
}
lines.push('');
lines.push(`_${routes.length} route handlers, ${actions.length} server-action modules enumerated._`);
lines.push('');

writeFileSync(join(ROOT, 'docs/authorization-matrix.md'), lines.join('\n'));
console.log(
  `Wrote docs/authorization-matrix.md — ${routes.length} routes, ` +
  `${actions.length} action modules, ` +
  `${unguardedRoutes.length + unguardedActions.length} unguarded entries flagged.`,
);
