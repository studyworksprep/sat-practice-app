#!/usr/bin/env node
// scripts/import-may2026-batch.mjs — parse the May 2026 Mathpix
// export into questions_v2-shaped rows and emit the reviewable
// import artifacts. Read docs/database.md "Question pools and
// import batches" for the schema this feeds.
//
// Inputs (content/import/may2026/):
//   - fbb52e30-….mmd            Mathpix OCR of the 349-question set
//   - answer-key.csv            per-question key + section/module,
//                               extracted from the source PDFs' text
//                               layer (q,section,module,label,answer,
//                               part,page)
//   - corrections.json          optional per-question overrides,
//                               applied after parsing:
//                               { "<q>": { stimulus_html?, stem_html?,
//                                 options?, append_options?,
//                                 correct_answer?, underline?: string[],
//                                 skip?: reason, note? } }
//
// Outputs (content/import/may2026/build/):
//   - parsed-questions.json     every row as it will be inserted
//   - report.md                 summary + per-question flags, with
//                               the source PDF page for each flagged
//                               question so review is one lookup
// and copies the referenced figures to public/images/may2026/
// (the legacy-but-supported /images path; run the
// migrate-public-images workflow after merge to move them into the
// question-figures bucket and rewrite the rows).
//
// With --apply, the parsed rows are written to the database
// (unpublished, pool='opt_in', linked to the May 2026 batch row) via
// the service role — normally from the import-question-batch GitHub
// workflow. Idempotent: already-present source_external_ids are
// skipped, so re-runs only add what's missing.
//
// The parser leans on two facts established during verification:
// questions are numbered continuously 1..349 (so a header is only
// accepted when it carries the next expected number), and questions
// 1..155 are Reading & Writing (stimulus precedes the header) while
// 156..349 are Math (all content follows the header).
//
// Usage:
//   node scripts/import-may2026-batch.mjs           # build artifacts only
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//     node scripts/import-may2026-batch.mjs --apply # build + insert

import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';
import { renderRow } from '../lib/content/render-math.mjs';

const SRC_DIR = 'content/import/may2026';
const BUILD_DIR = join(SRC_DIR, 'build');
const FIG_DIR = 'public/images/may2026';
const FIG_URL_PREFIX = '/images/may2026';

const MMD_FILE = join(SRC_DIR, 'fbb52e30-ce66-4c45-b61e-50bccd271756.mmd');
const KEY_FILE = join(SRC_DIR, 'answer-key.csv');
const CORRECTIONS_FILE = join(SRC_DIR, 'corrections.json');

const BATCH = {
  source: 'exam_recon',
  label: 'May 2026 SAT',
  administration_date: '2026-05-02',
  notes:
    'Reconstructed from gathered May 2026 US SAT material. 349 questions ' +
    '(303 MCQ, 46 grid-in). Key + section/module extracted from the ' +
    'answer-marked source PDFs (content/import/may2026/). Difficulty and ' +
    'score band intentionally NULL; domain/skill pending classification.',
};
const EXTERNAL_ID = (q) => `may2026-q${String(q).padStart(3, '0')}`;
const RW_MAX = 155; // per answer-key.csv: Q1-155 are Section 1 (R&W)

// ── Answer key ──────────────────────────────────────────────────────

function loadKey() {
  const lines = readFileSync(KEY_FILE, 'utf8').trim().split('\n');
  const header = lines.shift().split(',');
  const idx = Object.fromEntries(header.map((h, i) => [h, i]));
  const key = new Map();
  for (const line of lines) {
    // answers never contain commas (letters or "(grid-in: N)"), so a
    // plain split is safe for this file.
    const cells = line.split(',');
    key.set(Number(cells[idx.q]), {
      section: Number(cells[idx.section]),
      module: Number(cells[idx.module]),
      label: cells[idx.label],
      answer: cells[idx.answer],
      pdfPart: Number(cells[idx.part]),
      pdfPage: Number(cells[idx.page]),
    });
  }
  return key;
}

// ── Segmentation ────────────────────────────────────────────────────
//
// Walk the file line by line holding the next expected question
// number. A line is a header for question N only when it matches a
// header pattern AND carries exactly N — bare numbers in table data
// therefore never split a question. Content before a header is the
// (R&W) stimulus; content after it, up to the next question's
// stimulus, is stem + options.

// Private-use placeholders keep math and literal dollars out of the
// way while prose is HTML-escaped; restoreMath() swaps them back.
const SPAN_OPEN = '\uE000';
const SPAN_CLOSE = '\uE001';
const SPAN_RE = /\uE000(\d+)\uE001/g;
const DOLLAR = '\uE002';
const MARKER_RE = /^(.*?)\b(\d{1,3})\s*(?:[A-Z□—-]\s+)?Mark for Review\s*(.*)$/;
const BARE_NUM_RE = /^(\d{1,3})$/;

// Index of the line holding the \end{itemize} of the last options
// block (an itemize whose items are labeled A-D) in `lines`, or -1.
function findLastOptionsEnd(lines) {
  let inItem = false;
  let start = -1;
  let lastOptionsEnd = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].includes('\\begin{itemize}')) { inItem = true; start = i; }
    if (inItem && lines[i].includes('\\end{itemize}')) {
      const block = lines.slice(start, i + 1).join('\n');
      if (/\\item\[\(?[A-Da-d]\)?\]/.test(block)) lastOptionsEnd = i;
      inItem = false;
    }
  }
  return lastOptionsEnd;
}

function segmentWithStimulus(mmdText, expectedTotal) {
  const lines = mmdText.split('\n');
  const flags = [];
  const headers = []; // { q, lineIdx, leading, trailing }
  let expected = 1;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i].replace(/\r$/, '');
    const m = line.match(MARKER_RE);
    if (m && Number(m[2]) === expected) {
      headers.push({ q: expected, lineIdx: i, leading: m[1].trim(), trailing: m[3].trim() });
      expected += 1;
    } else if (BARE_NUM_RE.test(line.trim()) && Number(line.trim()) === expected) {
      headers.push({ q: expected, lineIdx: i, leading: '', trailing: '' });
      expected += 1;
    }
  }
  if (headers.length !== expectedTotal) {
    for (let q = headers.length + 1; q <= expectedTotal; q += 1) {
      flags.push({ q, flag: 'no header found — parse stopped before this question' });
    }
  }

  const questions = new Map();
  for (let h = 0; h < headers.length; h += 1) {
    const { q, lineIdx, leading, trailing } = headers[h];
    const regionStart = h === 0 ? 0 : headers[h - 1].regionEnd;
    const before = lines.slice(regionStart, lineIdx);
    if (leading) before.push(leading);

    const nextHeaderIdx = h + 1 < headers.length ? headers[h + 1].lineIdx : lines.length;
    const between = lines.slice(lineIdx + 1, nextHeaderIdx);
    if (trailing) between.unshift(trailing);

    // Where do q's lines end and q+1's stimulus lines begin? After
    // the last options block. SPR questions (no options) own the
    // whole region — correct because every SPR is Math and the next
    // question is also Math (no pre-header stimulus).
    let cut = between.length;
    if (h + 1 < headers.length) {
      const lastEnd = findLastOptionsEnd(between);
      if (lastEnd !== -1) cut = lastEnd + 1;
      else if (headers[h + 1].q <= RW_MAX) {
        // An R&W question follows an SPR-less segment: the boundary
        // between q's stem and q+1's passage is not derivable.
        flags.push({ q, flag: 'no options block and next question is R&W — stem/stimulus boundary ambiguous' });
      }
    }
    headers[h].regionEnd = lineIdx + 1 + cut - (trailing ? 1 : 0);
    questions.set(q, { pre: before, post: between.slice(0, cut) });
  }
  return { questions, flags };
}

// ── mmd → HTML conversion ───────────────────────────────────────────

// Pull $$…$$ and $…$ spans out (respecting \$ escapes), convert the
// remaining prose, then restore math as \[…\] / \(…\) with
// HTML-escaped bodies (the renderer parses the blob as HTML).
function protectMath(text) {
  const spans = [];
  let out = '';
  let i = 0;
  while (i < text.length) {
    if (text[i] === '\\' && text[i + 1] === '$') { out += DOLLAR; i += 2; continue; }
    if (text[i] === '$') {
      const display = text[i + 1] === '$';
      const open = display ? '$$' : '$';
      const end = text.indexOf(open, i + open.length);
      if (end === -1) { out += text[i]; i += 1; continue; }
      const body = text.slice(i + open.length, end);
      spans.push({ display, body });
      out += `${SPAN_OPEN}${spans.length - 1}${SPAN_CLOSE}`;
      i = end + open.length;
    } else {
      out += text[i];
      i += 1;
    }
  }
  return { text: out, spans };
}

function escapeHtml(s) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function restoreMath(html, spans) {
  return html
    .replace(SPAN_RE, (_, n) => {
      const { display, body } = spans[Number(n)];
      const esc = escapeHtml(body);
      return display ? `\\[${esc}\\]` : `\\(${esc}\\)`;
    })
    .replaceAll(DOLLAR, '$');
}

function unescapeProse(s) {
  return s.replaceAll('\\%', '%').replaceAll('\\&', '&amp;').replaceAll('\\_', '_').replaceAll('\\#', '#');
}

// Convert one region (array of mmd lines) to HTML. Handles figure
// environments, markdown images, tabular tables, note-list itemize
// blocks, and plain paragraphs. Options blocks must be removed by
// the caller first.
function regionToHtml(lines, ctx) {
  const { text, spans } = protectMath(lines.join('\n'));
  const blocks = [];
  const src = text.split('\n');
  let i = 0;
  let para = [];
  const flushPara = () => {
    const t = para.join(' ').trim();
    if (t) blocks.push(`<p>${escapeHtml(unescapeProse(t)).replaceAll('&amp;amp;', '&amp;')}</p>`);
    para = [];
  };

  while (i < src.length) {
    const line = src[i];

    if (line.includes('\\begin{figure}') || line.includes('\\begin{table}')) {
      flushPara();
      const isTable = line.includes('\\begin{table}');
      const endTag = isTable ? '\\end{table}' : '\\end{figure}';
      const end = src.findIndex((l, j) => j >= i && l.includes(endTag));
      const envLines = src.slice(i, end === -1 ? src.length : end + 1);
      blocks.push(figureEnvToHtml(envLines, ctx));
      i = (end === -1 ? src.length : end + 1);
      continue;
    }
    if (line.includes('\\begin{tabular}')) {
      flushPara();
      const end = src.findIndex((l, j) => j >= i && l.includes('\\end{tabular}'));
      const envLines = src.slice(i, end === -1 ? src.length : end + 1);
      blocks.push(tabularToHtml(envLines.join('\n'), ctx));
      i = (end === -1 ? src.length : end + 1);
      continue;
    }
    if (line.includes('\\begin{itemize}')) {
      flushPara();
      const end = src.findIndex((l, j) => j >= i && l.includes('\\end{itemize}'));
      const envLines = src.slice(i + 1, end === -1 ? src.length : end);
      const items = splitItems(envLines.join('\n'));
      const lis = items
        .map((it) => `<li>${escapeHtml(unescapeProse(it.content.trim()))}</li>`)
        .join('');
      blocks.push(`<ul>${lis}</ul>`);
      i = (end === -1 ? src.length : end + 1);
      continue;
    }
    const img = line.match(/^!\[[^\]]*\]\(([^)]+)\)\s*$/);
    if (img) {
      flushPara();
      blocks.push(`<figure><img src="${figUrl(img[1], ctx)}" alt=""></figure>`);
      i += 1;
      continue;
    }
    if (line.trim() === '') flushPara();
    else para.push(line.trim());
    i += 1;
  }
  flushPara();
  const html = blocks.join('\n');
  return html ? restoreMath(html, spans) : null;
}

function figUrl(mmdPath, ctx) {
  const name = basename(mmdPath.trim());
  const local = join(SRC_DIR, name);
  if (!existsSync(local)) {
    ctx.flags.push({ q: ctx.q, flag: `figure file missing: ${name}` });
    return '';
  }
  ctx.figures.add(name);
  return `${FIG_URL_PREFIX}/${name}`;
}

function figureEnvToHtml(envLines, ctx) {
  const body = envLines.join('\n');
  const cap = body.match(/\\caption\{([^}]*)\}/);
  const img = body.match(/\\includegraphics\[[^\]]*\]\{([^}]+)\}/) ?? body.match(/\\includegraphics\{([^}]+)\}/);
  const tab = body.includes('\\begin{tabular}');
  const parts = [];
  if (cap && cap[1].trim()) parts.push(`<figcaption>${escapeHtml(unescapeProse(cap[1].trim()))}</figcaption>`);
  if (img) parts.push(`<img src="${figUrl(img[1], ctx)}" alt="${cap ? escapeHtml(cap[1].trim()) : ''}">`);
  if (tab) {
    const t = body.match(/\\begin\{tabular\}[\s\S]*?\\end\{tabular\}/);
    if (t) parts.push(tabularToHtml(t[0], ctx));
  }
  if (!img && !tab) ctx.flags.push({ q: ctx.q, flag: 'figure env without image or table' });
  return `<figure>${parts.join('')}</figure>`;
}

// LaTeX tabular → HTML table. Handles \hline, \multicolumn colspan,
// and \multirow rowspan (spanned-away cells arrive as empty cells in
// the LaTeX source and are dropped). Anything fancier gets flagged.
function tabularToHtml(tex, ctx) {
  const bodyMatch = tex.match(/\\begin\{tabular\}(?:\[[^\]]*\])?\{[^}]*\}([\s\S]*?)\\end\{tabular\}/);
  if (!bodyMatch) {
    ctx.flags.push({ q: ctx.q, flag: 'tabular block failed to parse' });
    return '';
  }
  let body = bodyMatch[1].replaceAll('\\hline', '');
  const rows = body
    .split('\\\\')
    .map((r) => r.trim())
    .filter((r) => r !== '');

  const rowspanLeft = new Map(); // colIndex -> remaining rows covered
  const htmlRows = [];
  for (const row of rows) {
    const cells = row.split(/(?<!\\)&/).map((c) => c.trim());
    const tds = [];
    let col = 0;
    for (const cell of cells) {
      if ((rowspanLeft.get(col) ?? 0) > 0) {
        rowspanLeft.set(col, rowspanLeft.get(col) - 1);
        if (cell !== '') ctx.flags.push({ q: ctx.q, flag: 'table cell under a rowspan is non-empty — check table' });
        col += 1;
        continue;
      }
      let attrs = '';
      let content = cell;
      const mc = cell.match(/^\\multicolumn\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/);
      const mr = cell.match(/^\\multirow(?:\[[^\]]*\])?\{(\d+)\}\{[^}]*\}\{([\s\S]*)\}$/);
      if (mc) { attrs = ` colspan="${mc[1]}"`; content = mc[2]; }
      else if (mr) {
        attrs = ` rowspan="${mr[1]}"`;
        content = mr[2];
        rowspanLeft.set(col, Number(mr[1]) - 1);
      }
      if (/\\multicolumn|\\multirow/.test(content)) {
        ctx.flags.push({ q: ctx.q, flag: 'nested multicolumn/multirow — check table' });
      }
      tds.push(`<td${attrs}>${escapeHtml(unescapeProse(content.replaceAll('\\&', '&')))}</td>`);
      col += mc ? Number(mc[1]) : 1;
    }
    htmlRows.push(`<tr>${tds.join('')}</tr>`);
  }
  return `<table>${htmlRows.join('')}</table>`;
}

// Split an itemize body into items: [{ label, content }].
function splitItems(body) {
  const items = [];
  const re = /\\item\[([^\]]*)\]/g;
  let match;
  const positions = [];
  while ((match = re.exec(body)) !== null) positions.push({ label: match[1], at: match.index, len: match[0].length });
  for (let i = 0; i < positions.length; i += 1) {
    const start = positions[i].at + positions[i].len;
    const end = i + 1 < positions.length ? positions[i + 1].at : body.length;
    items.push({ label: positions[i].label, content: body.slice(start, end).trim() });
  }
  return items;
}

// Extract the options block from a question's post-header lines.
// Returns { stemLines, options } where options is null for SPR.
function extractOptions(postLines, ctx) {
  // Collect every options-labeled itemize block. OCR sometimes
  // splits one options list across two blocks (with a stray tail of
  // the previous option's text in between, e.g. Q54), so all blocks
  // merge into a single item list and inter-block prose glues onto
  // the preceding item.
  const blocks = [];
  let inItem = false;
  let start = -1;
  for (let i = 0; i < postLines.length; i += 1) {
    if (postLines[i].includes('\\begin{itemize}')) { inItem = true; start = i; }
    if (inItem && postLines[i].includes('\\end{itemize}')) {
      const body = postLines.slice(start, i + 1).join('\n');
      if (/\\item\[\(?[A-Da-d]\)?\]/.test(body)) blocks.push({ start, end: i });
      inItem = false;
    }
  }
  if (blocks.length === 0) return { stemLines: postLines, options: null };

  const firstStart = blocks[0].start;
  const lastEnd = blocks[blocks.length - 1].end;
  const stemLines = postLines.slice(0, firstStart).concat(postLines.slice(lastEnd + 1));

  const rawItems = [];
  for (let b = 0; b < blocks.length; b += 1) {
    const block = postLines.slice(blocks[b].start, blocks[b].end + 1).join('\n');
    const { text, spans } = protectMath(block.replace(/\\begin\{itemize\}|\\end\{itemize\}/g, ''));
    for (const it of splitItems(text)) rawItems.push({ ...it, spans });
    if (b + 1 < blocks.length) {
      const orphan = postLines.slice(blocks[b].end + 1, blocks[b + 1].start).join(' ').trim();
      if (orphan && rawItems.length > 0) {
        const last = rawItems[rawItems.length - 1];
        last.content = `${last.content} ${orphan}`.trim();
        ctx.flags.push({ q: ctx.q, flag: 'options split across itemize blocks — merged (verify option text)' });
      }
    }
  }

  // OCR artifacts: a stem line absorbed as a leading unlabeled item
  // (Q98), and a "(C)" bubble read as "©" with the label dropped
  // (Q43/Q299).
  if (rawItems.length > 4 && rawItems[0].label.trim() === '') {
    const hoisted = rawItems.shift();
    stemLines.push(hoisted.content);
    ctx.flags.push({ q: ctx.q, flag: 'leading unlabeled item hoisted into stem (verify stem)' });
  }
  const options = rawItems.map((it, idx) => {
    let label = it.label.replace(/[()\s]/g, '').toUpperCase();
    let content = it.content;
    if (!/^[A-D]$/.test(label)) {
      if (/^©\s/.test(content)) content = content.replace(/^©\s*/, '');
      else ctx.flags.push({ q: ctx.q, flag: `option label "${it.label}" not A-D — inferred ${String.fromCharCode(65 + idx)}` });
      label = String.fromCharCode(65 + idx);
    }
    const contentHtml = restoreMath(
      escapeHtml(unescapeProse(content.replace(/\s+/g, ' ').trim())),
      it.spans,
    );
    return { label, ordinal: idx + 1, content_html: contentHtml };
  });
  return { stemLines, options };
}

// ── Key parsing ─────────────────────────────────────────────────────

function keyToCorrectAnswer(q, keyRow, questionType, options, ctx) {
  if (questionType === 'mcq') {
    const letter = keyRow.answer.trim();
    if (!/^[A-D]$/.test(letter)) {
      ctx.flags.push({ q, flag: `MCQ key "${keyRow.answer}" is not a letter — needs correction` });
      return null;
    }
    if (options && !options.some((o) => o.label === letter)) {
      ctx.flags.push({ q, flag: `key ${letter} not among parsed option labels` });
    }
    return { option_label: letter, option_labels: null, text: null, number: null, tolerance: null };
  }
  const m = keyRow.answer.match(/^\(grid-in:\s*(.+?)\)$/);
  if (!m) {
    ctx.flags.push({ q, flag: `SPR key "${keyRow.answer}" unparseable — needs correction` });
    return null;
  }
  const value = m[1].trim();
  const num = /^-?\d+(\.\d+)?$/.test(value) ? Number(value) : fractionToNumber(value);
  if (num == null) ctx.flags.push({ q, flag: `SPR value "${value}" is not numeric — check` });
  if (value.replace('-', '').replace('.', '').length > 5) {
    ctx.flags.push({ q, flag: `SPR value "${value}" longer than grid-in field — check accepted forms` });
  }
  return {
    option_label: null,
    option_labels: null,
    text: JSON.stringify([value]),
    number: num,
    tolerance: num == null ? null : 0,
  };
}

function fractionToNumber(s) {
  const f = s.match(/^(-?\d+)\/(\d+)$/);
  if (!f) return null;
  const d = Number(f[2]);
  return d === 0 ? null : Number(f[1]) / d;
}

// ── Apply (DB writes) ───────────────────────────────────────────────
//
// Writes go through supabase-js with the service role, normally from
// the import-question-batch GitHub workflow. Idempotency: the batch
// row is looked up (or created) by (source, label), and question
// rows are inserted only when their source_external_id is not
// already present for this source — the partial unique index on
// (source, source_external_id) backstops races. Chunked so a failure
// partway is resumable by simply re-running.

async function applyRows(rows) {
  const { createClient } = await import('@supabase/supabase-js');
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('--apply needs SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in the environment.');
    process.exit(2);
  }
  const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

  // Batch row: fetch or create, then keep notes/date current.
  const { data: existing, error: batchErr } = await supabase
    .from('question_batches')
    .select('id')
    .eq('source', BATCH.source)
    .eq('label', BATCH.label)
    .maybeSingle();
  if (batchErr) throw new Error(`batch lookup failed: ${batchErr.message}`);
  let batchId = existing?.id;
  if (batchId) {
    const { error } = await supabase
      .from('question_batches')
      .update({ notes: BATCH.notes, administration_date: BATCH.administration_date })
      .eq('id', batchId);
    if (error) throw new Error(`batch update failed: ${error.message}`);
  } else {
    const { data, error } = await supabase
      .from('question_batches')
      .insert({ ...BATCH, pool: 'opt_in' })
      .select('id')
      .single();
    if (error) throw new Error(`batch insert failed: ${error.message}`);
    batchId = data.id;
  }

  const { data: present, error: presentErr } = await supabase
    .from('questions_v2')
    .select('source_external_id')
    .eq('source', BATCH.source)
    .not('source_external_id', 'is', null)
    .limit(2000);
  if (presentErr) throw new Error(`existing-id lookup failed: ${presentErr.message}`);
  const have = new Set((present ?? []).map((r) => r.source_external_id));
  const missing = rows.filter((r) => !have.has(r.source_external_id));

  const CHUNK = 25;
  let inserted = 0;
  for (let i = 0; i < missing.length; i += CHUNK) {
    const chunk = missing.slice(i, i + CHUNK).map((r) => ({
      ...r,
      batch_id: batchId,
      pool: 'opt_in',
      is_published: false,
      rendered_at: new Date().toISOString(),
    }));
    const { error } = await supabase.from('questions_v2').insert(chunk);
    if (error) throw new Error(`insert chunk at ${i} failed: ${error.message}`);
    inserted += chunk.length;
    console.log(`  inserted ${inserted}/${missing.length}`);
  }
  console.log(`apply done: batch ${batchId}, ${inserted} inserted, ${rows.length - missing.length} already present`);
}

// ── Main ────────────────────────────────────────────────────────────

const key = loadKey();
const TOTAL = key.size;
const mmd = readFileSync(MMD_FILE, 'utf8');
const corrections = existsSync(CORRECTIONS_FILE)
  ? JSON.parse(readFileSync(CORRECTIONS_FILE, 'utf8'))
  : {};

const { questions, flags } = segmentWithStimulus(mmd, TOTAL);
const figures = new Set();
const rows = [];
const perQuestion = [];

for (let q = 1; q <= TOTAL; q += 1) {
  const keyRow = key.get(q);
  const ctx = { q, flags, figures };
  const seg = questions.get(q);
  const correction = corrections[String(q)] ?? null;
  if (correction?.skip) {
    perQuestion.push({ q, status: 'SKIPPED', section: `S${keyRow.section}M${keyRow.module} ${keyRow.label}`, answer: keyRow.answer, pdf: `part ${keyRow.pdfPart} p.${keyRow.pdfPage}`, flags: [`skipped: ${correction.skip}`] });
    continue;
  }
  if (!seg && !correction) {
    perQuestion.push({ q, status: 'MISSING', flags: ['not parsed'] });
    continue;
  }

  const before = flags.length;
  let stimulus_html = null;
  let stem_html = '';
  let options = null;

  if (seg) {
    const { stemLines, options: opts } = extractOptions(seg.post, ctx);
    stimulus_html = regionToHtml(seg.pre, ctx);
    stem_html = regionToHtml(stemLines, ctx) ?? '';
    options = opts;
  }

  const question_type = /^[A-D]$/.test(keyRow.answer.trim()) ? 'mcq' : 'spr';

  // Grid-in pages in the source show the answer the test-taker had
  // entered, and OCR absorbs it into the stem. Strip a bare
  // numeric/fraction token sitting at the very end of an SPR stem —
  // after the question mark or as its own trailing paragraph.
  if (question_type === 'spr' && stem_html) {
    const cleaned = stem_html
      .replace(/(\?)\s*-?[\d][\d./]*\s*(<\/p>\s*)$/, '$1$2')
      .replace(/<p>\s*-?[\d][\d./]*\s*<\/p>\s*$/, '');
    if (cleaned !== stem_html) {
      stem_html = cleaned.trimEnd();
      ctx.flags.push({ q, flag: 'entered-answer artifact stripped from SPR stem' });
    }
  }

  // Structural checks against what the PDF inventory says exists.
  if (question_type === 'mcq') {
    if (!options) ctx.flags.push({ q, flag: 'MCQ per key but no options parsed' });
    else if (options.length !== 4) ctx.flags.push({ q, flag: `${options.length} options (expected 4)` });
    else if (new Set(options.map((o) => o.label)).size !== 4) {
      ctx.flags.push({ q, flag: 'duplicate option labels after normalization' });
    }
  } else if (options) {
    ctx.flags.push({ q, flag: 'SPR per key but an options block parsed' });
  }
  if (q <= RW_MAX && !stimulus_html) ctx.flags.push({ q, flag: 'R&W question with empty stimulus' });
  if (!stem_html) ctx.flags.push({ q, flag: 'empty stem' });

  let correct_answer = keyToCorrectAnswer(q, keyRow, question_type, options, ctx);

  if (correction) {
    if (correction.stimulus_html !== undefined) stimulus_html = correction.stimulus_html;
    if (correction.stem_html !== undefined) stem_html = correction.stem_html;
    if (correction.options !== undefined) options = correction.options;
    if (correction.append_options !== undefined) options = (options ?? []).concat(correction.append_options);
    if (correction.correct_answer !== undefined) correct_answer = correction.correct_answer;
    // underline: exact substrings of stimulus_html to wrap in <u>,
    // restoring formatting the OCR dropped. Must match exactly —
    // a miss is a hard flag, never a silent no-op.
    for (const span of correction.underline ?? []) {
      if (stimulus_html && stimulus_html.includes(span)) {
        stimulus_html = stimulus_html.replace(span, `<u>${span}</u>`);
      } else {
        ctx.flags.push({ q, flag: 'underline correction text not found in stimulus' });
      }
    }
  }

  // After corrections: a stem that talks about an underlined
  // portion must actually have one in the stimulus.
  if (/underlined/i.test(stem_html) && !/<u>/.test(stimulus_html ?? '')) {
    ctx.flags.push({ q, flag: 'references an underlined sentence — underline lost in OCR, restore via corrections' });
  }

  // Render through the live renderer — a throw here means students
  // would see broken math, so it must surface pre-insert.
  const renderErrors = [];
  const rendered = renderRow(
    { id: EXTERNAL_ID(q), stem_html, stimulus_html, rationale_html: null, options },
    (label, err) => renderErrors.push(`${label}: ${err.message}`),
  );
  for (const e of renderErrors) ctx.flags.push({ q, flag: `render error: ${e}` });

  rows.push({
    source: BATCH.source,
    source_external_id: EXTERNAL_ID(q),
    question_type,
    stimulus_html,
    stem_html,
    options,
    correct_answer,
    stimulus_rendered: rendered.stimulus_rendered,
    stem_rendered: rendered.stem_rendered,
    options_rendered: rendered.options_rendered,
    rendered_source_hash: rendered.rendered_source_hash,
  });

  const qFlags = flags.slice(before).map((f) => f.flag);
  perQuestion.push({
    q,
    status: qFlags.length ? 'FLAGGED' : 'ok',
    corrected: !!correction,
    section: `S${keyRow.section}M${keyRow.module} ${keyRow.label}`,
    answer: keyRow.answer,
    pdf: `part ${keyRow.pdfPart} p.${keyRow.pdfPage}`,
    flags: qFlags,
  });
}

// ── Outputs ─────────────────────────────────────────────────────────

mkdirSync(BUILD_DIR, { recursive: true });
mkdirSync(FIG_DIR, { recursive: true });
for (const name of figures) copyFileSync(join(SRC_DIR, name), join(FIG_DIR, name));

writeFileSync(join(BUILD_DIR, 'parsed-questions.json'), JSON.stringify(rows, null, 1));

const flagged = perQuestion.filter((p) => p.status !== 'ok');
const report = [
  `# May 2026 import — parse report`,
  ``,
  `- Questions in key: ${TOTAL}`,
  `- Parsed rows: ${rows.length}`,
  `- Clean: ${perQuestion.filter((p) => p.status === 'ok').length}`,
  `- Flagged: ${flagged.length}`,
  `- Corrections applied: ${perQuestion.filter((p) => p.corrected).length}`,
  `- Figures referenced: ${figures.size}`,
  ``,
  `## Flags`,
  ``,
  `| Q | Where | Key | PDF page | Flags |`,
  `|---|-------|-----|----------|-------|`,
  ...flagged.map((p) =>
    `| ${p.q} | ${p.section ?? ''} | ${p.answer ?? ''} | ${p.pdf ?? ''} | ${(p.flags ?? []).join('; ')} |`),
].join('\n');
writeFileSync(join(BUILD_DIR, 'report.md'), report);

console.log(`parsed ${rows.length}/${TOTAL} questions — ${flagged.length} flagged, ${figures.size} figures`);
console.log(`artifacts in ${BUILD_DIR}; figures copied to ${FIG_DIR}`);
if (flagged.length > 0) {
  console.log('\nflagged:');
  for (const p of flagged.slice(0, 40)) console.log(`  Q${p.q}: ${(p.flags ?? []).join('; ')}`);
  if (flagged.length > 40) console.log(`  … and ${flagged.length - 40} more (see report.md)`);
}

if (process.argv.includes('--apply')) {
  const blocking = perQuestion.filter(
    (p) => p.status === 'MISSING' || (p.flags ?? []).some((f) => f.includes('needs correction') || f.includes('render error')),
  );
  const unresolved = blocking.filter((p) => !p.corrected && p.status !== 'SKIPPED');
  if (unresolved.length > 0) {
    console.error(`refusing to apply: ${unresolved.length} unresolved blocking flags (see report.md)`);
    process.exit(1);
  }
  await applyRows(rows);
}
