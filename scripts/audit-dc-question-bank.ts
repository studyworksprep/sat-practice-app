// Read-only College Board source audit for the five/six-digit DC cohort.
// Input is a saved production snapshot; this script has no database client.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

const root = resolve(process.argv[2] ?? 'tmp/dc-question-audit-2026-10-08');
const rows = JSON.parse(await readFile(resolve(root, 'before.json'), 'utf8'));
const endpoint = 'https://qbank-api.collegeboard.org/msreportingquestionbank-prod/questionbank/digital/get-question';
assert.ok(rows.length > 0);
assert.equal(new Set(rows.map((r: any) => r.id)).size, rows.length);
await mkdir(resolve(root, 'originals'), { recursive: true });
const manifest: any[] = [];
for (const row of rows) {
  assert.match(row.source_external_id, /^[0-9]{5,6}-DC$/);
  const path = resolve(root, 'originals', row.display_code + '.json');
  let raw: string | undefined;
  let fetchedAt: string | undefined;
  try {
    raw = await readFile(path, 'utf8');
    const old = JSON.parse(await readFile(resolve(root, 'source-manifest.json'), 'utf8'));
    fetchedAt = old.find((m: any) => m.code === row.display_code)?.fetched_at;
  } catch {}
  if (!raw) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(endpoint, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ external_id: row.source_external_id }),
          signal: AbortSignal.timeout(25000),
        });
        if (!response.ok) throw new Error('HTTP ' + response.status);
        raw = await response.text();
        const source = JSON.parse(raw);
        assert.ok(source.item_id === row.source_external_id || source.externalid === row.source_external_id);
        assert.ok(source.prompt || source.stem || source.body);
        fetchedAt = new Date().toISOString();
        await writeFile(path, raw);
        break;
      } catch (error) {
        raw = undefined;
        if (attempt === 2) manifest.push({ code: row.display_code, external_id: row.source_external_id, error: String(error) });
        else await delay(1500 * (attempt + 1));
      }
    }
    await delay(400);
  }
  if (raw) {
    const source = JSON.parse(raw);
    assert.ok(source.item_id === row.source_external_id || source.externalid === row.source_external_id);
    manifest.push({ code: row.display_code, external_id: row.source_external_id, endpoint,
      fetched_at: fetchedAt ?? null, sha256: createHash('sha256').update(raw).digest('hex'),
      bytes: Buffer.byteLength(raw), format: source.stem ? 'modern' : 'older',
      missing_prompt: !source.stem && !source.prompt, path });
  }
  await writeFile(resolve(root, 'source-manifest.json'), JSON.stringify(manifest, null, 2));
  if (manifest.length % 25 === 0) console.log(JSON.stringify({ fetched: manifest.length, total: rows.length }));
}
console.log(JSON.stringify({ total: rows.length, verified: manifest.filter(m => !m.error).length,
  errors: manifest.filter(m => m.error), live_writes: 0 }));
