#!/usr/bin/env node
// =============================================================
// scripts/dev-db-query.mjs
// =============================================================
// Minimal helper for running SQL against the dev Supabase project
// via the Management API's /database/query endpoint. The Claude
// sandbox can't reach Postgres on port 5432, but it CAN reach
// https://api.supabase.com, so this is the path that actually
// works for interactive SQL from the agent.
//
// --- Safety rails ---------------------------------------------
//
//   1. The dev project ref is HARD-CODED below. The script refuses
//      to run if SUPABASE_DEV_PROJECT_REF doesn't match. Pointing
//      this at a different project requires editing the constant
//      on purpose — you can't do it with env vars alone.
//
//   2. The PAT is read from SUPABASE_DEV_PAT and never echoed.
//      Keep it in ~/.dev-db-env (outside the repo) and `source`
//      that file before invoking this script.
//
//   3. SELECTs and additive writes (insert/create/additive alter)
//      are fine to run without preamble. Destructive operations
//      (drop/truncate/delete without where/non-additive alter)
//      should be announced before running so a human can object.
//
// --- Usage -----------------------------------------------------
//
//   source ~/.dev-db-env
//   echo "select count(*) from public.profiles" | \
//     node scripts/dev-db-query.mjs
//
//   node scripts/dev-db-query.mjs --file path/to/query.sql
//   node scripts/dev-db-query.mjs --sql "select 1"
//
// The response is pretty-printed JSON (the array of rows that
// the Management API returns).
// =============================================================

const EXPECTED_PROJECT_REF = 'ikzhizgsawzjpuuznfid'; // dev only — NOT prod

async function main() {
  const pat = process.env.SUPABASE_DEV_PAT;
  const ref = process.env.SUPABASE_DEV_PROJECT_REF;

  if (!pat) {
    console.error(
      'SUPABASE_DEV_PAT is not set. Run `source ~/.dev-db-env` first.',
    );
    process.exit(1);
  }
  if (!ref) {
    console.error(
      'SUPABASE_DEV_PROJECT_REF is not set. Run `source ~/.dev-db-env` first.',
    );
    process.exit(1);
  }
  if (ref !== EXPECTED_PROJECT_REF) {
    console.error(
      `Refusing to run: SUPABASE_DEV_PROJECT_REF=${ref} does not match ` +
        `the hard-coded EXPECTED_PROJECT_REF=${EXPECTED_PROJECT_REF}. ` +
        `If you need to target a different project, edit this script ` +
        `on purpose — do not work around this via env vars.`,
    );
    process.exit(1);
  }

  const sql = await readSql();
  if (!sql.trim()) {
    console.error(
      'No SQL provided. Pipe via stdin, --file <path>, or --sql "<query>".',
    );
    process.exit(1);
  }

  const url = `https://api.supabase.com/v1/projects/${ref}/database/query`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${pat}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  if (!res.ok) {
    console.error(`HTTP ${res.status} ${res.statusText}`);
    console.error(text);
    process.exit(1);
  }

  try {
    const json = JSON.parse(text);
    console.log(JSON.stringify(json, null, 2));
  } catch {
    console.log(text);
  }
}

async function readSql() {
  const args = process.argv.slice(2);

  const fileIdx = args.indexOf('--file');
  if (fileIdx >= 0) {
    const path = args[fileIdx + 1];
    if (!path) {
      console.error('--file requires a path argument');
      process.exit(1);
    }
    const { readFile } = await import('node:fs/promises');
    return await readFile(path, 'utf8');
  }

  const sqlIdx = args.indexOf('--sql');
  if (sqlIdx >= 0) {
    const sql = args[sqlIdx + 1];
    if (!sql) {
      console.error('--sql requires a query argument');
      process.exit(1);
    }
    return sql;
  }

  // Default: read from stdin
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
