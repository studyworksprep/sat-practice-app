// Serialize a ProseMirror document (the JSON shape produced by the
// admin authoring editor's TipTap instances) into the clean,
// consistent HTML the questions_v2 bank uses.
//
// Why a hand-written serializer instead of TipTap's getHTML():
//   - The bank has precise conventions that TipTap's default DOM
//     serialization does not match: <p class="stem_paragraph"> /
//     <p class="stimulus_paragraph">, <table class="stimulus_table">,
//     math written as literal \( … \) / \[ … \] TeX delimiters
//     (NOT MathML, NOT escaped), and options as bare LaTeX/text with
//     no wrapping <p>. See lib/questionsV2FixPrompt.js for the full
//     spec these outputs mirror.
//   - The input doc is schema-constrained (TipTap drops anything not
//     in the editor schema, including on paste), and this serializer
//     only ever emits a fixed whitelist of tags, so the output is
//     safe by construction without a lossy HTML-sanitizer pass that
//     would corrupt the literal `<` inside math like \(0 < a < b\).
//
// The four "kinds" map to the four question surfaces and differ only
// in how top-level paragraphs are wrapped:
//   stem      → <p class="stem_paragraph">
//   stimulus  → <p class="stimulus_paragraph">  (+ tables, centered
//               display-equation paragraphs)
//   rationale → plain <p>
//   option    → no wrapper at all; bare inline content / bare LaTeX

export type BankFieldKind = 'stem' | 'stimulus' | 'rationale' | 'option';

// Custom node names used by the authoring editor's math extensions.
export const MATH_INLINE_NODE = 'mathInline';
export const MATH_BLOCK_NODE = 'mathBlock';

// ── Loose ProseMirror JSON shapes ───────────────────────────────
interface PMMark { type: string; attrs?: Record<string, unknown> }
interface PMNode {
  type: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: PMMark[];
  content?: PMNode[];
}

// ── HTML escaping ───────────────────────────────────────────────
// Prose text is escaped so authored content can't inject markup.
// Math LaTeX is deliberately NOT escaped: the bank stores literal
// `<`, `>`, `&` inside \( … \) (e.g. \(0 < a < b\)) and MathJax
// consumes them verbatim. Escaping there would change the rendered
// math.
function escapeText(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s: string): string {
  return escapeText(s).replace(/"/g, '&quot;');
}

// ── Inline serialization ────────────────────────────────────────
function wrapMarks(html: string, marks: PMMark[] | undefined): string {
  if (!marks || marks.length === 0) return html;
  let out = html;
  // Apply in a stable order so nesting is deterministic. Only the
  // emphasis marks the editor exposes are honored; anything else is
  // dropped to prose (its text already survives).
  for (const mark of marks) {
    if (mark.type === 'bold') out = `<strong>${out}</strong>`;
    else if (mark.type === 'italic') out = `<em>${out}</em>`;
    else if (mark.type === 'code') out = `<code>${out}</code>`;
  }
  return out;
}

function serializeInline(nodes: PMNode[] | undefined): string {
  if (!nodes || nodes.length === 0) return '';
  let out = '';
  for (const node of nodes) {
    if (node.type === 'text') {
      out += wrapMarks(escapeText(node.text ?? ''), node.marks);
    } else if (node.type === MATH_INLINE_NODE) {
      const latex = String(node.attrs?.latex ?? '').trim();
      if (latex) out += `\\(${latex}\\)`;
    } else if (node.type === MATH_BLOCK_NODE) {
      // A display equation living inside running text (rare) — keep
      // it inline as \[ … \].
      const latex = String(node.attrs?.latex ?? '').trim();
      if (latex) out += `\\[${latex}\\]`;
    } else if (node.type === 'hardBreak') {
      out += '<br>';
    } else if (node.type === 'image') {
      out += serializeImage(node);
    }
  }
  return out;
}

function serializeImage(node: PMNode): string {
  const src = String(node.attrs?.src ?? '');
  if (!src) return '';
  const alt = escapeAttr(String(node.attrs?.alt ?? ''));
  return `<img src="${escapeAttr(src)}" alt="${alt}" style="max-width:100%;" />`;
}

// Cell content: a table cell holds block content (paragraphs) in
// ProseMirror, but the bank renders cells as inline. Flatten the
// cell's paragraphs to their inline serialization, joined by a
// space, and collapse a lone display-equation to inline \[ … \].
function serializeCellContent(content: PMNode[] | undefined): string {
  if (!content || content.length === 0) return '';
  const parts: string[] = [];
  for (const block of content) {
    if (block.type === 'paragraph') {
      parts.push(serializeInline(block.content));
    } else if (block.type === MATH_BLOCK_NODE) {
      const latex = String(block.attrs?.latex ?? '').trim();
      if (latex) parts.push(`\\[${latex}\\]`);
    }
  }
  return parts.filter(Boolean).join(' ');
}

// ── Table serialization ─────────────────────────────────────────
function spanAttrs(attrs: Record<string, unknown> | undefined): string {
  let out = '';
  const colspan = Number(attrs?.colspan ?? 1);
  const rowspan = Number(attrs?.rowspan ?? 1);
  if (colspan > 1) out += ` colspan="${colspan}"`;
  if (rowspan > 1) out += ` rowspan="${rowspan}"`;
  return out;
}

function serializeTable(node: PMNode): string {
  const rows: string[] = [];
  for (const row of node.content ?? []) {
    if (row.type !== 'tableRow') continue;
    const cells: string[] = [];
    for (const cell of row.content ?? []) {
      const tag = cell.type === 'tableHeader' ? 'th' : 'td';
      cells.push(`<${tag}${spanAttrs(cell.attrs)}>${serializeCellContent(cell.content)}</${tag}>`);
    }
    rows.push(`<tr>${cells.join('')}</tr>`);
  }
  return `<table class="stimulus_table">${rows.join('')}</table>`;
}

// ── Block serialization ─────────────────────────────────────────
function paragraphTag(kind: BankFieldKind): { open: string; openCentered: string; close: string } {
  switch (kind) {
    case 'stem':
      return {
        open: '<p class="stem_paragraph">',
        openCentered: '<p class="stem_paragraph" align="Center">',
        close: '</p>',
      };
    case 'stimulus':
      return {
        open: '<p class="stimulus_paragraph">',
        openCentered: '<p class="stimulus_paragraph" align="Center">',
        close: '</p>',
      };
    case 'rationale':
    default:
      return { open: '<p>', openCentered: '<p align="Center">', close: '</p>' };
  }
}

// Serialize a full document for one of the prose surfaces (stem /
// stimulus / rationale).
function serializeProse(doc: PMNode, kind: BankFieldKind): string {
  const tag = paragraphTag(kind);
  const out: string[] = [];
  for (const block of doc.content ?? []) {
    if (block.type === 'paragraph') {
      const inner = serializeInline(block.content);
      if (inner === '') continue; // drop empty paragraphs
      out.push(`${tag.open}${inner}${tag.close}`);
    } else if (block.type === MATH_BLOCK_NODE) {
      // Standalone display equation → its own centered paragraph,
      // matching the bank's `<p class="…" align="Center">\[ … \]</p>`.
      const latex = String(block.attrs?.latex ?? '').trim();
      if (latex) out.push(`${tag.openCentered}\\[${latex}\\]${tag.close}`);
    } else if (block.type === 'table') {
      out.push(serializeTable(block));
    } else if (block.type === 'image') {
      // A figure on its own line — wrap in the kind's paragraph so it
      // sits in the flow like the bank's image paragraphs.
      out.push(`${tag.open}${serializeImage(block)}${tag.close}`);
    }
  }
  return out.join('');
}

// Serialize an option document: NO paragraph wrapper. A lone display
// equation becomes bare \[ … \]; everything else is inline content.
function serializeOption(doc: PMNode): string {
  const blocks = doc.content ?? [];
  const parts: string[] = [];
  for (const block of blocks) {
    if (block.type === 'paragraph') {
      const inner = serializeInline(block.content);
      if (inner !== '') parts.push(inner);
    } else if (block.type === MATH_BLOCK_NODE) {
      const latex = String(block.attrs?.latex ?? '').trim();
      if (latex) parts.push(`\\[${latex}\\]`);
    } else if (block.type === 'image') {
      parts.push(serializeImage(block));
    } else if (block.type === 'table') {
      parts.push(serializeTable(block));
    }
  }
  // Multiple paragraphs in an option are unusual; join with a space
  // so the option stays a single bare string.
  return parts.join(' ');
}

/**
 * Serialize a ProseMirror doc JSON into bank HTML for the given
 * surface. Returns an empty string for an empty document; callers
 * decide whether empty means NULL (stimulus/rationale) or invalid
 * (stem).
 */
export function docToBankHtml(doc: PMNode | null | undefined, kind: BankFieldKind): string {
  if (!doc || !doc.content || doc.content.length === 0) return '';
  if (kind === 'option') return serializeOption(doc);
  return serializeProse(doc, kind);
}

/**
 * Convenience: serialize and coerce an empty result to null, for the
 * nullable columns (stimulus_html, rationale_html).
 */
export function docToBankHtmlOrNull(doc: PMNode | null | undefined, kind: BankFieldKind): string | null {
  const html = docToBankHtml(doc, kind);
  return html === '' ? null : html;
}
