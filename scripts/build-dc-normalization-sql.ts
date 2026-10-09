// Produce reviewed, guarded data updates. Execution is an explicit separate step.
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { sourceHash } from '../lib/content/render-math.mjs';

type Data = Record<string, any>;
const root = resolve(process.argv[2] ?? 'tmp/dc-question-audit-2026-10-08');
const read = async (file: string) => JSON.parse(await readFile(resolve(root, file), 'utf8'));
const before: Data[] = await read('before.json');
const current = await read('normalization-before.json');
const proposals: Data[] = await read('pilot-proposals.json');
const checks: Data[] = await read('pilot-checks.json');
const browser: Data[] = await read('browser-checks.json');
const reviewed = JSON.parse(await readFile(process.argv[3] ?? 'scripts/verification/dc-question-formatting-reviewed.json', 'utf8'));
const completed: Data[] = process.argv[4] ? JSON.parse(await readFile(process.argv[4],'utf8')) : [];
const completedCodes = new Set(completed.map(r=>r.display_code));
assert.equal(completedCodes.size,completed.length);
for (const receipt of completed) {
  const proposal=proposals.find(q=>q.display_code===receipt.display_code);
  assert.ok(proposal, 'Unknown completed question');
  assert.equal(receipt.rendered_source_hash,proposal.rendered_source_hash);
  assert.ok(Date.parse(receipt.updated_at)>Date.parse(proposal.expected_updated_at));
}
const fields = ['stem_html', 'stimulus_html', 'rationale_html', 'options', 'stem_rendered', 'stimulus_rendered',
  'rationale_rendered', 'options_rendered', 'rendered_source_hash', 'rendered_at'];
const md5 = (s: string | null) => s == null ? null : createHash('md5').update(s).digest('hex');
assert.equal(proposals.length, reviewed.questions.length);
assert.equal(new Set(proposals.map(q => q.id)).size, proposals.length);
assert.equal(browser.length, proposals.length * 2);
assert.ok(browser.every(q => !q.mathImages && !q.mathErrors && !q.overflow && !q.pageOverflow && !q.brokenImages && !q.legacyClasses));

const payload = proposals.map(p => {
  const old = before.find(q => q.id === p.id)!;
  const live = current.questions.find((q: Data) => q.id === p.id)!;
  const check = checks.find(q => q.code === p.display_code)!;
  const review = reviewed.questions.find((q: Data) => q.code === p.display_code)!;
  assert.ok(old && live && check && review);
  assert.match(p.id, /^[0-9a-f-]{36}$/);
  assert.equal(Date.parse(live.updated_at), Date.parse(old.updated_at));
  for (const [field, hash] of Object.entries(live.hashes)) assert.equal(md5(old[field]), hash);
  const optionHashes = old.options?.length ? old.options.map(({ content_html, ...identity }: Data) => ({ identity, hash: md5(content_html) })) : null;
  // Newer baselines carry compact choice hashes; the original pilot baseline
  // retained raw options. Both must match the saved content before publication.
  assert.deepEqual(live.options, current.format === 'content-hashes-v1' ? optionHashes : old.options);
  assert.deepEqual(p.correct_answer, old.correct_answer);
  assert.deepEqual(p.options?.map((o: Data) => { const { content_html, ...identity } = o; return identity; }) ?? null,
    old.options?.map((o: Data) => { const { content_html, ...identity } = o; return identity; }) ?? null);
  assert.equal(p.official_source_sha256, review.official_source_sha256);
  assert.equal(p.rendered_source_hash, sourceHash({ stem_html: p.stem_html, stimulus_html: p.stimulus_html,
    rationale_html: p.rationale_html, options: p.options }));
  assert.ok(Date.parse(p.rendered_at) > Date.parse(old.rendered_at ?? old.updated_at));
  assert.ok(check.key_verified && check.source_figures_preserved && check.table_data_preserved && check.all_field_prose_preserved && !check.rendering_errors.length);
  assert.ok(browser.filter(q => q.code === p.display_code).length === 2);
  const result = Object.fromEntries(fields.map(f => [f, p[f]]));
  const row = { id: p.id, code: p.display_code, expected_updated_at: live.updated_at,
    expected_hashes: live.hashes, expected_options: old.options,
    // Keep native JSON as text: parsing a PostgreSQL numeric through JS can
    // round fractional answer keys even when no content has changed.
    expected_preserved_text: live.preserved_text ?? JSON.stringify(live.preserved), ...result };
  // Large, unchanged diagrams occur in both raw and rendered choices. Bind
  // them to the guarded prior row instead of transmitting repeated PNGs.
  const original = JSON.stringify(row);
  assert.ok(!original.includes('SWDCFIGURE'));
  let compact = original;
  const source_images: Data[] = [];
  for (const src of new Set(original.match(/data:image\/[A-Za-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g) ?? [])) {
    if (src.length < 10_000) continue;
    assert.ok(JSON.stringify(old).includes(src), p.display_code + ': diagram not in prior content');
    const digest = md5(src)!;
    const token = 'SWDCFIGURE' + digest + 'END';
    compact = compact.replaceAll(src, token);
    source_images.push({ token, md5: digest });
  }
  let expanded = compact;
  for (const binding of source_images) {
    const src = (original.match(/data:image\/[A-Za-z0-9+.-]+;base64,[A-Za-z0-9+/=]+/g) ?? []).find(s=>md5(s)===binding.md5)!;
    expanded = expanded.replaceAll(binding.token,src);
  }
  assert.equal(expanded,original, p.display_code + ': diagram binding did not round-trip');
  return { ...JSON.parse(compact), source_images };
}).filter(p=>!completedCodes.has(p.code)).sort((a,b) => a.id.localeCompare(b.id));
const batches: Data[][] = [];
let batch: Data[] = [];
let bytes = 0;
for (const row of payload) {
  const size = Buffer.byteLength(JSON.stringify(row));
  if (bytes + size > 390_000 && batch.length) { batches.push(batch); batch = []; bytes = 0; }
  batch.push(row); bytes += size;
}
if (batch.length) batches.push(batch);
const sqlDirectory=completed.length ? 'normalization-sql-remainder' : 'normalization-sql';
await mkdir(resolve(root, sqlDirectory), { recursive: true });
const manifest: Data[] = [];
for (const [index, items] of batches.entries()) {
  const serialized = JSON.stringify(items);
  assert.ok(!serialized.includes('$dc_payload$') && !serialized.includes('$dc_normalize$'));
  const sql = `-- Approved DC content normalization; all fields and caches change together.
DO $dc_normalize$
DECLARE
  payload jsonb := $dc_payload$${serialized}$dc_payload$::jsonb;
  item jsonb;
  prior public.questions_v2%ROWTYPE;
  affected integer;
  binding jsonb;
  image_src text;
  image_count integer;
BEGIN
  PERFORM set_config('lock_timeout','5s',true);
  PERFORM set_config('statement_timeout','30s',true);
  FOR item IN SELECT value FROM jsonb_array_elements(payload) LOOP
    SELECT * INTO STRICT prior FROM public.questions_v2 WHERE id = (item->>'id')::uuid FOR UPDATE;
    FOR binding IN SELECT value FROM jsonb_array_elements(item->'source_images') LOOP
      SELECT min(m[1]),count(DISTINCT m[1]) INTO image_src,image_count
      FROM regexp_matches(to_jsonb(prior)::text,'data:image/[A-Za-z0-9+.-]+;base64,[A-Za-z0-9+/=]+','g') m
      WHERE md5(m[1])=binding->>'md5';
      IF image_count <> 1 THEN RAISE EXCEPTION 'Original diagram missing for %',item->>'code'; END IF;
      item := replace(item::text,binding->>'token',image_src)::jsonb;
    END LOOP;
    IF prior.updated_at IS DISTINCT FROM (item->>'expected_updated_at')::timestamptz
      OR md5(prior.stem_html) IS DISTINCT FROM item->'expected_hashes'->>'stem_html'
      OR md5(prior.stimulus_html) IS DISTINCT FROM item->'expected_hashes'->>'stimulus_html'
      OR md5(prior.rationale_html) IS DISTINCT FROM item->'expected_hashes'->>'rationale_html'
      OR prior.options IS DISTINCT FROM nullif(item->'expected_options', 'null'::jsonb)
      OR (to_jsonb(prior) - ARRAY['stem_html','stimulus_html','rationale_html','options','stem_rendered','stimulus_rendered','rationale_rendered','options_rendered','rendered_source_hash','rendered_at','updated_at']::text[])
        IS DISTINCT FROM (item->>'expected_preserved_text')::jsonb
      OR prior.source IS DISTINCT FROM 'collegeboard'
      OR prior.source_external_id !~ '^[0-9]{5,6}-DC$'
      OR prior.is_published IS DISTINCT FROM true OR prior.deleted_at IS NOT NULL THEN
      RAISE EXCEPTION 'Normalization guard failed for %; preserving intervening edits.', item->>'code';
    END IF;
    IF EXISTS (SELECT 1 FROM public.question_content_drafts d WHERE d.question_id=prior.id AND d.status='pending') THEN
      RAISE EXCEPTION 'Pending content draft for %; review it before updating.', item->>'code';
    END IF;
    UPDATE public.questions_v2 SET
      stem_html=item->>'stem_html', stimulus_html=item->>'stimulus_html', rationale_html=item->>'rationale_html',
      options=nullif(item->'options','null'::jsonb),
      stem_rendered=item->>'stem_rendered', stimulus_rendered=item->>'stimulus_rendered', rationale_rendered=item->>'rationale_rendered',
      options_rendered=nullif(item->'options_rendered','null'::jsonb),
      rendered_source_hash=item->>'rendered_source_hash', rendered_at=(item->>'rendered_at')::timestamptz
    WHERE id=prior.id;
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected <> 1 THEN RAISE EXCEPTION 'Unexpected normalization update count'; END IF;
    -- The installed snapshot trigger preserves the prior published content.
  END LOOP;
END
$dc_normalize$;
SELECT display_code,rendered_source_hash,updated_at FROM public.questions_v2
WHERE id IN (${items.map(q => `'${q.id}'`).join(',')}) ORDER BY display_code;
`;
  const path = resolve(root, sqlDirectory, `batch-${String(index + 1).padStart(2, '0')}.sql`);
  await writeFile(path, sql);
  manifest.push({ path, bytes: Buffer.byteLength(sql), codes: items.map(q => q.code) });
}
await writeFile(resolve(root, 'normalization-sql-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(JSON.stringify({ questions: payload.length, batches: manifest.length, largest_query_bytes: Math.max(...manifest.map(f => f.bytes)), live_writes: 0 }));
