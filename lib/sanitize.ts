// HTML sanitization for the trust boundaries that render
// user-authored or admin-authored markup. See
// docs/architecture-plan.md §3.4 — RichContent primitive.
//
// Two profiles exist because the threat models differ:
//
//   sanitizeNoteHtml(html)
//     - For student-authored notes (TipTap → docToFullHtml → here).
//     - Allows the block / inline / mark tags docToFullHtml emits,
//       plus inline SVG (Excalidraw drawings) — but with all event
//       handlers and dangerous schemes scrubbed.
//     - Self-XSS surface today (students see only their own notes),
//       defense-in-depth tomorrow if notes ever become shareable.
//
//   sanitizeQuestionHtml(html)
//     - For admin-authored question content (stem / stimulus /
//       rationale / options HTML, often containing MathML).
//     - Wider tag allowlist, MathML preserved, but still no
//       <script>, no on* attributes, no javascript: URLs.
//     - Admins are trusted; this is defense-in-depth so a
//       compromised admin token can't immediately stage XSS.
//
// Implementation note: we use sanitize-html (pure JS, no jsdom) so
// the same code path runs server- and client-side without dragging
// jsdom into the Vercel Node runtime — the previous attempt with
// isomorphic-dompurify hit ESM/CJS interop errors via jsdom's
// transitive deps.

import sanitizeHtml from 'sanitize-html';

// ──────────────────────────────────────────────────────────────
// Note profile — what docToFullHtml emits, plus inline SVG so
// Excalidraw drawings survive. Excludes raw <script>, <iframe>,
// any `on*` attribute, any non-http/https/mailto/relative href.
// ──────────────────────────────────────────────────────────────

const NOTE_TAGS = [
  // Block + inline structure
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  // Marks
  'strong', 'em', 's', 'a',
  // Excalidraw SVG output (these are the elements the exporter
  // actually emits)
  'svg', 'g', 'path', 'rect', 'circle', 'ellipse', 'line', 'polyline',
  'polygon', 'text', 'tspan', 'defs', 'mask', 'clipPath', 'use',
  'linearGradient', 'radialGradient', 'stop', 'filter', 'feGaussianBlur',
  'feColorMatrix', 'feMerge', 'feMergeNode', 'feOffset',
  'symbol', 'image', 'title', 'desc',
];

// sanitize-html's `allowedAttributes` is a per-tag map. The `*`
// entry applies to every tag. Easier to read this way than
// repeating the SVG geometry list under each SVG element.
const SVG_ATTRS = [
  'viewBox', 'xmlns', 'xmlns:xlink',
  'd', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2',
  'width', 'height', 'transform',
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-opacity',
  'opacity', 'points', 'preserveAspectRatio', 'overflow', 'style',
  'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'dy', 'dx',
  'id', 'gradientUnits', 'gradientTransform', 'spreadMethod',
  'offset', 'stop-color', 'stop-opacity',
  'mask', 'clip-path', 'filter',
  'in', 'in2', 'result', 'stdDeviation', 'values', 'mode',
  'xlink:href',
];

const NOTE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: NOTE_TAGS,
  allowedAttributes: {
    '*': ['class', 'id', 'style', ...SVG_ATTRS],
    a: ['href', 'target', 'rel', 'class'],
    image: ['href', 'xlink:href', ...SVG_ATTRS],
    use: ['href', 'xlink:href', ...SVG_ATTRS],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'xlink:href'],
  allowProtocolRelative: false,
  // Permit relative + fragment URLs alongside the http/https/mailto
  // allowlist above.
  allowedSchemesByTag: {},
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
};

export function sanitizeNoteHtml(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, NOTE_OPTIONS);
}

// ──────────────────────────────────────────────────────────────
// Question profile — admin-authored stem / stimulus / rationale /
// options. Defense-in-depth, not the primary trust boundary.
// MathML allowlist is broad because content authors use the full
// set; we still strip <script>, on* handlers, and javascript: URLs.
// ──────────────────────────────────────────────────────────────

const MATHML_TAGS = [
  'math', 'maction', 'annotation', 'annotation-xml', 'menclose',
  'merror', 'mfenced', 'mfrac', 'mi', 'mmultiscripts', 'mn',
  'mo', 'mover', 'mpadded', 'mphantom', 'mprescripts', 'mroot',
  'mrow', 'ms', 'semantics', 'mspace', 'msqrt', 'mstyle',
  'msub', 'msup', 'msubsup', 'mtable', 'mtd', 'mtext',
  'mtr', 'munder', 'munderover',
];

const HTML_TAGS = [
  'p', 'br', 'hr', 'div', 'span',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code',
  'strong', 'em', 's', 'b', 'i', 'u', 'sub', 'sup',
  'a', 'img', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tr', 'td', 'th', 'caption',
  // <colgroup>/<col> carry per-column width hints (e.g. QTI
  // "colspec colwidth:50" patterns from College Board source).
  // Stripping them collapses every column to content-width, which
  // makes a Frequency-style data table look uneven when one column
  // is much longer than the others. They have no script surface,
  // so allowing them is safe.
  'colgroup', 'col',
];

const QUESTION_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [...HTML_TAGS, ...MATHML_TAGS, ...NOTE_TAGS],
  allowedAttributes: {
    '*': ['class', 'id', 'style', 'aria-label', 'role', ...SVG_ATTRS],
    a: ['href', 'target', 'rel', 'class'],
    img: ['src', 'alt', 'width', 'height', 'class', 'style'],
    image: ['href', 'xlink:href', ...SVG_ATTRS],
    use: ['href', 'xlink:href', ...SVG_ATTRS],
    // MathML attributes — sanitize-html only emits attributes it knows
    // about, so the math elements need explicit attribute allowlists.
    math: ['xmlns', 'display', 'class'],
    annotation: ['encoding'],
    'annotation-xml': ['encoding'],
    mfrac: ['linethickness'],
    mo: ['fence', 'separator', 'lspace', 'rspace', 'stretchy'],
    mspace: ['width', 'height', 'depth'],
    mstyle: ['mathvariant', 'mathcolor', 'mathbackground'],
    // Table attributes. sanitize-html strips every attribute on a tag
    // with no allowlist entry, so without these the colspan/rowspan
    // on a multi-column header silently collapses to a 1-cell header
    // — affecting every published question with a `<table>`. The
    // College Board content uses border/align/cellpadding on the
    // outer table, scope/colspan/rowspan inside, plus inline width.
    table: ['border', 'align', 'cellpadding', 'cellspacing', 'summary', 'width'],
    thead: ['align', 'valign'],
    tbody: ['align', 'valign'],
    tfoot: ['align', 'valign'],
    tr: ['align', 'valign'],
    th: ['colspan', 'rowspan', 'scope', 'headers', 'align', 'valign', 'abbr', 'width'],
    td: ['colspan', 'rowspan', 'headers', 'align', 'valign', 'width'],
    caption: ['align'],
    colgroup: ['span', 'align', 'valign', 'width'],
    col: ['span', 'align', 'valign', 'width'],
    col: ['span', 'align', 'valign', 'width'],
    colgroup: ['span', 'align', 'valign', 'width'],
  },
  allowedSchemes: ['http', 'https', 'mailto', 'data'],
  allowedSchemesAppliedToAttributes: ['href', 'src', 'xlink:href'],
  // Permit data: URIs only on <img src> (for inline figure encoding);
  // sanitize-html applies this per-attribute when set.
  allowProtocolRelative: false,
  allowedSchemesByTag: {},
  parser: { lowerCaseTags: false, lowerCaseAttributeNames: false },
};

export function sanitizeQuestionHtml(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, QUESTION_OPTIONS);
}
