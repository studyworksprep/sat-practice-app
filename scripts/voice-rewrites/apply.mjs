// Applies the approved plan 6.2 proposals (proposals.mjs) to the specs.
//
//   node scripts/voice-rewrites/apply.mjs [--dry-run]
//
// Per lesson, in this order:
//   1. opener    — block 1's body below the intro card is replaced
//                  (the <h2> and the card stay; a prerequisite callout
//                  that already sits above the card is not duplicated)
//   2. closer    — lesson_complete.html is replaced
//   3. retrieval — the stock "Without looking back, which…" prompt is
//                  replaced (choices untouched)
//   4. tails     — the "Next, you will…" sentence is removed from the
//                  twelve explanations
//   5. summary   — the three "in one glance" text blocks are removed
//   6. end hard  — the retrieval check moves BEFORE the SAT-format item so
//                  the item is the last activity (Good Cop / Bad Cop and
//                  Sliders are left as they are; Find Missing Constants
//                  already ends on the item)
//
// Text fields are spliced as unique JSON-encoded strings; block removal
// and reordering are line-range surgery on the 2-space pretty-printed
// files. Nothing is reserialized — 21 of 36 specs carry hand-formatted
// one-liners that JSON.stringify would reflow. Every result is re-parsed
// and compared to the same edits applied to the parsed object before it
// is written. Idempotent: a spec already in the approved state is a no-op.

import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const DRY = process.argv.includes('--dry-run');
const { LESSONS, TAILS } = await import(pathToFileURL(path.join(HERE, 'proposals.mjs')).href);

const SPEC_DIR = path.join(ROOT, 'docs/lesson-template-specs');
const STOCK = /^\s*without looking back,?\s+which\b/i;
const TAIL = /\s*(?:<strong>\s*)?Next,? you(?: will|'ll)\b[^.!?]*[.!?](?:\s*<\/strong>)?/i;

// Lessons whose ending is deliberately left alone.
const NO_REORDER = new Set([
  'good-cop-bad-cop-reading-answers',            // ends on its own paired item checks
  'testing-equivalent-expressions-with-desmos-sliders', // already ends on a bank question
]);
// Retrieval checks whose id does not say "retrieval" (non-stock stems).
const RETRIEVAL_IDS = {
  'circle-toolkit-measure-arcs-and-equations': 'check_20',
  'find-missing-constants-in-equivalent-expressions-with-regression': 'check_13',
  'initial-modifiers-match-the-noun-after-the-comma': 'check_15',
};
// CLEAR's SAT-format item is a bank question plus its debrief.
const ITEM_IDS = {
  'command-of-evidence-clear-the-claim': ['authentic_quant_question', 'authentic_quant_debrief'],
};

// ── helpers over the parsed spec ────────────────────────────────
const blockId = (b) => b?.id ?? b?.content?.id ?? null;
const blockKind = (b) => (b?.kind === 'raw_block' ? b.block_type : b?.kind);
function contentOf(b) { return b.kind === 'raw_block' ? b.content : b; }

function retrievalBlock(spec, slug) {
  const forced = RETRIEVAL_IDS[slug];
  if (forced) return spec.blocks.find((b) => blockId(b) === forced) ?? null;
  return (
    spec.blocks.find((b) => blockKind(b) === 'check' && STOCK.test(String(contentOf(b).prompt ?? ''))) ??
    spec.blocks.find((b) => blockKind(b) === 'check' && /retrieval/i.test(String(blockId(b)))) ??
    null
  );
}

// ── helpers over the raw text ───────────────────────────────────
function replaceString(raw, oldValue, newValue, what) {
  const oldEnc = JSON.stringify(oldValue);
  const newEnc = JSON.stringify(newValue);
  const n = raw.split(oldEnc).length - 1;
  if (n !== 1) throw new Error(`${what}: expected the old string once in the file, found ${n}`);
  return raw.replace(oldEnc, () => newEnc);
}

function blockRanges(lines) {
  const ranges = [];
  let start = null;
  lines.forEach((line, i) => {
    if (line === '    {' && start === null) start = i;
    else if ((line === '    }' || line === '    },') && start !== null) { ranges.push([start, i]); start = null; }
  });
  return ranges;
}

function rangeForId(lines, ranges, id) {
  const re = new RegExp(`^ {6,8}"id": ${JSON.stringify(id)},?$`);
  const hits = ranges.filter(([a, b]) => lines.slice(a, b + 1).some((l) => re.test(l)));
  if (hits.length !== 1) throw new Error(`block "${id}": found ${hits.length} ranges`);
  return hits[0];
}

function withComma(blockLines, comma) {
  const out = [...blockLines];
  const last = out[out.length - 1];
  out[out.length - 1] = comma ? (last.endsWith(',') ? last : `${last},`) : last.replace(/,$/, '');
  return out;
}

// Remove a block element by id (never the last element — every removal
// here sits before lesson_complete).
function removeBlockLines(lines, id) {
  const ranges = blockRanges(lines);
  const [a, b] = rangeForId(lines, ranges, id);
  if (!lines[b].endsWith(',')) throw new Error(`block "${id}" is the last element`);
  return [...lines.slice(0, a), ...lines.slice(b + 1)];
}

// Move the block `moveId` so it sits immediately before `beforeId`.
function moveBlockBefore(lines, moveId, beforeId) {
  let ranges = blockRanges(lines);
  const [ma, mb] = rangeForId(lines, ranges, moveId);
  const moving = withComma(lines.slice(ma, mb + 1), true);
  let rest = [...lines.slice(0, ma), ...lines.slice(mb + 1)];
  ranges = blockRanges(rest);
  const [ta] = rangeForId(rest, ranges, beforeId);
  rest = [...rest.slice(0, ta), ...moving, ...rest.slice(ta)];
  // The former last element may now be followed by another; normalise.
  const finalRanges = blockRanges(rest);
  finalRanges.forEach(([a, b], i) => {
    const isLast = i === finalRanges.length - 1;
    rest[b] = isLast ? rest[b].replace(/,$/, '') : (rest[b].endsWith(',') ? rest[b] : `${rest[b]},`);
  });
  return rest;
}

// ── the pass ────────────────────────────────────────────────────
const report = [];
let changedFiles = 0;

for (const L of [...LESSONS].sort((a, b) => a.slug.localeCompare(b.slug))) {
  const file = path.join(SPEC_DIR, `${L.slug}.json`);
  let raw = fs.readFileSync(file, 'utf8');
  const spec = JSON.parse(raw);
  const expected = JSON.parse(raw);
  const did = [];

  // 1. opener
  if (L.opener) {
    const b1 = spec.blocks[0];
    const html = String(b1.html ?? '');
    const cardStart = html.indexOf('<div class="lesson-intro">');
    if (cardStart < 0) throw new Error(`${L.slug}: block 1 has no intro card`);
    const cardEnd = html.indexOf('</div>', cardStart) + '</div>'.length;
    const head = html.slice(0, cardEnd);
    let body = L.opener;
    // A prerequisite callout already above the card is not repeated.
    const lead = body.match(/^<blockquote>[\s\S]*?<\/blockquote>/);
    if (lead && head.includes(lead[0])) body = body.slice(lead[0].length);
    const next = head + body;
    if (next !== html) {
      raw = replaceString(raw, html, next, `${L.slug} opener`);
      expected.blocks[0].html = next;
      did.push('opener');
    }
  }

  // 2. closer
  if (L.closer) {
    const idx = spec.blocks.findIndex((b) => blockKind(b) === 'lesson_complete');
    if (idx < 0) throw new Error(`${L.slug}: no lesson_complete`);
    const html = String(contentOf(spec.blocks[idx]).html ?? '');
    if (html !== L.closer) {
      raw = replaceString(raw, html, L.closer, `${L.slug} closer`);
      contentOf(expected.blocks[idx]).html = L.closer;
      did.push('closer');
    }
  }

  // 3. retrieval stem
  if (L.retrieval) {
    const b = spec.blocks.find((x) => blockKind(x) === 'check' && STOCK.test(String(contentOf(x).prompt ?? '')));
    if (b) {
      const idx = spec.blocks.indexOf(b);
      const prompt = String(contentOf(b).prompt);
      raw = replaceString(raw, prompt, L.retrieval, `${L.slug} retrieval`);
      contentOf(expected.blocks[idx]).prompt = L.retrieval;
      did.push('retrieval');
    }
  }

  // 4. tails
  for (const [slug, , id] of TAILS.filter((t) => t[0] === L.slug)) {
    const idx = spec.blocks.findIndex((b) => blockId(b) === id);
    if (idx < 0) throw new Error(`${slug}: tail block "${id}" not found`);
    const explanation = String(contentOf(spec.blocks[idx]).explanation ?? '');
    if (!TAIL.test(explanation)) continue;
    let next = explanation.replace(TAIL, '').replace(/<strong>\s*<\/strong>/g, '').replace(/\s{2,}/g, ' ').trim();
    raw = replaceString(raw, explanation, next, `${slug} tail ${id}`);
    contentOf(expected.blocks[idx]).explanation = next;
    did.push(`tail:${id}`);
  }

  // 5. summary blocks
  let lines = raw.split('\n');
  const summaryIdx = spec.blocks.findIndex((b) => blockId(b) === 'summary' && blockKind(b) === 'text');
  if (summaryIdx >= 0) {
    lines = removeBlockLines(lines, 'summary');
    expected.blocks.splice(summaryIdx, 1);
    did.push('summary-block');
  }

  // 6. end hard
  if (!NO_REORDER.has(L.slug)) {
    const retOriginal = retrievalBlock(spec, L.slug);
    const ret = retOriginal ? expected.blocks.find((b) => blockId(b) === blockId(retOriginal)) : null;
    const itemIds = ITEM_IDS[L.slug] ?? ['authentic_item'];
    const item = expected.blocks.find((b) => blockId(b) === itemIds[0]);
    if (ret && item) {
      const retIdx = expected.blocks.indexOf(ret);
      const itemIdx = expected.blocks.indexOf(item);
      if (retIdx > itemIdx) {
        lines = moveBlockBefore(lines, blockId(ret), itemIds[0]);
        expected.blocks.splice(retIdx, 1);
        expected.blocks.splice(itemIdx, 0, ret);
        did.push('end-hard');
      }
    } else if (!ret) {
      throw new Error(`${L.slug}: no retrieval check found for the end-hard reorder`);
    }
  }

  if (did.length === 0) { report.push(`${L.slug.padEnd(66)} (already applied)`); continue; }

  const out = lines.join('\n');
  const got = JSON.parse(out);
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    throw new Error(`${L.slug}: splice result differs from the intended object`);
  }
  // The opener must still carry exactly one card and one <h2>.
  const h = String(got.blocks[0].html ?? '');
  if (L.opener && ((h.match(/lesson-intro/g) || []).length !== 1 || (h.match(/<h2>/g) || []).length !== 1)) {
    throw new Error(`${L.slug}: opener lost its card or heading`);
  }
  if (!DRY) fs.writeFileSync(file, out);
  changedFiles += 1;
  report.push(`${L.slug.padEnd(66)} ${did.join(', ')}`);
}

console.log(report.join('\n'));
console.log(`\n${DRY ? 'DRY RUN — ' : ''}${changedFiles} spec file(s) ${DRY ? 'would change' : 'changed'}`);
