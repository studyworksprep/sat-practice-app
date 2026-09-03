// Builds the plan 6.2 proposal in two forms from one source (proposals.mjs):
//   docs/lesson-voice-rewrites-2026-09.md   (repo, Living, for tutor approval)
//   <out.html>                              (the tutor review page; argv[2],
//                                            default: $TMPDIR/voice-review.html)
// "Was" text is read from the live specs at build time so the comparison
// cannot drift from what is actually in the corpus. Run from the repo root:
//   node scripts/voice-rewrites/build-review.mjs [out.html]
// The application pass (on tutor approval) splices `opener` / `closer` /
// `retrieval` from proposals.mjs into the specs — keep edits there, not in
// the generated markdown.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const ROOT = process.cwd();
const HERE = path.dirname(new URL(import.meta.url).pathname);
const { LESSONS, DECISIONS, TAILS } = await import(pathToFileURL(path.join(HERE, 'proposals.mjs')).href);
const OUT_HTML = process.argv[2] ? path.resolve(process.argv[2]) : path.join(os.tmpdir(), 'voice-review.html');
const { parseLessonTemplateSpecText, compileLessonTemplateSpec } =
  await import(pathToFileURL(path.join(ROOT, 'lib/lesson/template-import.mjs')).href);

const SPEC_DIR = path.join(ROOT, 'docs/lesson-template-specs');
const STOCK = /^\s*without looking back,?\s+which\b/i;

function loadSpec(slug) {
  const raw = fs.readFileSync(path.join(SPEC_DIR, slug + '.json'), 'utf8');
  const parsed = parseLessonTemplateSpecText(raw);
  const { blocks } = compileLessonTemplateSpec(parsed.spec);
  return { title: parsed.spec.title, blocks };
}

// Block 1 body below the intro card, <h2> removed.
function openerWas(blocks) {
  const html = String(blocks[0]?.content?.html ?? '');
  return html
    .replace(/<div class="lesson-intro">[\s\S]*?<\/div>/, '')
    .replace(/^<h2>[\s\S]*?<\/h2>/, '')
    .trim();
}
function closerWas(blocks) {
  const b = blocks.find((x) => x.block_type === 'lesson_complete');
  return String(b?.content?.html ?? '').trim();
}
function retrievalWas(blocks) {
  const b = blocks.find((x) => x.block_type === 'check' && STOCK.test(String(x.content?.prompt ?? '')));
  return b ? { id: b.id, prompt: String(b.content.prompt) } : null;
}

// ── markdown helpers ──────────────────────────────────────────────
function htmlToMd(html) {
  return String(html)
    .replace(/\s*<h2>([\s\S]*?)<\/h2>\s*/g, (_, t) => `**${t.trim()}**\n\n`)
    .replace(/<blockquote>\s*<p>([\s\S]*?)<\/p>\s*<\/blockquote>/g, (_, t) => `> ${t.trim()}\n\n`)
    .replace(/<\/?(?:ol|ul)>/g, '\n')
    .replace(/<li>([\s\S]*?)<\/li>/g, (_, t) => `- ${t.trim()}\n`)
    .replace(/<p>([\s\S]*?)<\/p>/g, (_, t) => `${t.trim()}\n\n`)
    .replace(/<strong>([\s\S]*?)<\/strong>/g, '**$1**')
    .replace(/<em>([\s\S]*?)<\/em>/g, '*$1*')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
function mdQuote(text) {
  return text.split('\n').map((l) => (l ? `> ${l}` : '>')).join('\n');
}

const STATUS_LABEL = { named: 'already the name', title: 'in the title', new: 'proposed' };

const lessons = LESSONS.map((L) => {
  const { title, blocks } = loadSpec(L.slug);
  return {
    ...L,
    title,
    openerWas: openerWas(blocks),
    closerWas: closerWas(blocks),
    retrievalWas: retrievalWas(blocks),
  };
});
lessons.sort((a, b) => a.title.localeCompare(b.title));

// Sanity: every stock stem in the corpus has a proposal.
const stockCount = lessons.filter((l) => l.retrievalWas).length;
const proposalCount = lessons.filter((l) => l.retrieval).length;
if (stockCount !== proposalCount) {
  const missing = lessons.filter((l) => l.retrievalWas && !l.retrieval).map((l) => l.slug);
  const extra = lessons.filter((l) => !l.retrievalWas && l.retrieval).map((l) => l.slug);
  throw new Error(`retrieval mismatch: stock=${stockCount} proposals=${proposalCount} missing=${missing} extra=${extra}`);
}

// ── markdown ──────────────────────────────────────────────────────
const md = [];
md.push(`# Lesson Voice Rewrites — 2026-09

> **Status: Living — plan step 6.2, for tutor approval.** Drafted
> 2026-09-03 from the house voice guide (authoring guide §2c) against the
> shipped specs. Every "Was" below is the live spec text at drafting
> time; every "Proposed" is the replacement the AI would apply **on
> approval** — nothing here is in a spec yet. Reply on the review page
> or edit this file: approve, change the wording, or say keep. Names are
> the tutor team's call (plan 6.5): a name must be words a tutor actually
> says in session.

## The four decisions that apply to every lesson
`);
for (const d of DECISIONS) md.push(`### ${d.title}\n\n${d.body}\n`);

md.push(`## Names

| Lesson | Proposed handle | Status | Why |
|---|---|---|---|`);
for (const l of lessons) {
  md.push(`| ${l.title} | **${l.name.proposed}** | ${STATUS_LABEL[l.name.status]} | ${l.name.why} |`);
}
md.push('');
md.push(`## Per lesson

Each section shows only what changes. "Keep" means the current text already
does the job. Block ids are the stable reference; the intro card and the
opener's \`<h2>\` are untouched in every proposal.
`);
for (const l of lessons) {
  md.push(`### ${l.title}\n`);
  md.push(`**Handle:** ${l.name.proposed} *(${STATUS_LABEL[l.name.status]})* — ${l.name.why}\n`);
  md.push(`**Opener** (block 1, below the card)\n`);
  if (l.opener) {
    md.push(`Was:\n\n${mdQuote(htmlToMd(l.openerWas))}\n\nProposed:\n\n${mdQuote(htmlToMd(l.opener))}\n`);
  } else {
    md.push(`Keep.\n`);
  }
  md.push(`**Closer** (\`lesson_complete\`)\n`);
  if (l.closer) {
    md.push(`Was:\n\n${mdQuote(htmlToMd(l.closerWas))}\n\nProposed:\n\n${mdQuote(htmlToMd(l.closer))}\n`);
  } else {
    md.push(`Keep.\n`);
  }
  if (l.retrievalWas) {
    md.push(`**Retrieval stem** (\`${l.retrievalWas.id}\`; choices unchanged)\n`);
    md.push(`Was:\n\n${mdQuote(l.retrievalWas.prompt)}\n\nProposed:\n\n${mdQuote(l.retrieval)}\n`);
  }
  if (l.notes) md.push(`**Notes:** ${l.notes}\n`);
}
md.push(`## The twelve "Next, you will…" tails

Deleted on approval — the explanation keeps its answer and loses the preview.

| Lesson | Step | Block | Sentence |
|---|---|---|---|`);
for (const [slug, step, id, sentence] of TAILS) {
  const t = lessons.find((l) => l.slug === slug)?.title ?? slug;
  md.push(`| ${t} | ${step} | \`${id}\` | ${sentence} |`);
}
md.push('');
fs.writeFileSync(path.join(ROOT, 'docs/lesson-voice-rewrites-2026-09.md'), md.join('\n'));

// ── html ──────────────────────────────────────────────────────────
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Our own HTML (spec text and proposals) renders as HTML; LaTeX spans get a
// mono treatment so \( … \) reads as math without a typesetter.
const tex = (html) => String(html).replace(/\\\((.*?)\\\)/g, (_, t) => `<span class="tex">${esc(t)}</span>`);
const pair = (label, was, proposed, meta = '') => `
  <div class="pair">
    <div class="pair-head"><span class="field">${label}</span>${meta ? `<span class="meta">${meta}</span>` : ''}</div>
    <div class="cols">
      <div class="col was"><span class="eyebrow">Was</span><div class="prose">${tex(was)}</div></div>
      <div class="col now"><span class="eyebrow">Proposed</span><div class="prose">${tex(proposed)}</div></div>
    </div>
  </div>`;
const keep = (label, note) => `
  <div class="pair keep"><div class="pair-head"><span class="field">${label}</span><span class="meta">keep</span></div>${note ? `<p class="keepnote">${note}</p>` : ''}</div>`;

const sections = lessons.map((l) => `
<section class="lesson" id="${l.slug}">
  <header class="lesson-head">
    <p class="lesson-title">${esc(l.title)}</p>
    <h2 class="handle">${esc(l.name.proposed)} <span class="status status-${l.name.status}">${STATUS_LABEL[l.name.status]}</span></h2>
    <p class="why">${tex(esc(l.name.why))}</p>
  </header>
  ${l.opener ? pair('Opener', l.openerWas, l.opener, 'block 1, below the card') : keep('Opener', 'The current body already sets up the first activity without an agenda.')}
  ${l.closer ? pair('Closer', l.closerWas, l.closer, 'lesson_complete') : keep('Closer', 'Already a sign-off in voice.')}
  ${l.retrievalWas ? pair('Retrieval stem', `<p>${esc(l.retrievalWas.prompt)}</p>`, `<p>${l.retrieval}</p>`, `${esc(l.retrievalWas.id)} · choices unchanged`) : ''}
  ${l.notes ? `<p class="notes">${tex(esc(l.notes))}</p>` : ''}
</section>`).join('\n');

const roster = lessons.map((l) => `
  <tr><td><a href="#${l.slug}">${esc(l.title)}</a></td><td class="handle-cell">${esc(l.name.proposed)}</td><td><span class="status status-${l.name.status}">${STATUS_LABEL[l.name.status]}</span></td></tr>`).join('');

const decisions = DECISIONS.map((d, i) => `
  <li><h3>${esc(d.title)}</h3><p>${esc(d.body)}</p></li>`).join('');

const tails = TAILS.map(([slug, step, id, sentence]) => {
  const t = lessons.find((l) => l.slug === slug)?.title ?? slug;
  return `<tr><td>${esc(t)}</td><td class="num">${step}</td><td class="mono">${esc(id)}</td><td>${esc(sentence)}</td></tr>`;
}).join('');

const html = `<title>Lesson Voice Rewrites</title>
<meta charset="utf-8">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,600;1,7..72,400&family=Source+Sans+3:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400&display=swap">
<style>
  :root {
    --ground: #f6f7f9; --panel: #ffffff; --ink: #17212c; --muted: #5f6d7d; --rule: #d9dee5;
    --accent: #102a43; --accent-soft: rgba(16,42,67,0.07);
    --was: #9c5a3a; --was-soft: rgba(156,90,58,0.08);
    --now: #2f6e52; --now-soft: rgba(47,110,82,0.09);
    --serif: 'Literata', Georgia, 'Times New Roman', serif;
    --sans: 'Source Sans 3', 'Segoe UI', Helvetica, Arial, sans-serif;
    --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
  }
  @media (prefers-color-scheme: dark) {
    :root:not([data-theme="light"]) {
      --ground: #0f1620; --panel: #151e2a; --ink: #e7ecf2; --muted: #98a5b3; --rule: #26303c;
      --accent: #a9c1df; --accent-soft: rgba(169,193,223,0.12);
      --was: #d9a184; --was-soft: rgba(217,161,132,0.12);
      --now: #8ccaa5; --now-soft: rgba(140,202,165,0.12);
    }
  }
  :root[data-theme="dark"] {
    --ground: #0f1620; --panel: #151e2a; --ink: #e7ecf2; --muted: #98a5b3; --rule: #26303c;
    --accent: #a9c1df; --accent-soft: rgba(169,193,223,0.12);
    --was: #d9a184; --was-soft: rgba(217,161,132,0.12);
    --now: #8ccaa5; --now-soft: rgba(140,202,165,0.12);
  }
  body { margin: 0; background: var(--ground); color: var(--ink); font-family: var(--sans); font-size: 16px; line-height: 1.55; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 40px 24px 96px; }
  header.page { max-width: 68ch; }
  .kicker { font-family: var(--sans); text-transform: uppercase; letter-spacing: 0.12em; font-size: 12px; color: var(--muted); margin: 0 0 12px; }
  h1 { font-family: var(--serif); font-weight: 600; font-size: 38px; line-height: 1.12; letter-spacing: -0.01em; margin: 0 0 16px; text-wrap: balance; }
  .lede { font-size: 18px; color: var(--ink); margin: 0 0 12px; }
  .respond { border-left: 3px solid var(--accent); padding: 10px 14px; background: var(--accent-soft); color: var(--ink); margin: 20px 0 0; max-width: 68ch; }
  .respond strong { color: var(--accent); }
  h2.section { font-family: var(--serif); font-weight: 600; font-size: 26px; margin: 56px 0 14px; letter-spacing: -0.005em; text-wrap: balance; }
  ol.decisions { list-style: none; padding: 0; margin: 0; display: grid; gap: 14px; }
  ol.decisions li { background: var(--panel); border: 1px solid var(--rule); padding: 16px 18px; }
  ol.decisions h3 { font-family: var(--serif); font-size: 19px; font-weight: 600; margin: 0 0 6px; }
  ol.decisions p { margin: 0; color: var(--ink); max-width: 80ch; }
  table { border-collapse: collapse; width: 100%; font-size: 15px; }
  .tablewrap { overflow-x: auto; border: 1px solid var(--rule); background: var(--panel); }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--muted); font-weight: 600; padding: 10px 12px; border-bottom: 1px solid var(--rule); }
  td { padding: 9px 12px; border-bottom: 1px solid var(--rule); vertical-align: top; }
  tr:last-child td { border-bottom: 0; }
  td a { color: var(--ink); text-decoration: none; border-bottom: 1px solid var(--rule); }
  td a:hover, td a:focus-visible { border-bottom-color: var(--accent); outline: none; }
  .handle-cell { font-family: var(--serif); font-weight: 600; white-space: nowrap; }
  .num { font-variant-numeric: tabular-nums; text-align: right; }
  .mono, .tex { font-family: var(--mono); font-size: 0.92em; }
  .status { display: inline-block; font-family: var(--sans); font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; padding: 2px 8px; border-radius: 999px; vertical-align: middle; }
  .status-named { background: var(--now-soft); color: var(--now); }
  .status-title { background: var(--accent-soft); color: var(--accent); }
  .status-new { background: var(--was-soft); color: var(--was); }
  section.lesson { border-top: 1px solid var(--rule); padding: 32px 0 8px; }
  .lesson-title { margin: 0 0 4px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.1em; color: var(--muted); }
  h2.handle { font-family: var(--serif); font-weight: 600; font-size: 28px; margin: 0 0 6px; letter-spacing: -0.01em; }
  h2.handle .status { margin-left: 10px; }
  .why { margin: 0 0 18px; color: var(--muted); max-width: 70ch; }
  .pair { margin: 0 0 18px; }
  .pair-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 8px; }
  .field { font-weight: 600; font-size: 15px; }
  .meta { font-family: var(--mono); font-size: 12px; color: var(--muted); }
  .cols { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
  @media (max-width: 720px) { .cols { grid-template-columns: 1fr; } }
  .col { background: var(--panel); border: 1px solid var(--rule); padding: 14px 16px 12px; }
  .col.was { border-top: 3px solid var(--was); }
  .col.now { border-top: 3px solid var(--now); }
  .eyebrow { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; margin-bottom: 8px; }
  .was .eyebrow { color: var(--was); } .now .eyebrow { color: var(--now); }
  .prose { font-size: 15.5px; line-height: 1.55; max-width: 62ch; }
  .prose p { margin: 0 0 10px; } .prose p:last-child { margin-bottom: 0; }
  .prose h2 { font-family: var(--serif); font-size: 18px; font-weight: 600; margin: 0 0 8px; }
  .prose ul, .prose ol { margin: 6px 0 10px 20px; padding: 0; } .prose li { margin: 3px 0; }
  .prose blockquote { margin: 10px 0; padding: 8px 12px; border-left: 3px solid var(--accent); background: var(--accent-soft); }
  .prose blockquote p { margin: 0; }
  .col.was .prose { color: var(--muted); }
  .pair.keep .keepnote { margin: 0; color: var(--muted); font-size: 14.5px; }
  .notes { margin: 6px 0 0; font-size: 14.5px; color: var(--muted); max-width: 80ch; }
  .notes::before { content: 'Notes — '; font-weight: 600; color: var(--ink); }
  @media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth; } }
</style>
<div class="wrap">
  <header class="page">
    <p class="kicker">Lesson improvement plan · Phase 6.2 · for tutor approval</p>
    <h1>Every lesson's handle, opener, closer, and retrieval line — was, and proposed</h1>
    <p class="lede">The 2026-08 review's verdict on the suite was that it reads like a very careful teacher being recorded. What's missing isn't jokes; it's stakes, a point of view, and a name for the move. This page proposes that name and the two or three lines per lesson where voice does the most work. Nothing on it is in a lesson yet.</p>
    <p class="respond"><strong>How to respond:</strong> comment on this page, or edit <code class="mono">docs/lesson-voice-rewrites-2026-09.md</code>. For each lesson: approve, change the wording, or keep. Names are yours to choose — a handle has to be words a tutor actually says in session.</p>
  </header>

  <h2 class="section">Four decisions that apply to every lesson</h2>
  <ol class="decisions">${decisions}
  </ol>

  <h2 class="section">The names</h2>
  <div class="tablewrap"><table>
    <thead><tr><th>Lesson</th><th>Proposed handle</th><th>Status</th></tr></thead>
    <tbody>${roster}
    </tbody>
  </table></div>

  <h2 class="section">Lesson by lesson</h2>
  ${sections}

  <h2 class="section">The twelve "Next, you will…" tails</h2>
  <p class="notes" style="margin-bottom:12px">Deleted on approval — each explanation keeps its answer and loses the preview of the next slide.</p>
  <div class="tablewrap"><table>
    <thead><tr><th>Lesson</th><th class="num">Step</th><th>Block</th><th>Sentence</th></tr></thead>
    <tbody>${tails}</tbody>
  </table></div>
</div>
`;
fs.writeFileSync(OUT_HTML, html);

console.log(`lessons ${lessons.length}; openers proposed ${lessons.filter((l) => l.opener).length}; closers proposed ${lessons.filter((l) => l.closer).length}; retrieval stems ${proposalCount} (stock in corpus ${stockCount}); tails ${TAILS.length}`);
console.log('md bytes', fs.statSync(path.join(ROOT, 'docs/lesson-voice-rewrites-2026-09.md')).size, '| html', OUT_HTML, fs.statSync(OUT_HTML).size, 'bytes');
